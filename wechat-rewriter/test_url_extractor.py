import pytest
from url_extractor import extract_wechat_url


def test_extract_single_url():
    text = "这篇文章写得不错：https://mp.weixin.qq.com/s/jbYELw4cK3jlh6e0ibF7DQ"
    result = extract_wechat_url(text)
    assert result == "https://mp.weixin.qq.com/s/jbYELw4cK3jlh6e0ibF7DQ"


def test_extract_url_with_other_text():
    text = """今天看到一篇好文章
    https://mp.weixin.qq.com/s/xxxxx
    推荐大家看看"""
    result = extract_wechat_url(text)
    assert result == "https://mp.weixin.qq.com/s/xxxxx"


def test_no_url():
    text = "这是一段没有链接的文字"
    result = extract_wechat_url(text)
    assert result is None


def test_http_url():
    text = "http://mp.weixin.qq.com/s/xxxxx"
    result = extract_wechat_url(text)
    assert result == "http://mp.weixin.qq.com/s/xxxxx"
