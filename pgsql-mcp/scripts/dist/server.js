#!/usr/bin/env node
/**
 * PostgreSQL MCP Server - Smart multi-datasource support
 *
 * Features:
 * - YAML configuration with global + project-level support
 * - Natural language datasource matching
 * - Smart hint-based datasource selection
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { Pool } from "pg";
import { z } from "zod";
import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
// Configuration loader
class ConfigManager {
    configs = new Map();
    configPaths = [];
    constructor() {
        this.loadConfigs();
    }
    loadConfigs() {
        // 1. Load global config
        const globalConfigPath = path.join(os.homedir(), '.claude', 'pgsql-mcp', 'config.yaml');
        if (fs.existsSync(globalConfigPath)) {
            this.loadConfigFile(globalConfigPath);
            this.configPaths.push(globalConfigPath);
        }
        // 2. Load project config (overrides global)
        const projectConfigPath = path.join(process.cwd(), '.pgsql-mcp.yaml');
        if (fs.existsSync(projectConfigPath)) {
            this.loadConfigFile(projectConfigPath);
            this.configPaths.push(projectConfigPath);
        }
        // 3. Load from environment variable
        const envConfigPath = process.env.PGSQL_MCP_CONFIG;
        if (envConfigPath && fs.existsSync(envConfigPath)) {
            this.loadConfigFile(envConfigPath);
            this.configPaths.push(envConfigPath);
        }
        // 4. Fallback to env-based config
        if (this.configs.size === 0) {
            this.loadFromEnvironment();
        }
    }
    passwordCache = new Map();
    loadPasswordFile(filePath) {
        try {
            const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
            if (!fs.existsSync(fullPath))
                return;
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#'))
                    continue;
                const eqIndex = trimmed.indexOf('=');
                if (eqIndex > 0) {
                    const key = trimmed.substring(0, eqIndex).trim();
                    const value = trimmed.substring(eqIndex + 1).trim();
                    this.passwordCache.set(key, value);
                }
            }
        }
        catch (err) {
            console.error(`Failed to load password file ${filePath}:`, err);
        }
    }
    resolvePassword(id, ds, configFilePath) {
        // Priority 1: Direct password (not recommended)
        if (ds.password) {
            return ds.password;
        }
        // Priority 2: Environment variable
        if (ds.password_env) {
            const envPassword = process.env[ds.password_env];
            if (envPassword)
                return envPassword;
        }
        // Priority 3: Password file
        if (ds.password_file) {
            // Load password file if not cached
            if (this.passwordCache.size === 0) {
                this.loadPasswordFile(ds.password_file);
            }
            // Try multiple key patterns to find password
            const keysToTry = [];
            // Pattern 1: Explicit password_env pointing to file key
            if (ds.password_env) {
                keysToTry.push(ds.password_env);
            }
            // Pattern 2: Datasource ID based keys
            const idUpper = id.toUpperCase();
            if (idUpper) {
                keysToTry.push(`${idUpper}_PASSWORD`);
                keysToTry.push(`${idUpper}_PWD`);
            }
            // Pattern 3: Datasource name based keys
            if (ds.name) {
                const nameKey = ds.name.toUpperCase().replace(/[\s-]+/g, '_');
                keysToTry.push(`${nameKey}_PASSWORD`);
                keysToTry.push(`${nameKey}_PWD`);
                keysToTry.push(nameKey);
            }
            // Pattern 4: Common project prefixes (try HCYY_LMP, etc.)
            keysToTry.push(`HCYY_LMP_${idUpper}_PWD`);
            keysToTry.push(`HCYY_LMP_${idUpper}_PASSWORD`);
            // Pattern 5: Simple ID keys (DEV, TEST, etc.)
            keysToTry.push(idUpper);
            keysToTry.push(`${idUpper}_PASS`);
            // Try all keys
            for (const key of keysToTry) {
                if (this.passwordCache.has(key)) {
                    return this.passwordCache.get(key);
                }
            }
        }
        return '';
    }
    loadConfigFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const config = yaml.load(content);
            if (config?.datasources) {
                for (const [id, ds] of Object.entries(config.datasources)) {
                    // Resolve password from various sources
                    const password = this.resolvePassword(id, ds, filePath);
                    this.configs.set(id, {
                        ...ds,
                        password,
                        port: ds.port || 5432,
                        ssl: ds.ssl || false,
                        readonly: ds.readonly || false,
                    });
                }
            }
        }
        catch (err) {
            console.error(`Failed to load config from ${filePath}:`, err);
        }
    }
    loadFromEnvironment() {
        const dsNames = process.env.DATASOURCES?.split(',').map(s => s.trim()) || ['default'];
        for (const name of dsNames) {
            const suffix = name === 'default' ? '' : `_${name}`;
            this.configs.set(name, {
                name: name,
                host: process.env[`PG_HOST${suffix}`] || process.env.PG_HOST || "localhost",
                port: parseInt(process.env[`PG_PORT${suffix}`] || process.env.PG_PORT || "5432"),
                database: process.env[`PG_DATABASE${suffix}`] || process.env.PG_DATABASE || "postgres",
                username: process.env[`PG_USER${suffix}`] || process.env.PG_USER || "postgres",
                password: process.env[`PG_PASSWORD${suffix}`] || process.env.PG_PASSWORD || "",
                ssl: (process.env[`PG_SSL${suffix}`] || process.env.PG_SSL) === "true",
            });
        }
    }
    getDataSource(id) {
        return this.configs.get(id);
    }
    getAllDataSources() {
        return Array.from(this.configs.entries()).map(([id, config]) => ({ id, config }));
    }
    // Smart matching based on hint
    matchDataSource(hint) {
        const hintLower = hint.toLowerCase().trim();
        // 1. Exact ID match
        if (this.configs.has(hintLower)) {
            return hintLower;
        }
        let bestMatch;
        for (const [id, config] of this.configs) {
            let score = 0;
            // 2. Name exact match (highest priority)
            if (config.name.toLowerCase() === hintLower) {
                return id;
            }
            if (config.name.toLowerCase().includes(hintLower)) {
                score = 100;
            }
            // 3. Tags match
            for (const tag of config.tags || []) {
                const tagLower = tag.toLowerCase();
                if (hintLower.includes(tagLower)) {
                    score = Math.max(score, 80);
                }
            }
            // 4. Description keywords match
            const desc = config.description?.toLowerCase() || '';
            if (desc.includes(hintLower)) {
                score = Math.max(score, 60);
            }
            // 5. Partial name match
            const nameWords = config.name.toLowerCase().split(/[\s_-]+/);
            for (const word of nameWords) {
                if (hintLower.includes(word) && word.length > 1) {
                    score = Math.max(score, 40);
                }
            }
            if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                bestMatch = { id, score };
            }
        }
        return bestMatch?.id;
    }
    getConfigPaths() {
        return this.configPaths;
    }
}
// Connection pool manager
class ConnectionPoolManager {
    pools = new Map();
    configManager;
    constructor(configManager) {
        this.configManager = configManager;
    }
    getPool(idOrHint) {
        // First try exact ID
        let config = this.configManager.getDataSource(idOrHint);
        let id = idOrHint;
        // If not found, try smart matching
        if (!config) {
            const matchedId = this.configManager.matchDataSource(idOrHint);
            if (matchedId) {
                config = this.configManager.getDataSource(matchedId);
                id = matchedId;
            }
        }
        if (!config) {
            const available = this.configManager.getAllDataSources().map(ds => `${ds.id}(${ds.config.name})`).join(', ');
            throw new Error(`Unknown datasource "${idOrHint}". Available: ${available}`);
        }
        if (!this.pools.has(id)) {
            this.pools.set(id, new Pool({
                host: config.host,
                port: config.port,
                database: config.database,
                user: config.username,
                password: config.password,
                ssl: config.ssl,
            }));
        }
        return this.pools.get(id);
    }
    async closeAll() {
        for (const pool of this.pools.values()) {
            await pool.end();
        }
        this.pools.clear();
    }
}
// Initialize
const configManager = new ConfigManager();
const poolManager = new ConnectionPoolManager(configManager);
// Validation schemas with datasource_hint
const QuerySchema = z.object({
    datasource: z.string().optional().describe("Datasource ID or natural language hint"),
    sql: z.string().describe("SQL SELECT statement to execute"),
    params: z.array(z.any()).optional().describe("Query parameters"),
});
const DescribeTableSchema = z.object({
    datasource: z.string().optional().describe("Datasource ID or natural language hint"),
    table: z.string().describe("Table name to describe"),
});
const InsertSchema = z.object({
    datasource: z.string().optional().describe("Datasource ID or natural language hint"),
    table: z.string().describe("Target table name"),
    data: z.record(z.any()).describe("Object with column-value pairs"),
});
const UpdateSchema = z.object({
    datasource: z.string().optional().describe("Datasource ID or natural language hint"),
    table: z.string().describe("Target table name"),
    data: z.record(z.any()).describe("Object with column-value pairs to update"),
    where: z.string().describe("WHERE clause condition"),
    whereParams: z.array(z.any()).optional().describe("Parameters for WHERE clause"),
});
const DeleteSchema = z.object({
    datasource: z.string().optional().describe("Datasource ID or natural language hint"),
    table: z.string().describe("Target table name"),
    where: z.string().describe("WHERE clause condition"),
    whereParams: z.array(z.any()).optional().describe("Parameters for WHERE clause"),
});
const CreateTableSchema = z.object({
    datasource: z.string().optional().describe("Datasource ID or natural language hint"),
    name: z.string().describe("Table name"),
    columns: z.array(z.object({
        name: z.string(),
        type: z.string(),
        constraints: z.string().optional(),
    })).describe("Column definitions"),
});
const AlterTableSchema = z.object({
    datasource: z.string().optional().describe("Datasource ID or natural language hint"),
    table: z.string().describe("Table name"),
    operation: z.enum(["ADD_COLUMN", "DROP_COLUMN", "ALTER_COLUMN", "RENAME_COLUMN"]),
    column: z.object({
        name: z.string(),
        newName: z.string().optional(),
        type: z.string().optional(),
        constraints: z.string().optional(),
    }),
});
const DropTableSchema = z.object({
    datasource: z.string().optional().describe("Datasource ID or natural language hint"),
    table: z.string().describe("Table name to drop"),
    cascade: z.boolean().optional().describe("Drop dependent objects"),
});
const CreateIndexSchema = z.object({
    datasource: z.string().optional().describe("Datasource ID or natural language hint"),
    name: z.string().describe("Index name"),
    table: z.string().describe("Table name"),
    columns: z.array(z.string()).describe("Column names to index"),
    unique: z.boolean().optional(),
});
// Create MCP server
const server = new Server({
    name: "pgsql-mcp-server",
    version: "2.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "list_datasources",
                description: "List all configured datasources with their descriptions and tags",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "query",
                description: "Execute a SELECT query. Use 'datasource' parameter with ID or natural language like '开发环境', '测试库'",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint (e.g., '开发环境', '测试库', 'production')" },
                        sql: { type: "string", description: "SQL SELECT statement" },
                        params: { type: "array", description: "Query parameters" },
                    },
                    required: ["sql"],
                },
            },
            {
                name: "describe_table",
                description: "Get detailed information about a table structure",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        table: { type: "string", description: "Table name" },
                    },
                    required: ["table"],
                },
            },
            {
                name: "insert",
                description: "Insert a record into a table",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        table: { type: "string", description: "Table name" },
                        data: { type: "object", description: "Column-value pairs" },
                    },
                    required: ["table", "data"],
                },
            },
            {
                name: "update",
                description: "Update records in a table (requires WHERE clause)",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        table: { type: "string", description: "Table name" },
                        data: { type: "object", description: "Column-value pairs to update" },
                        where: { type: "string", description: "WHERE clause condition" },
                        whereParams: { type: "array", description: "Parameters for WHERE clause" },
                    },
                    required: ["table", "data", "where"],
                },
            },
            {
                name: "delete",
                description: "Delete records from a table (requires WHERE clause)",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        table: { type: "string", description: "Table name" },
                        where: { type: "string", description: "WHERE clause condition" },
                        whereParams: { type: "array", description: "Parameters for WHERE clause" },
                    },
                    required: ["table", "where"],
                },
            },
            {
                name: "create_table",
                description: "Create a new table",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        name: { type: "string", description: "Table name" },
                        columns: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    type: { type: "string" },
                                    constraints: { type: "string" },
                                },
                                required: ["name", "type"],
                            },
                        },
                    },
                    required: ["name", "columns"],
                },
            },
            {
                name: "alter_table",
                description: "Modify table structure",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        table: { type: "string", description: "Table name" },
                        operation: {
                            type: "string",
                            enum: ["ADD_COLUMN", "DROP_COLUMN", "ALTER_COLUMN", "RENAME_COLUMN"],
                        },
                        column: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                newName: { type: "string" },
                                type: { type: "string" },
                                constraints: { type: "string" },
                            },
                            required: ["name"],
                        },
                    },
                    required: ["table", "operation", "column"],
                },
            },
            {
                name: "drop_table",
                description: "Drop a table",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        table: { type: "string", description: "Table name" },
                        cascade: { type: "boolean", description: "Drop dependent objects" },
                    },
                    required: ["table"],
                },
            },
            {
                name: "create_index",
                description: "Create an index on a table",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        name: { type: "string", description: "Index name" },
                        table: { type: "string", description: "Table name" },
                        columns: { type: "array", items: { type: "string" } },
                        unique: { type: "boolean" },
                    },
                    required: ["name", "table", "columns"],
                },
            },
            {
                name: "list_functions",
                description: "List all functions in the database",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        schema: { type: "string", description: "Schema name (default: public)" },
                    },
                },
            },
            {
                name: "create_function",
                description: "Create a function",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        name: { type: "string", description: "Function name" },
                        parameters: { type: "string", description: "Function parameters (e.g., 'p_name VARCHAR, p_age INT')" },
                        returnType: { type: "string", description: "Return type (e.g., 'TABLE', 'INT', 'VOID')" },
                        body: { type: "string", description: "Function body (PL/pgSQL code)" },
                        language: { type: "string", description: "Language (default: plpgsql)" },
                        schema: { type: "string", description: "Schema name (default: public)" },
                    },
                    required: ["name", "body"],
                },
            },
            {
                name: "drop_function",
                description: "Drop a function",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        name: { type: "string", description: "Function name" },
                        parameters: { type: "string", description: "Function parameters signature (optional)" },
                        schema: { type: "string", description: "Schema name (default: public)" },
                        cascade: { type: "boolean", description: "Drop dependent objects" },
                    },
                    required: ["name"],
                },
            },
            {
                name: "list_procedures",
                description: "List all stored procedures in the database",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        schema: { type: "string", description: "Schema name (default: public)" },
                    },
                },
            },
            {
                name: "create_procedure",
                description: "Create a stored procedure",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        name: { type: "string", description: "Procedure name" },
                        parameters: { type: "string", description: "Procedure parameters (e.g., 'p_name VARCHAR, p_age INT')" },
                        body: { type: "string", description: "Procedure body (PL/pgSQL code)" },
                        language: { type: "string", description: "Language (default: plpgsql)" },
                        schema: { type: "string", description: "Schema name (default: public)" },
                    },
                    required: ["name", "body"],
                },
            },
            {
                name: "drop_procedure",
                description: "Drop a stored procedure",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        name: { type: "string", description: "Procedure name" },
                        parameters: { type: "string", description: "Procedure parameters signature (optional)" },
                        schema: { type: "string", description: "Schema name (default: public)" },
                    },
                    required: ["name"],
                },
            },
            {
                name: "list_triggers",
                description: "List all triggers in the database",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        table: { type: "string", description: "Filter by table name (optional)" },
                    },
                },
            },
            {
                name: "create_trigger",
                description: "Create a trigger",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        name: { type: "string", description: "Trigger name" },
                        table: { type: "string", description: "Table name" },
                        timing: { type: "string", enum: ["BEFORE", "AFTER", "INSTEAD OF"], description: "Trigger timing" },
                        events: { type: "array", items: { type: "string", enum: ["INSERT", "UPDATE", "DELETE", "TRUNCATE"] }, description: "Trigger events" },
                        function: { type: "string", description: "Trigger function to execute" },
                        forEach: { type: "string", enum: ["ROW", "STATEMENT"], description: "Trigger granularity" },
                        when: { type: "string", description: "WHEN condition (optional)" },
                        schema: { type: "string", description: "Schema name (default: public)" },
                    },
                    required: ["name", "table", "timing", "events", "function"],
                },
            },
            {
                name: "drop_trigger",
                description: "Drop a trigger",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        name: { type: "string", description: "Trigger name" },
                        table: { type: "string", description: "Table name" },
                        schema: { type: "string", description: "Schema name (default: public)" },
                        cascade: { type: "boolean", description: "Drop dependent objects" },
                    },
                    required: ["name", "table"],
                },
            },
            {
                name: "execute_routine",
                description: "Execute a function or stored procedure",
                inputSchema: {
                    type: "object",
                    properties: {
                        datasource: { type: "string", description: "Datasource ID or natural language hint" },
                        name: { type: "string", description: "Function or procedure name" },
                        parameters: { type: "array", items: { type: "any" }, description: "Parameters to pass" },
                        schema: { type: "string", description: "Schema name (default: public)" },
                    },
                    required: ["name"],
                },
            },
        ],
    };
});
// Tool implementations
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "list_datasources": {
                const sources = configManager.getAllDataSources().map(({ id, config }) => ({
                    id,
                    name: config.name,
                    description: config.description,
                    tags: config.tags,
                    host: config.host,
                    port: config.port,
                    database: config.database,
                    username: config.username,
                    ssl: config.ssl,
                    readonly: config.readonly,
                }));
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasources: sources,
                                configLoadedFrom: configManager.getConfigPaths(),
                            }, null, 2),
                        }],
                };
            }
            case "query": {
                const { sql, params = [], datasource = 'default' } = QuerySchema.parse(args);
                const pool = poolManager.getPool(datasource);
                const trimmedSql = sql.trim().toUpperCase();
                if (!trimmedSql.startsWith("SELECT")) {
                    throw new Error("Only SELECT queries are allowed with 'query' tool.");
                }
                const result = await pool.query(sql, params);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                columns: result.fields.map(f => f.name),
                                rows: result.rows,
                                rowCount: result.rowCount,
                            }, null, 2),
                        }],
                };
            }
            case "describe_table": {
                const { table, datasource = 'default' } = DescribeTableSchema.parse(args);
                const pool = poolManager.getPool(datasource);
                const [columnsResult, indexesResult, constraintsResult] = await Promise.all([
                    pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position
          `, [table]),
                    pool.query(`
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = $1
          `, [table]),
                    pool.query(`
            SELECT conname, contype, pg_get_constraintdef(oid) as def
            FROM pg_constraint
            WHERE conrelid = $1::regclass
          `, [table]),
                ]);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                table,
                                columns: columnsResult.rows,
                                indexes: indexesResult.rows,
                                constraints: constraintsResult.rows.map(c => ({
                                    name: c.conname,
                                    type: c.contype === 'p' ? 'PRIMARY KEY' : c.contype === 'f' ? 'FOREIGN KEY' : c.contype === 'u' ? 'UNIQUE' : c.contype,
                                    definition: c.def,
                                })),
                            }, null, 2),
                        }],
                };
            }
            case "insert": {
                const { table, data, datasource = 'default' } = InsertSchema.parse(args);
                const pool = poolManager.getPool(datasource);
                const columns = Object.keys(data);
                const values = Object.values(data);
                const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
                const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`;
                const result = await pool.query(sql, values);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                message: "Insert successful",
                                rowCount: result.rowCount,
                                inserted: result.rows[0],
                            }, null, 2),
                        }],
                };
            }
            case "update": {
                const { table, data, where, whereParams = [], datasource = 'default' } = UpdateSchema.parse(args);
                const pool = poolManager.getPool(datasource);
                if (!where || where.trim() === "") {
                    throw new Error("WHERE clause is required for UPDATE operations");
                }
                const columns = Object.keys(data);
                const values = Object.values(data);
                const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(", ");
                let whereClause = where;
                whereParams.forEach((_, i) => {
                    whereClause = whereClause.replace("?", `$${values.length + i + 1}`);
                });
                const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`;
                const result = await pool.query(sql, [...values, ...whereParams]);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                message: "Update successful",
                                rowCount: result.rowCount,
                                updated: result.rows,
                            }, null, 2),
                        }],
                };
            }
            case "delete": {
                const { table, where, whereParams = [], datasource = 'default' } = DeleteSchema.parse(args);
                const pool = poolManager.getPool(datasource);
                if (!where || where.trim() === "" || where.trim().toUpperCase() === "1=1") {
                    throw new Error("WHERE clause is required for DELETE operations");
                }
                const sql = `DELETE FROM ${table} WHERE ${where} RETURNING *`;
                const result = await pool.query(sql, whereParams);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                message: "Delete successful",
                                rowCount: result.rowCount,
                                deleted: result.rows,
                            }, null, 2),
                        }],
                };
            }
            case "create_table": {
                const { name: tableName, columns, datasource = 'default' } = CreateTableSchema.parse(args);
                const pool = poolManager.getPool(datasource);
                const columnDefs = columns.map(col => {
                    let def = `${col.name} ${col.type}`;
                    if (col.constraints) {
                        def += ` ${col.constraints}`;
                    }
                    return def;
                }).join(", ");
                const sql = `CREATE TABLE ${tableName} (${columnDefs})`;
                await pool.query(sql);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                message: "Table created successfully",
                                table: tableName,
                                sql,
                            }, null, 2),
                        }],
                };
            }
            case "alter_table": {
                const { table, operation, column, datasource = 'default' } = AlterTableSchema.parse(args);
                const pool = poolManager.getPool(datasource);
                let sql;
                switch (operation) {
                    case "ADD_COLUMN":
                        sql = `ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.type}${column.constraints ? " " + column.constraints : ""}`;
                        break;
                    case "DROP_COLUMN":
                        sql = `ALTER TABLE ${table} DROP COLUMN ${column.name}`;
                        break;
                    case "ALTER_COLUMN":
                        sql = `ALTER TABLE ${table} ALTER COLUMN ${column.name} TYPE ${column.type}`;
                        break;
                    case "RENAME_COLUMN":
                        sql = `ALTER TABLE ${table} RENAME COLUMN ${column.name} TO ${column.newName}`;
                        break;
                    default:
                        throw new Error(`Unknown operation: ${operation}`);
                }
                await pool.query(sql);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                message: "Table altered successfully",
                                operation,
                                sql,
                            }, null, 2),
                        }],
                };
            }
            case "drop_table": {
                const { table, cascade, datasource = 'default' } = DropTableSchema.parse(args);
                const pool = poolManager.getPool(datasource);
                const sql = `DROP TABLE ${table}${cascade ? " CASCADE" : ""}`;
                await pool.query(sql);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                message: "Table dropped successfully",
                                table,
                                cascade: cascade || false,
                            }, null, 2),
                        }],
                };
            }
            case "create_index": {
                const { name: indexName, table, columns, unique, datasource = 'default' } = CreateIndexSchema.parse(args);
                const pool = poolManager.getPool(datasource);
                const sql = `CREATE ${unique ? "UNIQUE " : ""}INDEX ${indexName} ON ${table} (${columns.join(", ")})`;
                await pool.query(sql);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                message: "Index created successfully",
                                index: indexName,
                                table,
                                columns,
                            }, null, 2),
                        }],
                };
            }
            case "list_functions": {
                const { schema = 'public', datasource = 'default' } = z.object({
                    schema: z.string().optional(),
                    datasource: z.string().optional(),
                }).parse(args);
                const pool = poolManager.getPool(datasource);
                const result = await pool.query(`
          SELECT
            p.proname as function_name,
            pg_get_function_arguments(p.oid) as arguments,
            pg_get_function_result(p.oid) as return_type,
            l.lanname as language,
            CASE WHEN p.provolatile = 'i' THEN 'IMMUTABLE'
                 WHEN p.provolatile = 's' THEN 'STABLE'
                 WHEN p.provolatile = 'v' THEN 'VOLATILE'
            END as volatility,
            pg_get_functiondef(p.oid) as definition
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          JOIN pg_language l ON p.prolang = l.oid
          WHERE n.nspname = $1
          AND p.prokind = 'f'
          ORDER BY p.proname
        `, [schema]);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                schema,
                                functions: result.rows,
                            }, null, 2),
                        }],
                };
            }
            case "create_function": {
                const { name, parameters = '', returnType = 'VOID', body, language = 'plpgsql', schema = 'public', datasource = 'default' } = z.object({
                    name: z.string(),
                    parameters: z.string().optional(),
                    returnType: z.string().optional(),
                    body: z.string(),
                    language: z.string().optional(),
                    schema: z.string().optional(),
                    datasource: z.string().optional(),
                }).parse(args);
                const pool = poolManager.getPool(datasource);
                const sql = `CREATE OR REPLACE FUNCTION ${schema}.${name}(${parameters})
RETURNS ${returnType}
LANGUAGE ${language}
AS $$
${body}
$$`;
                await pool.query(sql);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                message: "Function created successfully",
                                function: `${schema}.${name}`,
                                sql,
                            }, null, 2),
                        }],
                };
            }
            case "drop_function": {
                const { name, parameters, schema = 'public', cascade, datasource = 'default' } = z.object({
                    name: z.string(),
                    parameters: z.string().optional(),
                    schema: z.string().optional(),
                    cascade: z.boolean().optional(),
                    datasource: z.string().optional(),
                }).parse(args);
                const pool = poolManager.getPool(datasource);
                const signature = parameters ? `${schema}.${name}(${parameters})` : `${schema}.${name}`;
                const sql = `DROP FUNCTION IF EXISTS ${signature}${cascade ? " CASCADE" : ""}`;
                await pool.query(sql);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                message: "Function dropped successfully",
                                function: signature,
                            }, null, 2),
                        }],
                };
            }
            case "list_procedures": {
                const { schema = 'public', datasource = 'default' } = z.object({
                    schema: z.string().optional(),
                    datasource: z.string().optional(),
                }).parse(args);
                const pool = poolManager.getPool(datasource);
                const result = await pool.query(`
          SELECT
            p.proname as procedure_name,
            pg_get_function_arguments(p.oid) as arguments,
            l.lanname as language,
            CASE WHEN p.provolatile = 'i' THEN 'IMMUTABLE'
                 WHEN p.provolatile = 's' THEN 'STABLE'
                 WHEN p.provolatile = 'v' THEN 'VOLATILE'
            END as volatility,
            pg_get_functiondef(p.oid) as definition
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          JOIN pg_language l ON p.prolang = l.oid
          WHERE n.nspname = $1
          AND p.prokind = 'p'
          ORDER BY p.proname
        `, [schema]);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                schema,
                                procedures: result.rows,
                            }, null, 2),
                        }],
                };
            }
            case "create_procedure": {
                const { name, parameters = '', body, language = 'plpgsql', schema = 'public', datasource = 'default' } = z.object({
                    name: z.string(),
                    parameters: z.string().optional(),
                    body: z.string(),
                    language: z.string().optional(),
                    schema: z.string().optional(),
                    datasource: z.string().optional(),
                }).parse(args);
                const pool = poolManager.getPool(datasource);
                const sql = `CREATE OR REPLACE PROCEDURE ${schema}.${name}(${parameters})
LANGUAGE ${language}
AS $$
${body}
$$`;
                await pool.query(sql);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                message: "Procedure created successfully",
                                procedure: `${schema}.${name}`,
                                sql,
                            }, null, 2),
                        }],
                };
            }
            case "drop_procedure": {
                const { name, parameters, schema = 'public', datasource = 'default' } = z.object({
                    name: z.string(),
                    parameters: z.string().optional(),
                    schema: z.string().optional(),
                    datasource: z.string().optional(),
                }).parse(args);
                const pool = poolManager.getPool(datasource);
                const signature = parameters ? `${schema}.${name}(${parameters})` : `${schema}.${name}`;
                const sql = `DROP PROCEDURE IF EXISTS ${signature}`;
                await pool.query(sql);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                message: "Procedure dropped successfully",
                                procedure: signature,
                            }, null, 2),
                        }],
                };
            }
            case "list_triggers": {
                const { table, datasource = 'default' } = z.object({
                    table: z.string().optional(),
                    datasource: z.string().optional(),
                }).parse(args);
                const pool = poolManager.getPool(datasource);
                let sql = `
          SELECT
            t.tgname as trigger_name,
            c.relname as table_name,
            n.nspname as schema_name,
            CASE t.tgtype & 66
              WHEN 2 THEN 'BEFORE'
              WHEN 64 THEN 'INSTEAD OF'
              ELSE 'AFTER'
            END as timing,
            CASE
              WHEN (t.tgtype & 4) > 0 THEN 'INSERT'
              WHEN (t.tgtype & 8) > 0 THEN 'DELETE'
              WHEN (t.tgtype & 16) > 0 THEN 'UPDATE'
              WHEN (t.tgtype & 32) > 0 THEN 'TRUNCATE'
              ELSE 'MULTIPLE'
            END as event,
            p.proname as function_name,
            CASE WHEN t.tgtype & 1 > 0 THEN 'ROW' ELSE 'STATEMENT' END as level,
            t.tgenabled as enabled
          FROM pg_trigger t
          JOIN pg_class c ON t.tgrelid = c.oid
          JOIN pg_namespace n ON c.relnamespace = n.oid
          JOIN pg_proc p ON t.tgfoid = p.oid
          WHERE NOT t.tgisinternal
        `;
                const params = [];
                if (table) {
                    sql += ` AND c.relname = $1`;
                    params.push(table);
                }
                sql += ` ORDER BY c.relname, t.tgname`;
                const result = await pool.query(sql, params);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                table,
                                triggers: result.rows,
                            }, null, 2),
                        }],
                };
            }
            case "create_trigger": {
                const { name, table, timing, events, function: functionName, forEach = 'ROW', when, schema = 'public', datasource = 'default' } = z.object({
                    name: z.string(),
                    table: z.string(),
                    timing: z.enum(["BEFORE", "AFTER", "INSTEAD OF"]),
                    events: z.array(z.enum(["INSERT", "UPDATE", "DELETE", "TRUNCATE"])),
                    function: z.string(),
                    forEach: z.enum(["ROW", "STATEMENT"]).optional(),
                    when: z.string().optional(),
                    schema: z.string().optional(),
                    datasource: z.string().optional(),
                }).parse(args);
                const pool = poolManager.getPool(datasource);
                const eventsStr = events.join(" OR ");
                let sql = `CREATE TRIGGER ${name}
${timing} ${eventsStr}
ON ${schema}.${table}
FOR EACH ${forEach}
EXECUTE FUNCTION ${functionName}()`;
                if (when) {
                    sql = `CREATE TRIGGER ${name}
${timing} ${eventsStr}
ON ${schema}.${table}
FOR EACH ${forEach}
WHEN (${when})
EXECUTE FUNCTION ${functionName}()`;
                }
                await pool.query(sql);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                message: "Trigger created successfully",
                                trigger: name,
                                table: `${schema}.${table}`,
                                sql,
                            }, null, 2),
                        }],
                };
            }
            case "drop_trigger": {
                const { name, table, schema = 'public', cascade, datasource = 'default' } = z.object({
                    name: z.string(),
                    table: z.string(),
                    schema: z.string().optional(),
                    cascade: z.boolean().optional(),
                    datasource: z.string().optional(),
                }).parse(args);
                const pool = poolManager.getPool(datasource);
                const sql = `DROP TRIGGER IF EXISTS ${name} ON ${schema}.${table}${cascade ? " CASCADE" : ""}`;
                await pool.query(sql);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                message: "Trigger dropped successfully",
                                trigger: name,
                                table: `${schema}.${table}`,
                            }, null, 2),
                        }],
                };
            }
            case "execute_routine": {
                const { name, parameters = [], schema = 'public', datasource = 'default' } = z.object({
                    name: z.string(),
                    parameters: z.array(z.any()).optional(),
                    schema: z.string().optional(),
                    datasource: z.string().optional(),
                }).parse(args);
                const pool = poolManager.getPool(datasource);
                const placeholders = parameters.map((_, i) => `$${i + 1}`).join(", ");
                const sql = `SELECT * FROM ${schema}.${name}(${placeholders})`;
                const result = await pool.query(sql, parameters);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                datasource,
                                routine: `${schema}.${name}`,
                                columns: result.fields.map(f => f.name),
                                rows: result.rows,
                                rowCount: result.rowCount,
                            }, null, 2),
                        }],
                };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({ error: errorMessage }, null, 2),
                }],
            isError: true,
        };
    }
});
// Start server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("PostgreSQL MCP Server v2.0.0 running on stdio");
    console.error(`Loaded ${configManager.getAllDataSources().length} datasources`);
}
main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
//# sourceMappingURL=server.js.map