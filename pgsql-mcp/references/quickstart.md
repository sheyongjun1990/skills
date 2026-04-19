# PostgreSQL MCP Server - Quick Start

## Installation

```bash
cd C:\Users\HC0100080\.claude\skills\pgsql-mcp\scripts
npm install
npm run build
```

## Configuration

### Step 1: Create Global Config

Create file `~/.claude/pgsql-mcp/config.yaml`:

```yaml
datasources:
  dev:
    name: "开发环境"
    description: "项目开发环境"
    tags: ["开发", "dev", "development"]
    host: localhost
    port: 5432
    database: mydb
    username: postgres
    password_env: PG_DEV_PASSWORD
    ssl: false

  test:
    name: "测试环境"
    description: "测试环境"
    tags: ["测试", "test", "testing"]
    host: test.db.com
    database: test_db
    username: test
    password_env: PG_TEST_PASSWORD
    ssl: true
```

### Step 2: Set Environment Variables

```bash
# Windows
setx PG_DEV_PASSWORD "your_dev_password"
setx PG_TEST_PASSWORD "your_test_password"

# Linux/Mac
export PG_DEV_PASSWORD="your_dev_password"
export PG_TEST_PASSWORD="your_test_password"
```

### Step 3: Create MCP Config

Create `.mcp.json` in your project:

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

### Step 4: Restart Claude Code

Restart to load the MCP server with your datasources.

## Usage Examples

### List Datasources
```javascript
// Tool: list_datasources
{}
```

### Query with Natural Language
```javascript
// "查开发环境的用户"
{
  "datasource": "开发环境",
  "sql": "SELECT * FROM users WHERE id = $1",
  "params": [123]
}

// "测试库有多少订单"
{
  "datasource": "测试库",
  "sql": "SELECT COUNT(*) FROM orders"
}
```

### Other Operations
```javascript
// Insert
{
  "datasource": "dev",
  "table": "users",
  "data": { "name": "张三", "email": "zs@example.com" }
}

// Update
{
  "datasource": "dev",
  "table": "users",
  "data": { "status": "active" },
  "where": "id = $1",
  "whereParams": [123]
}

// Describe table
{
  "datasource": "dev",
  "table": "orders"
}
```

## Natural Language Matching

The `datasource` parameter supports natural language:

| You say | Matches |
|---------|---------|
| "开发环境" | `dev` (by name) |
| "开发" | `dev` (by tag) |
| "测试库" | `test` (partial name) |
| "dev" | `dev` (exact ID) |
| "sit" | `test` (by tag) |

Matching priority: exact ID → exact name → contains name → tags → description
