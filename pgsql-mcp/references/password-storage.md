# 密码存储方案设计

## 支持多种密码存储方式

### 方案1：环境变量（当前）
```yaml
password_env: HCYY_LMP_DEV_PASSWORD
```
```bash
setx HCYY_LMP_DEV_PASSWORD "xxx"
```

### 方案2：本地文件（新增）
```yaml
password_file: ./.pgsql-mcp.env
```
文件内容：
```bash
HCYY_LMP_DEV_PASSWORD=v2sR55Dcqu3S
HCYY_LMP_TEST_PASSWORD=v2sR55Dcqu3S
```

### 方案3：直接配置（仅本地开发，不入git）
```yaml
password: v2sR55Dcqu3S  # 警告：只在本地使用，不要提交到git
```

## 优先级

1. 直接配置 `password`（最高，仅本地）
2. 环境变量 `password_env`
3. 本地文件 `password_file`
4. 报错（未配置密码）

## 更新配置

```yaml
datasources:
  dev:
    name: "开发环境"
    description: "LMP项目开发环境"
    tags: ["开发", "dev", "lmp"]
    host: 10.9.192.24
    port: 5432
    database: hcyy_lmp
    username: hcyy_lmp
    # 三选一：
    # password: "xxx"                    # 直接配置（不推荐）
    password_env: HCYY_LMP_DEV_PASSWORD   # 环境变量（推荐）
    # password_file: ./.pgsql-mcp.env    # 本地文件（推荐）
    ssl: false
```

## 本地密码文件 .pgsql-mcp.env

```bash
# LMP项目数据库密码
HCYY_LMP_DEV_PASSWORD=v2sR55Dcqu3S
HCYY_LMP_TEST_PASSWORD=v2sR55Dcqu3S
```

添加到 .gitignore：
```
.pgsql-mcp.env
```
