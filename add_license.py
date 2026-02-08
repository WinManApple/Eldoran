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

# 1. 代码文件的协议 (AGPL-3.0) - 标准版
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

# 2. 资源文件的协议 (CC BY-NC-SA 4.0) - 修正版
# 注意：这里增加了 ShareAlike (SA) 以符合你的混合授权策略
LICENSE_CC_TEXT = f"""
 * Project: {PROJECT_NAME}
 * Copyright (C) {YEAR} {AUTHOR}
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc-sa/4.0/
"""

# 文件处理配置
FILE_CONFIG = {
    '.js': {
        'style': 'block', 'start': '/*', 'end': '*/'
    },
    '.css': {
        'style': 'block', 'start': '/*', 'end': '*/'
    },
    '.html': {
        'style': 'block', 'start': ''  # 修复：HTML使用正确的注释符
    },
    '.vue': {
        'style': 'block', 'start': ''  # 新增：Vue通常使用HTML注释在顶层
    },
    '.obj': {
        'style': 'line', 'char': '#'
    },
    '.py': {
        'style': 'line', 'char': '#'
    }
}

def get_license_body(ext):
    """根据文件扩展名返回纯文本内容的协议"""
    # 只有 .obj (模型) 使用 CC 协议，其他所有逻辑代码(含HTML/Vue)均属于 AGPL
    if ext == '.obj':
        return LICENSE_CC_TEXT.strip()
    return LICENSE_AGPL_TEXT.strip()

def generate_header_string(ext):
    """生成带注释符号的完整头部"""
    if ext not in FILE_CONFIG: return ""
    conf = FILE_CONFIG[ext]
    body = get_license_body(ext)
    
    if conf['style'] == 'block':
        # 块注释：两头包裹
        return f"{conf['start']}\n{body}\n{conf['end']}\n\n"
        
    elif conf['style'] == 'line':
        # 行注释：每行加前缀
        lines = body.split('\n')
        commented_lines = []
        for line in lines:
            # 去掉开头可能存在的 * 号，重新格式化
            clean_line = line.strip().lstrip('*').strip()
            if clean_line:
                commented_lines.append(f"{conf['char']} {clean_line}")
            else:
                commented_lines.append(conf['char'])
        return "\n".join(commented_lines) + "\n\n"
    return ""

def strip_existing_header(content, ext):
    """移除旧的协议头"""
    if ext not in FILE_CONFIG: return content, False, ""
    
    clean_content = content
    shebang_line = ""
    header_found = False

    # 1. 提取 Shebang (#!/usr/bin/env python3)
    if content.startswith("#!"):
        lines = content.splitlines(keepends=True)
        shebang_line = lines[0]
        clean_content = "".join(lines[1:])

    conf = FILE_CONFIG[ext]
    
    # 关键词匹配，防止误删正常注释
    keywords = ["Copyright", "License", "GNU", "Affero", "Creative Commons", "Rights Reserved"]
    
    # 简单的移除逻辑：检查文件开头的注释块
    # 这里为了稳健，我们只移除文件头部连续的、包含关键词的注释
    
    lines = clean_content.splitlines(keepends=True)
    new_lines = []
    in_header_block = True
    processed_count = 0
    
    # 块注释模式检测 (HTML, JS, CSS, VUE)
    if conf['style'] == 'block':
        # 简单的正则清理，匹配开头的注释块
        start_esc = re.escape(conf['start'])
        end_esc = re.escape(conf['end'])
        # 匹配位于文件开头的注释块
        pattern = re.compile(rf'^\s*{start_esc}.*?(?:{"|".join(keywords)}).*?{end_esc}\s*', re.DOTALL | re.MULTILINE)
        
        match = pattern.match(clean_content)
        if match:
            clean_content = clean_content[match.end():]
            header_found = True
            return clean_content.lstrip(), header_found, shebang_line
            
    # 行注释模式检测 (Python, OBJ)
    elif conf['style'] == 'line':
        for line in lines:
            stripped = line.strip()
            
            # 如果还在头部检测阶段
            if in_header_block:
                # 是空行 -> 继续
                if stripped == "":
                    continue
                # 是注释行
                if stripped.startswith(conf['char']):
                    # 检查是否包含协议关键词
                    if any(k in line for k in keywords):
                        header_found = True
                        continue # 丢弃该行
                    # 如果已经是头部了，且是纯装饰性的注释 (# ----)
                    elif header_found and (stripped == conf['char'] or set(stripped.replace(conf['char'], '').strip()) <= {'-', '*', '='}):
                        continue # 丢弃装饰行
                    # 遇到一个不包含关键词的注释，如果之前没发现过头部，那这可能只是普通注释
                    elif not header_found:
                         # 假设这不是协议头，结束检测
                         in_header_block = False
                         new_lines.append(line)
                    # 之前发现过头部，现在又来个不含关键词的注释，可能还是头部的一部分，继续丢弃
                    else:
                        continue
                else:
                    # 遇到非注释行（代码），结束
                    in_header_block = False
                    new_lines.append(line)
            else:
                # 非头部区域，直接保留
                new_lines.append(line)
        
        clean_content = "".join(new_lines)

    return clean_content.lstrip(), header_found, shebang_line

def process_file(file_path, ext):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            original_content = f.read()

        clean_code, has_old_header, shebang = strip_existing_header(original_content, ext)
        new_header = generate_header_string(ext)
        
        final_content = ""
        if shebang:
            final_content = shebang + new_header + clean_code
        else:
            final_content = new_header + clean_code
        
        # 如果内容没有实质变化（比如已经是最新协议），则不写入，减少磁盘IO和修改时间变更
        if original_content == final_content:
            return

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(final_content)
            
        license_type = "CC-BY-NC-SA" if ext == '.obj' else "AGPL-3.0"
        action = "🔄 更新" if has_old_header else "➕ 新增"
        print(f"  [{action} {license_type}] {os.path.basename(file_path)}")

    except Exception as e:
        print(f"  [❌ 错误] {os.path.basename(file_path)}: {e}")

def main():
    root_dir = os.getcwd()
    print(f"🔍 扫描目录: {root_dir}")
    print(f"🎯 协议策略: 代码(.js/.css/.py/.html) -> AGPL-3.0 | 资产(.obj) -> CC BY-NC-SA")
    print("-" * 60)
    
    count = 0
    # 忽略列表
    ignore_dirs = {'.git', 'node_modules', '__pycache__', 'venv', '.idea', '.vscode', 'dist', 'build', 'public'}
    # 忽略文件
    ignore_files = {'LICENSE', 'README.md', '.gitignore'}

    for subdir, dirs, files in os.walk(root_dir):
        # 原地修改 dirs 列表以剪枝
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        
        for file in files:
            if file in ignore_files: continue
            
            name, ext = os.path.splitext(file)
            if ext in FILE_CONFIG:
                file_path = os.path.join(subdir, file)
                process_file(file_path, ext)
                count += 1
                
    print("-" * 60)
    print(f"✅ 处理完成: 共扫描并处理 {count} 个文件")

if __name__ == "__main__":
    main()