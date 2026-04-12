#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Excel处理器技能 - 用于读取Excel文件，筛选指定列的状态，转换为JSON数组并保存
"""

import pandas as pd
import json
import os
from datetime import datetime
from pathlib import Path


def process_excel_file(file_path, column_name, status_value, output_dir=None):
    """
    处理Excel文件：筛选指定列的状态，转换为JSON数组并保存

    参数:
        file_path: Excel文件路径
        column_name: 要筛选的列名
        status_value: 状态值
        output_dir: 输出目录（可选，默认为Excel文件所在目录）

    返回:
        dict: 包含处理结果的字典
    """
    try:
        # 读取Excel文件
        df = pd.read_excel(file_path)

        # 筛选指定列中满足状态的行
        if column_name not in df.columns:
            raise ValueError(f"列 '{column_name}' 不存在于Excel中")

        filtered_df = df[df[column_name] == status_value]

        # 转换为JSON数组
        if filtered_df.empty:
            json_content = "[]"
        else:
            json_content = filtered_df.to_json(orient='records', force_ascii=False, indent=2)

        # 生成输出文件名
        base_name = Path(file_path).stem
        status_str = str(status_value).replace('/', '_').replace('\\', '_')
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"{base_name}_{column_name}_{status_str}_{timestamp}.txt"

        # 确定输出目录
        if output_dir is None:
            output_dir = os.path.dirname(file_path) or '.'

        output_path = os.path.join(output_dir, output_filename)

        # 保存到文件
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(json_content)

        return {
            'success': True,
            'input_file': file_path,
            'output_file': output_path,
            'filtered_count': len(filtered_df),
            'total_count': len(df),
            'column': column_name,
            'status': status_value
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'input_file': file_path
        }


def batch_process_excel_files(folder_path, column_name, status_value, output_dir=None):
    """
    批量处理文件夹中的所有Excel文件

    参数:
        folder_path: 包含Excel文件的文件夹路径
        column_name: 要筛选的列名
        status_value: 状态值
        output_dir: 输出目录（可选）

    返回:
        list: 每个文件的处理结果列表
    """
    folder = Path(folder_path)
    results = []

    for file_pattern in ['*.xlsx', '*.xls']:
        for excel_file in folder.glob(file_pattern):
            result = process_excel_file(
                str(excel_file),
                column_name,
                status_value,
                output_dir
            )
            results.append(result)

    return results


# 使用示例
if __name__ == "__main__":
    # 示例1：处理单个文件
    result = process_excel_file(
        file_path="销售数据.xlsx",
        column_name="订单状态",
        status_value="已完成"
    )
    print(result)

    # 示例2：批量处理
    results = batch_process_excel_files(
        folder_path="./数据文件夹",
        column_name="状态",
        status_value="通过"
    )
    print(results)