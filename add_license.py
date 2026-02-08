#!/usr/bin/env python3
# Project: Eldoran
# Copyright (C) 2026 WinManApple
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

import os
import re

# --- 配置区域 ---
PROJECT_NAME = "Eldoran"
AUTHOR = "WinManApple"
YEAR = "2026"

# 1. 代码文件的协议 (AGPL-3.0)
LICENSE_AGPL_TEXT = f"""
 * Project: {PROJECT_NAME}
 * Copyright (C) {YEAR} {AUTHOR}
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""

# 2. 资源文件的协议 (CC BY-NC 4.0 - 仅用于 .obj)
LICENSE_CC_TEXT = f"""
 * Project: {PROJECT_NAME}
 * Copyright (C) {YEAR} {AUTHOR}
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
"""

# 文件处理配置
# 更新了 pattern 以匹配 GNU/Affero 关键词，确保能替换旧协议或识别新协议
FILE_CONFIG = {
    '.js': {
        'pattern': r'^\s*/\*.*?(?:Copyright|License|Creative Commons|GNU|Affero).*?\*/\s*',
        'start': '/*', 'end': '*/', 'style': 'block'
    },
    '.css': {
        'pattern': r'^\s*/\*.*?(?:Copyright|License|Creative Commons|GNU|Affero).*?\*/\s*',
        'start': '/*', 'end': '*/', 'style': 'block'
    },
    '.html': {
        'pattern': r'^\s*\s*', # HTML通常不自动移除旧头，除非有明确注释块，此处保持原逻辑
        'start': '', 'style': 'block' # HTML使用 需特殊处理，原脚本用block逻辑简单处理
    },
    '.obj': {
        'style': 'line', 'char': '#'
    },
    '.py': {
        'style': 'line', 'char': '#'
    }
}

def generate_header_string(ext):
    """根据文件类型选择对应的协议文本并生成头部"""
    if ext not in FILE_CONFIG: return ""
    conf = FILE_CONFIG[ext]
    
    # --- 核心修改：分流逻辑 ---
    # 如果是 .obj 文件，使用 CC 协议
    # 其他所有代码文件，使用 AGPL 协议
    if ext == '.obj':
        body = LICENSE_CC_TEXT.strip()
    else:
        body = LICENSE_AGPL_TEXT.strip()
    
    if conf.get('style') == 'block':
        # 针对 HTML 做特殊处理（因为 HTML 注释不同于 JS/CSS）
        if ext == '.html':
            return f"\n\n"
        return f"{conf['start']}\n{body}\n{conf['end']}\n\n"
        
    elif conf.get('style') == 'line':
        # 行注释模式
        lines = body.split('\n')
        commented_lines = []
        for line in lines:
            clean_line = line.strip().lstrip('*').strip()
            commented_lines.append(f"{conf['char']} {clean_line}" if clean_line else conf['char'])
        return "\n".join(commented_lines) + "\n\n"
    return ""

def strip_existing_header(content, ext):
    """
    智能移除现有的头部声明（支持 GNU, CC 等各种协议）
    """
    shebang_line = ""
    clean_content = content
    header_found = False

    # 1. 提取并暂时移除 Shebang
    if content.startswith("#!"):
        lines = content.splitlines(keepends=True)
        shebang_line = lines[0]
        clean_content = "".join(lines[1:])

    if ext not in FILE_CONFIG: 
        return clean_content, False, shebang_line
    
    conf = FILE_CONFIG[ext]

    # 2. 处理行注释 (Python / OBJ)
    if conf.get('style') == 'line':
        lines = clean_content.splitlines(keepends=True)
        new_lines = []
        reading_header = True 
        
        # 关键词列表：增加 Affero 以识别 AGPL
        keywords = ["Copyright", "License", "GNU", "Affero", "Creative Commons", "Project", "Rights Reserved"]

        for line in lines:
            stripped = line.strip()
            
            # 如果处于读取头部模式，且该行是注释
            if reading_header and stripped.startswith(conf['char']):
                is_keyword_line = any(k in line for k in keywords)
                # 检查是否是空注释行，或者是包含 * 的装饰行
                is_empty_comment = stripped == conf['char'] or stripped == f"{conf['char']} *" or stripped == f"{conf['char']} -"
                
                if is_keyword_line or is_empty_comment:
                    header_found = True
                    continue
                
                if header_found:
                    continue
            
            # 遇到空行，如果正在读头部且已经发现过头部内容，则跳过空行
            if reading_header and stripped == "" and header_found:
                continue

            # 一旦遇到非注释行，或者明显的代码，停止读取头部
            if reading_header and (not stripped.startswith(conf['char']) or stripped == ""):
                reading_header = False
            
            if not reading_header:
                new_lines.append(line)
        
        clean_content = "".join(new_lines).lstrip()

    # 3. 处理块注释 (JS / CSS / HTML)
    else:
        match = re.search(conf['pattern'], clean_content, re.DOTALL | re.MULTILINE)
        if match:
            if match.start() < 10: 
                clean_content = clean_content[match.end():].lstrip()
                header_found = True
        # 针对 HTML 的简单正则补充
        elif ext == '.html':
            html_pattern = r'^\s*\s*'
            match_html = re.search(html_pattern, clean_content, re.DOTALL | re.MULTILINE)
            if match_html and match_html.start() < 10:
                clean_content = clean_content[match_html.end():].lstrip()
                header_found = True

    return clean_content, header_found, shebang_line

def process_file(file_path, ext):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            original_content = f.read()

        clean_code, has_old_header, shebang = strip_existing_header(original_content, ext)
        new_license = generate_header_string(ext)
        
        # 组装
        final_content = ""
        if shebang:
            final_content = shebang + new_license + clean_code
        else:
            final_content = new_license + clean_code
        
        if original_content == final_content:
            return

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(final_content)
            
        # 根据扩展名显示不同的日志
        license_type = "CC-BY-NC" if ext == '.obj' else "AGPL-3.0"
        action = "更新协议" if has_old_header else "新增协议"
        print(f"  [{action} -> {license_type}] {os.path.basename(file_path)}")

    except Exception as e:
        print(f"  [错误] {os.path.basename(file_path)}: {e}")

def main():
    root_dir = os.getcwd()
    print(f"🔍 扫描目录: {root_dir}")
    print(f"🎯 目标配置: 代码(AGPL-3.0) + 模型(CC BY-NC 4.0)")
    print("-" * 50)
    
    count = 0
    # 忽略列表
    ignore_dirs = ['.git', 'node_modules', '__pycache__', 'venv', '.idea', '.vscode', 'dist', 'build']

    for subdir, dirs, files in os.walk(root_dir):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        
        for file in files:
            name, ext = os.path.splitext(file)
            if ext in FILE_CONFIG:
                file_path = os.path.join(subdir, file)
                process_file(file_path, ext)
                count += 1
                
    print("-" * 50)
    print(f"✅ 处理完成: {count} 个文件")

if __name__ == "__main__":
    main()