# filename_sanitizer.py
import re


def sanitize_filename(title: str, max_length: int = 50) -> str:
    """
    将标题清理为合法的文件名

    Args:
        title: 文章标题
        max_length: 最大长度（不含扩展名）

    Returns:
        清理后的文件名（包含 .html 扩展名）
    """
    if not title or not title.strip():
        return "untitled.html"

    # 移除特殊字符，保留中英文、数字、空格、连字符、斜杠
    cleaned = re.sub(r'[^\w\s\u4e00-\u9fff-/\\]', '', title)

    # 将空格和斜杠转为连字符
    cleaned = re.sub(r'[\s/\\]+', '-', cleaned)

    # 移除连续的连字符
    cleaned = re.sub(r'-+', '-', cleaned)

    # 移除首尾连字符
    cleaned = cleaned.strip('-')

    # 限制长度
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length].rsplit('-', 1)[0]  # 避免截断在单词中间

    # 如果清理后为空
    if not cleaned:
        return "untitled.html"

    return f"{cleaned}.html"
