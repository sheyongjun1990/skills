#!/usr/bin/env python3
"""
HTML 文件自动分类工具
根据标题和内容将 HTML 文件分类到汽车、星座、教育、娱乐等文件夹
"""

import os
import shutil
import re
from pathlib import Path
from html.parser import HTMLParser
import argparse


class HTMLTitleExtractor(HTMLParser):
    """提取 HTML 标题的解析器"""
    
    def __init__(self):
        super().__init__()
        self.in_title = False
        self.title = ""
        self.in_body = False
        self.body_text = []
        
    def handle_starttag(self, tag, attrs):
        if tag == 'title':
            self.in_title = True
        elif tag == 'body':
            self.in_body = True
            
    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        elif tag == 'body':
            self.in_body = False
            
    def handle_data(self, data):
        if self.in_title:
            self.title += data.strip()
        elif self.in_body:
            text = re.sub(r'\s+', ' ', data.strip())
            if text:
                self.body_text.append(text)


def extract_html_content(file_path):
    """提取 HTML 文件的标题和正文内容"""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            html_content = f.read()
        
        parser = HTMLTitleExtractor()
        parser.feed(html_content)
        
        title = parser.title or ""
        body_text = ' '.join(parser.body_text[:500])
        
        return title, body_text
    except Exception as e:
        print(f"读取文件 {file_path} 时出错: {e}")
        return "", ""


CATEGORY_KEYWORDS = {
    '汽车': [
        '汽车', '车', '轿车', 'SUV', '电动车', '宝马', '奔驰', '奥迪', '丰田', '本田',
        '特斯拉', '比亚迪', '大众', '驾驶', '驾照', '发动机', '新能源汽车', '充电桩'
    ],
    '星座': [
        '星座', '运势', '占星', '白羊座', '金牛座', '双子座', '巨蟹座', '狮子座',
        '处女座', '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座', '十二星座'
    ],
    '教育': [
        '教育', '学习', '学校', '大学', '培训', '考试', '高考', '留学', '课程',
        '老师', '学生', '作业', '专业', '学科', '在线学习', '网课'
    ],
    '娱乐': [
        '娱乐', '明星', '电影', '电视剧', '综艺', '音乐', '歌手', '演员', '直播',
        '短视频', '游戏', '动漫', '漫画', '小说', '演唱会'
    ]
}


def classify_content(title, body_text):
    """根据标题和正文内容分类"""
    full_text = f"{title} {title} {body_text}".lower()
    
    category_scores = {}
    
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = 0
        for keyword in keywords:
            title_count = title.lower().count(keyword.lower())
            body_count = body_text.lower().count(keyword.lower())
            score += title_count * 3 + body_count
        
        category_scores[category] = score
    
    if category_scores:
        best_category = max(category_scores, key=category_scores.get)
        best_score = category_scores[best_category]
        
        if best_score > 0:
            return best_category
    
    return None


def ensure_directories(base_path, categories):
    """确保分类目录存在"""
    for category in categories:
        category_path = Path(base_path) / category
        if not category_path.exists():
            category_path.mkdir(exist_ok=True)
            print(f"创建目录: {category_path}")


def classify_html_files(source_dir='.', dry_run=False):
    """分类 HTML 文件"""
    source_path = Path(source_dir).resolve()
    categories = list(CATEGORY_KEYWORDS.keys())
    
    print(f"开始分类 HTML 文件...")
    print(f"源目录: {source_path}")
    print(f"分类类别: {', '.join(categories)}")
    print("-" * 50)
    
    if not dry_run:
        ensure_directories(source_path, categories)
    
    stats = {cat: 0 for cat in categories}
    stats['未分类'] = 0
    stats['总计'] = 0
    
    html_files = list(source_path.glob('*.html')) + list(source_path.glob('*.htm'))
    
    if not html_files:
        print("未找到 HTML 文件")
        return
    
    for html_file in html_files:
        stats['总计'] += 1
        
        title, body_text = extract_html_content(html_file)
        
        category = classify_content(title, body_text)
        
        if category:
            stats[category] += 1
            target_dir = source_path / category
            target_file = target_dir / html_file.name
            
            print(f"[{category}] {html_file.name}")
            if title:
                print(f"  标题: {title[:80]}")
            
            if not dry_run:
                if target_file.exists():
                    base_name = html_file.stem
                    extension = html_file.suffix
                    counter = 1
                    while target_file.exists():
                        new_name = f"{base_name}_{counter}{extension}"
                        target_file = target_dir / new_name
                        counter += 1
                
                try:
                    shutil.move(str(html_file), str(target_file))
                    print(f"  -> 移动到: {target_file}")
                except Exception as e:
                    print(f"  移动失败: {e}")
        else:
            stats['未分类'] += 1
            print(f"[未分类] {html_file.name}")
            if title:
                print(f"  标题: {title[:80]}")
    
    print("-" * 50)
    print("分类统计:")
    for cat, count in stats.items():
        if count > 0:
            print(f"  {cat}: {count} 个文件")


def main():
    parser = argparse.ArgumentParser(
        description='自动分类 HTML 文件到汽车、星座、教育、娱乐等类别'
    )
    parser.add_argument(
        '--dir', '-d',
        default='.',
        help='要分类的目录路径（默认为当前目录）'
    )
    parser.add_argument(
        '--dry-run', '-n',
        action='store_true',
        help='试运行模式，只显示分类结果但不移动文件'
    )
    
    args = parser.parse_args()
    
    classify_html_files(args.dir, args.dry_run)


if __name__ == '__main__':
    main()
