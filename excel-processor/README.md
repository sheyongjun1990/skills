# Excel处理器技能

## 文件结构
```
excel-processor/
├── skill.md       # 技能文档和使用说明
├── processor.py   # 核心处理脚本
└── README.md      # 本文件
```

## 快速开始

### 1. 安装依赖
```bash
pip install pandas openpyxl
```

### 2. 在Claude Code中使用

**单文件处理：**
```
使用excel-processor技能处理D:\销售数据.xlsx，筛选"订单状态"列中状态为"已完成"的数据
```

**批量处理：**
```
使用excel-processor技能批量处理D:\数据文件夹中的所有Excel文件，筛选"状态"列中状态为"通过"的数据
```

### 3. 直接调用脚本
```python
from processor import process_excel_file, batch_process_excel_files

# 单文件
result = process_excel_file("销售数据.xlsx", "订单状态", "已完成")
print(result)

# 批量处理
results = batch_process_excel_files("数据文件夹", "状态", "通过")
print(results)
```

## 输出示例

**输入：** `销售数据.xlsx`，列名：`订单状态`，状态：`已完成`

**输出文件：** `销售数据_订单状态_已完成_20241229_143025.txt`

**文件内容：**
```json
[
  {"订单ID": "001", "订单状态": "已完成", "金额": 100},
  {"订单ID": "002", "订单状态": "已完成", "金额": 200}
]
```

详细使用说明请查看 `skill.md` 文件。