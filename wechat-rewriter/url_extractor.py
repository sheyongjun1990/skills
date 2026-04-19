import re


def extract_wechat_url(text: str) -> str | None:
    """
    从文本中提取微信公众号文章链接

    Args:
        text: 用户输入的文本

    Returns:
        提取到的链接，如果没有找到则返回 None
    """
    pattern = r'https?://mp\.weixin\.qq\.com/s/[A-Za-z0-9_-]+'
    match = re.search(pattern, text)
    return match.group(0) if match else None
