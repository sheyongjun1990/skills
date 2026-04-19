# wechat-rewriter

改写微信公众号文章为卡兹克风格的 Claude Code Skill。

## 使用方法

在 Claude Code 中说「改写」并提供文章链接：

```
改写 https://mp.weixin.qq.com/s/xxxxx
```

Claude 将自动：
1. 调用 baoyu-url-to-markdown 提取文章内容
2. 使用卡兹克风格改写
3. 生成新标题
4. 保存为 HTML 文件

## 输出示例

输入：
```
改写 https://mp.weixin.qq.com/s/jbYELw4cK3jlh6e0ibF7DQ
```

输出文件：`为什么AI让人着迷-深度解析.html`

内容：带样式的美观 HTML 文档，包含：
- 新标题
- 原文链接
- 改写时间
- 卡兹克风格的正文

## 文件结构

```
.claude/skills/wechat-rewriter/
├── SKILL.md                    # Skill 定义和指令
├── README.md                   # 使用说明
├── url_extractor.py            # URL 提取器
├── filename_sanitizer.py       # 文件名清理器
├── html_generator.py           # HTML 生成器
├── __init__.py                 # 模块初始化
├── main.py                     # 主模块
└── test_*.py                   # 测试文件
```

## 依赖

- Claude Code
- baoyu-url-to-markdown skill（用于提取文章内容）
- khazix-writer skill（用于改写）
- Python markdown 库
