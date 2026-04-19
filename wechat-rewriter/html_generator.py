from datetime import date
import markdown


def generate_html(content: str, title: str, source: str, original_title: str = "") -> str:
    """
    将 markdown 内容转换为完整 HTML 文档

    Args:
        content: 文章正文（markdown 格式）
        title: 文章标题
        source: 原文链接
        original_title: 原文标题

    Returns:
        完整的 HTML 文档内容
    """
    today = date.today().isoformat()
    original_title = original_title or "原文"

    # 将 markdown 转换为 HTML
    html_body = markdown.markdown(content, extensions=['extra', 'nl2br'])

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.8;
            color: #333;
        }}
        h1 {{ font-size: 28px; margin-bottom: 20px; }}
        h2 {{ font-size: 22px; margin-top: 30px; margin-bottom: 15px; }}
        h3 {{ font-size: 18px; margin-top: 25px; margin-bottom: 12px; }}
        p {{ margin-bottom: 15px; }}
        blockquote {{
            border-left: 4px solid #ddd;
            padding-left: 20px;
            margin-left: 0;
            color: #666;
        }}
        img {{ max-width: 100%; height: auto; }}
        .meta {{
            color: #999;
            font-size: 14px;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid #eee;
        }}
        a {{ color: #576b95; text-decoration: none; }}
        a:hover {{ text-decoration: underline; }}
        ul, ol {{ margin-bottom: 15px; padding-left: 25px; }}
        li {{ margin-bottom: 8px; }}
        code {{
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: "Courier New", monospace;
            font-size: 14px;
        }}
        pre {{
            background: #f4f4f4;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            margin-bottom: 15px;
        }}
        pre code {{ padding: 0; background: none; }}
    </style>
</head>
<body>
    <h1>{title}</h1>
    <div class="meta">
        改写时间：{today} |
        原文：<a href="{source}">{original_title}</a>
    </div>
    {html_body}
</body>
</html>
"""
