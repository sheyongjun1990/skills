---
name: pgsql-mcp
description: Connect to local PostgreSQL database and perform operations including schema modifications (DDL) and CRUD operations (DML). Use when user needs to query data, insert/update/delete records, create/alter/drop tables, manage indexes, or perform any PostgreSQL database operations on a local database instance. Also triggers when user asks in Chinese about database operations like "帮我查询数据", "帮我修改数据", "帮我增加数据", "帮我删除数据", "帮我修改数据表", "帮我创建表", "帮我查看表结构", or any database-related requests including "数据库", "SQL", "pgsql", "postgres", "增删改查", "查询", "插入", "更新", "删除", "建表", "改表".
---

# PostgreSQL MCP Skill

This skill provides a Model Context Protocol (MCP) server for interacting with multiple PostgreSQL databases with **natural language datasource matching**.

## When to Use This Skill

Use this skill when the user asks to:

**English triggers:**
- Query data from PostgreSQL database
- Insert, update, or delete records
- Create, alter, or drop tables
- View table structure or schema
- Create indexes
- Perform any database operations

**中文触发词:**
- 帮我查询数据 / 查一下数据 / 查询数据库
- 帮我修改数据 / 更新数据 / 改数据
- 帮我增加数据 / 插入数据 / 新增数据
- 帮我删除数据 / 删掉数据
- 帮我修改数据表 / 修改表结构 / 改表
- 帮我创建表 / 新建表 / 建表
- 帮我查看表结构 / 看一下表结构
- 数据库相关操作 / SQL操作 / PostgreSQL操作
- 包含关键词: 数据库, SQL, pgsql, postgres, 增删改查, 查询, 插入, 更新, 删除

## Key Features

### Natural Language Datasource Matching

Say goodbye to remembering datasource IDs! Just describe what you want:

| User says | Matches datasource |
|-----------|-------------------|
| "查**开发环境**的用户表" | `dev` (tag: 开发) |
| "**测试库**有多少订单" | `test` (tag: 测试) |
| "**sit环境**的数据" | `test` (tag: sit) |
| "看一下**生产**的表结构" | `prod` (tag: 生产) |
| "给**lmp开发**库插入数据" | `dev` (tag: lmp开发) |

The skill automatically matches your natural language to the configured datasource using:
- **name** exact/partial matching
- **tags** keyword matching
- **description** content matching

## Configuration

### 1. Global Config (~/.claude/pgsql-mcp/config.yaml)

Shared across all projects:

```yaml
datasources:
  dev:
    name: "开发环境"
    description: "LMP项目开发环境，用于日常开发"
    tags: ["开发", "dev", "development", "本地", "lmp开发"]
    host: 10.9.192.24
    port: 5432
    database: hcyy_lmp
    username: hcyy_lmp
    password_env: PG_DEV_PASSWORD  # 从环境变量读取密码
    ssl: false

  test:
    name: "测试环境"
    description: "LMP项目测试环境，用于SIT测试"
    tags: ["测试", "test", "testing", "sit", "lmp测试"]
    host: 10.9.192.35
    port: 5432
    database: hcyy_lmp
    username: hcyy_lmp
    password_env: PG_TEST_PASSWORD
    ssl: false

  prod:
    name: "生产环境"
    description: "生产环境，只读访问"
    tags: ["生产", "prod", "production", "线上"]
    host: prod.db.com
    database: hcyy_lmp
    username: readonly
    password_env: PG_PROD_PASSWORD
    ssl: true
    readonly: true  # 只允许查询操作
```

### 2. Project Config (./.pgsql-mcp.yaml)

Project-specific datasources or overrides:

```yaml
datasources:
  # 项目专属数据源
  order-db:
    name: "订单服务库"
    description: "订单系统数据库"
    tags: ["订单", "order"]
    host: 10.9.192.100
    database: order_service
    username: order_app
    password_env: ORDER_DB_PASSWORD

  # 覆盖全局配置（可选）
  dev:
    name: "项目开发环境"
    description: "覆盖后的开发配置"
    tags: ["开发"]
    host: localhost
    database: myproject_dev
    username: postgres
    password_env: LOCAL_PASSWORD
```

### 3. Environment Variables

Set passwords in your shell profile:

```bash
# ~/.bashrc or ~/.zshrc
export PG_DEV_PASSWORD="v2sR55Dcqu3S"
export PG_TEST_PASSWORD="your_test_password"
export PG_PROD_PASSWORD="your_prod_password"
```

### 4. MCP Config (.mcp.json)

Minimal configuration - all datasource details are in YAML:

```json
{
  "mcpServers": {
    "postgresql": {
      "command": "node",
      "args": [
        "C:\\Users\\HC0100080\\.claude\\skills\\pgsql-mcp\\scripts\\dist\\server.js"
      ]
    }
  }
}
```

## Setup Process

When this skill is triggered:

1. **Check compilation**: Verify `dist/server.js` exists
2. **Check global config**: Create `~/.claude/pgsql-mcp/config.yaml` if not exists
3. **Check project config**: Optionally create `./.pgsql-mcp.yaml`
4. **Set passwords**: Remind user to set environment variables
5. **Restart**: User must restart Claude Code to load new datasources

## Available Tools

### list_datasources
List all configured datasources with descriptions and tags:
```javascript
// Tool: list_datasources
{}
```

### query
Execute SELECT query with natural language datasource:
```javascript
// "查开发环境的用户表"
{
  "datasource": "开发环境",  // 或 "dev", "开发", "lmp开发"
  "sql": "SELECT * FROM users WHERE status = $1",
  "params": ["active"]
}
```

### describe_table
View table structure:
```javascript
// "看一下测试库的订单表结构"
{
  "datasource": "测试库",  // 匹配 test 数据源
  "table": "orders"
}
```

### insert
Insert data:
```javascript
// "给开发环境插入一条用户数据"
{
  "datasource": "开发环境",
  "table": "users",
  "data": {
    "name": "张三",
    "email": "zhangsan@example.com"
  }
}
```

### update
Update data (requires WHERE):
```javascript
// "更新测试环境的订单状态"
{
  "datasource": "测试环境",
  "table": "orders",
  "data": { "status": "completed" },
  "where": "id = $1",
  "whereParams": [123]
}
```

### delete
Delete data (requires WHERE):
```javascript
// "删除开发环境的测试数据"
{
  "datasource": "开发环境",
  "table": "users",
  "where": "email = $1",
  "whereParams": ["test@example.com"]
}
```

### create_table
Create table:
```javascript
{
  "datasource": "开发环境",
  "name": "products",
  "columns": [
    { "name": "id", "type": "SERIAL", "constraints": "PRIMARY KEY" },
    { "name": "name", "type": "VARCHAR(255)", "constraints": "NOT NULL" },
    { "name": "price", "type": "DECIMAL(10,2)" }
  ]
}
```

### alter_table
Modify table:
```javascript
{
  "datasource": "开发环境",
  "table": "products",
  "operation": "ADD_COLUMN",
  "column": {
    "name": "stock",
    "type": "INTEGER",
    "constraints": "DEFAULT 0"
  }
}
```

### drop_table
Drop table:
```javascript
{
  "datasource": "开发环境",
  "table": "temp_table",
  "cascade": false
}
```

### create_index
Create index:
```javascript
{
  "datasource": "开发环境",
  "name": "idx_users_email",
  "table": "users",
  "columns": ["email"],
  "unique": true
}
```

### list_functions
List all functions:
```javascript
{
  "datasource": "开发环境",
  "schema": "public"
}
```

### create_function
Create a function:
```javascript
{
  "datasource": "开发环境",
  "name": "get_user_count",
  "parameters": "p_status VARCHAR",
  "returnType": "INTEGER",
  "body": "BEGIN RETURN (SELECT COUNT(*) FROM users WHERE status = p_status); END;",
  "language": "plpgsql",
  "schema": "public"
}
```

### drop_function
Drop a function:
```javascript
{
  "datasource": "开发环境",
  "name": "get_user_count",
  "parameters": "p_status VARCHAR",
  "schema": "public",
  "cascade": false
}
```

### list_procedures
List all stored procedures:
```javascript
{
  "datasource": "开发环境",
  "schema": "public"
}
```

### create_procedure
Create a stored procedure:
```javascript
{
  "datasource": "开发环境",
  "name": "update_user_status",
  "parameters": "p_user_id INTEGER, p_status VARCHAR",
  "body": "BEGIN UPDATE users SET status = p_status WHERE id = p_user_id; END;",
  "language": "plpgsql",
  "schema": "public"
}
```

### drop_procedure
Drop a stored procedure:
```javascript
{
  "datasource": "开发环境",
  "name": "update_user_status",
  "parameters": "p_user_id INTEGER, p_status VARCHAR",
  "schema": "public"
}
```

### list_triggers
List all triggers:
```javascript
{
  "datasource": "开发环境",
  "table": "users"
}
```

### create_trigger
Create a trigger:
```javascript
{
  "datasource": "开发环境",
  "name": "trg_user_audit",
  "table": "users",
  "timing": "AFTER",
  "events": ["INSERT", "UPDATE"],
  "function": "log_user_changes",
  "forEach": "ROW",
  "schema": "public"
}
```

### drop_trigger
Drop a trigger:
```javascript
{
  "datasource": "开发环境",
  "name": "trg_user_audit",
  "table": "users",
  "schema": "public",
  "cascade": false
}
```

### execute_routine
Execute a function or procedure:
```javascript
{
  "datasource": "开发环境",
  "name": "get_user_count",
  "parameters": ["active"],
  "schema": "public"
}
```

## Matching Algorithm

When you provide a `datasource` hint, the server tries to match in this order:

1. **Exact ID match** - `datasource: "dev"` → matches `dev`
2. **Name exact match** - `datasource: "开发环境"` → matches `dev`
3. **Name contains** - `datasource: "开发"` → matches `dev`
4. **Tags match** - `datasource: "dev"` matches tag "dev"
5. **Description keywords** - matches words in description
6. **Partial match** - partial word matching

If no match found, returns error with available datasources.

## Safety Features

- **UPDATE/DELETE require WHERE** - prevents accidental full table operations
- **readonly datasources** - datasources marked `readonly: true` only allow queries
- **SQL injection protection** - parameterized queries
- **Password isolation** - passwords in environment variables, not config files

## Configuration Priority

1. Environment variables (temporary override)
2. Project config `./.pgsql-mcp.yaml`
3. Global config `~/.claude/pgsql-mcp/config.yaml`
4. Legacy environment-based config

## Troubleshooting

**"Unknown datasource" error**
- Run `list_datasources` to see available datasources
- Check your hint matches name, tags, or description
- Verify config files are loaded (check `configLoadedFrom` in response)

**"Connection refused" error**
- Check host/port are correct
- Verify database is running
- Check firewall/network access

**Password not working**
- Verify environment variable is set: `echo $PG_DEV_PASSWORD`
- Check variable name matches `password_env` in config
- Restart Claude Code after setting env vars
