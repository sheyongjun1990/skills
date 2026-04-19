---
name: wechat-rewriter
description: |
  改写微信公众号文章为卡兹克风格。用户说"改写"+文章链接时触发。
  流程：提取文章内容 → 调用 khazix-writer 改写 → 生成 HTML 文件。
  触发词："改写"
triggers:
  - pattern: "改写"
    type: keyword
---

# 微信公众号文章改写器

当用户说"改写"并提供文章链接时，执行以下流程：

## 工作流程

### Step 1: 提取链接

从用户消息中提取 URL（支持任意链接，不限于公众号）：
- 使用正则表达式匹配 `https?://\S+`
- 如果找到多个链接，只处理第一个

### Step 2: 获取文章内容

调用 `baoyu-url-to-markdown` skill 提取文章内容：

**执行步骤：**
1. 确定 baoyu-url-to-markdown skill 的路径：
   - 基础目录：`~/.claude/skills/baoyu-url-to-markdown/`
   - CLI 入口：`scripts/vendor/baoyu-fetch/src/cli.ts`

2. 确定运行时：
   - 如果安装了 `bun` → 使用 `bun`
   - 否则使用 `npx -y bun`

3. 执行命令提取内容：
   ```bash
   {runtime} {skill_dir}/scripts/vendor/baoyu-fetch/src/cli.ts {url} --format json
   ```

4. 从 JSON 输出中提取：
   - `document.title` - 文章标题
   - `document.content` - 文章内容（markdown 格式）
   - `document.author` - 作者（如果有）
   - `document.publishedAt` - 发布时间（如果有）

**错误处理：**
- 如果提取失败，提示用户："无法提取文章内容，请检查链接是否可访问。"

### Step 3: 调用 khazix-writer 改写

调用 `khazix-writer` skill 改写文章：

**提示词：**
```
请按照卡兹克（Khazix）的公众号写作风格改写以下文章。

要求：
1. 保持原文核心信息
2. 使用卡兹克的口语化风格、节奏感和叙事方式
3. 生成一个新的、更有吸引力的标题
4. 在文章末尾附上原文链接

原文标题：{original_title}
原文作者：{original_author}
原文链接：{url}

原文内容：
{content}
```

### Step 4: 解析改写结果

从 khazix-writer 返回中提取：
- 新标题（第一行或明确标注的标题）
- 改写后的正文（markdown 格式）

### Step 5: 转换为 HTML 并保存

1. 使用 Python 将 markdown 转换为 HTML：
   ```python
   import markdown
   html_content = markdown.markdown(rewritten_content, extensions=['extra'])
   ```

2. 包装为完整 HTML 文档：
   ```html
   <!DOCTYPE html>
   <html lang="zh-CN">
   <head>
       <meta charset="UTF-8">
       <meta name="viewport" content="width=device-width, initial-scale=1.0">
       <title>{new_title}</title>
       <style>
           body {
               max-width: 800px;
               margin: 0 auto;
               padding: 20px;
               font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
               line-height: 1.8;
               color: #333;
           }
           h1 { font-size: 28px; margin-bottom: 20px; }
           h2 { font-size: 22px; margin-top: 30px; margin-bottom: 15px; }
           p { margin-bottom: 15px; }
           blockquote {
               border-left: 4px solid #ddd;
               padding-left: 20px;
               margin-left: 0;
               color: #666;
           }
           img { max-width: 100%; height: auto; }
           .meta {
               color: #999;
               font-size: 14px;
               margin-bottom: 30px;
               padding-bottom: 20px;
               border-bottom: 1px solid #eee;
           }
       </style>
   </head>
   <body>
       <h1>{new_title}</h1>
       <div class="meta">
           改写时间：{date} | 
           原文：<a href="{source_url}">{original_title}</a>
       </div>
       {html_content}
   </body>
   </html>
   ```

3. 生成文件名：
   - 使用 `filename_sanitizer.sanitize_filename()` 清理新标题
   - 将 `.md` 后缀改为 `.html`

4. 保存到当前工作目录

### Step 6: 向用户报告

报告内容：
- 改写完成
- 新标题
- 文件保存路径
- 原文标题和作者

## 错误处理

| 场景 | 处理方式 |
|-----|---------|
| 未找到链接 | 提示用户："请提供要改写的文章链接" |
| 提取内容失败 | 提示检查链接是否可访问，建议使用浏览器打开确认 |
| 改写失败 | 提示用户改写过程中出现问题，可重试 |
| 文件已存在 | 提示用户是否覆盖，或自动添加序号（如 `标题-1.html`） |

## 依赖

- khazix-writer skill（已安装）
- baoyu-url-to-markdown skill（已安装）
- Python 库：markdown

## 使用示例

用户输入：
```
改写 https://mp.weixin.qq.com/s/xxxxx
```

系统执行：
1. 提取链接
2. 调用 baoyu-url-to-markdown 获取内容
3. 调用 khazix-writer 改写
4. 生成 HTML 文件

输出文件：`{新标题}.html`
