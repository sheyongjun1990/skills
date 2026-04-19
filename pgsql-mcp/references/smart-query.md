# 智能查询 - 自然语言支持

## 使用方式

用户可以直接用自然语言描述：

> "帮我查询**开发环境**的user表的数据"
> "查看**测试库**的订单表结构"
> "在**生产环境**里统计今天的注册用户数"
> "给**订单库**添加一条测试数据"

## 实现方案

### 方案1：智能解析工具（推荐）

新增 `smart_query` 工具，自动解析自然语言：

```javascript
// 用户说："帮我查询开发环境的user表的数据"
// Tool: smart_query
{
  "input": "帮我查询开发环境的user表的数据"
}

// 内部解析结果
{
  "datasource": "dev",  // 匹配到 tags 包含 "开发" 的数据源
  "table": "user",
  "operation": "query",
  "sql": "SELECT * FROM user"
}
```

### 方案2：参数增强（当前工具扩展）

扩展现有工具，支持 `datasource_hint` 参数：

```javascript
// Tool: query
{
  "datasource_hint": "开发环境",  // 自然语言描述
  "sql": "SELECT * FROM user"
}

// 后端根据 hint 匹配 datasource 标签
// "开发环境" -> tags 包含 "开发" 的 dev 数据源
```

### 方案3：对话上下文识别

在 SKILL.md 中配置解析逻辑：

当用户询问数据库时，Claude 应该：
1. 先调用 `list_datasources` 获取所有数据源及其 tags
2. 解析用户输入中的关键词
3. 匹配到对应的 datasource
4. 执行相应的操作

## 匹配逻辑

```typescript
function matchDataSource(input: string, datasources: DataSource[]): string {
  const inputLower = input.toLowerCase();

  for (const ds of datasources) {
    // 1. 精确匹配 name
    if (inputLower.includes(ds.name.toLowerCase())) {
      return ds.id;
    }

    // 2. 匹配 tags
    for (const tag of ds.tags) {
      if (inputLower.includes(tag.toLowerCase())) {
        return ds.id;
      }
    }

    // 3. 匹配 description 关键词
    const descKeywords = ds.description.split(/[，。、\s]+/);
    for (const kw of descKeywords) {
      if (kw.length > 2 && inputLower.includes(kw.toLowerCase())) {
        return ds.id;
      }
    }
  }

  return 'default';  // 默认数据源
}
```

## 配置示例

```yaml
datasources:
  dev:
    name: "开发环境"
    description: "项目开发环境数据库，用于日常开发和调试"
    tags: ["开发", "dev", "development", "本地", "daily", "lmp开发"]
    host: 10.9.192.24

  test:
    name: "测试环境"
    description: "项目测试环境数据库，用于SIT测试"
    tags: ["测试", "test", "sit", "testing", "lmp测试"]
    host: 10.9.192.35
```

## 对话示例

| 用户输入 | 匹配到 | 说明 |
|---------|-------|------|
| "查**开发环境**的用户" | dev | 匹配 name="开发环境" |
| "**测试库**里有多少订单" | test | 匹配 tags="测试" + "库" |
| "看看**daily**的表结构" | dev | 匹配 tags="daily" |
| "**sit环境**的数据" | test | 匹配 tags="sit" |
| "**生产**上今天的数据" | prod | 匹配 tags="生产" |
| "**lmp开发**库" | dev | 匹配 tags="lmp开发" |
