# test_filename_sanitizer.py
import pytest
from filename_sanitizer import sanitize_filename


def test_simple_title():
    assert sanitize_filename("如何学习编程") == "如何学习编程.html"


def test_title_with_spaces():
    assert sanitize_filename("如何 学习 编程") == "如何-学习-编程.html"


def test_title_with_special_chars():
    assert sanitize_filename("如何学习编程？！") == "如何学习编程.html"


def test_title_with_quotes():
    assert sanitize_filename('"最佳"实践指南') == "最佳实践指南.html"


def test_title_too_long():
    long_title = "这是一段非常长的标题" * 10
    result = sanitize_filename(long_title)
    assert len(result) <= 56  # 50 + .html
    assert result.endswith(".html")


def test_empty_title():
    assert sanitize_filename("") == "untitled.html"


def test_title_with_slashes():
    assert sanitize_filename("a/b/c 标题") == "a-b-c-标题.html"
