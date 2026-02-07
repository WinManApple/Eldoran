#!/usr/bin/env python3
# * Project: Eldoran
# Copyright (C) 2026 WinAppleMan
# *
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
# *
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
# *
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

import os
import re

# --- 配置区域 ---
PROJECT_NAME = "Eldoran"
AUTHOR = "WinAppleMan"
YEAR = "2026"

# 核心协议文本 (标准源)
LICENSE_BODY_TEXT = f"""
 * Project: {PROJECT_NAME}
 * Copyright (C) {YEAR} {AUTHOR}
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""

# 定义如何处理不同文件类型
# pattern: 用于匹配现有文件头部的正则表达式（用来识别旧声明）
# style: 'block' (块注释 /* ... */) 或 'line' (行注释 # ...)
FILE_CONFIG = {
    '.js': {
        'pattern': r'^\s*/\*.*?(?:Copyright|License).*?\*/\s*',
        'start': '/*', 'end': '*/', 'style': 'block'
    },
    '.css': {
        'pattern': r'^\s*/\*.*?(?:Copyright|License).*?\*/\s*',
        'start': '/*', 'end': '*/', 'style': 'block'
    },
    '.html': {
        'pattern': r'^\s*\s*',
        'start': '', 'style': 'block'
    },
    '.obj': {
        'style': 'line', 'char': '#'
    },
    # 【新增】支持 Python 文件（包括脚本自己）
    '.py': {
        'style': 'line', 'char': '#'
    }
}

def generate_header_string(ext):
    """生成标准的目标头部字符串"""
    if ext not in FILE_CONFIG: return ""
    conf = FILE_CONFIG[ext]
    
    body = LICENSE_BODY_TEXT.strip()
    
    if conf.get('style') == 'block':
        return f"{conf['start']}\n{body}\n{conf['end']}\n\n"
    elif conf.get('style') == 'line':
        # 行注释模式：每一行加注释符
        lines = body.replace(' * ', '').split('\n')
        # 针对 Python 特别处理：如果有 shebang (#!/usr/bin...), 这里不包含它，
        # shebang 需要单独保留在文件最顶端，协议跟在后面。
        commented_lines = [f"{conf['char']} {line.strip()}" for line in lines]
        return "\n".join(commented_lines) + "\n\n"
    return ""

def strip_existing_header(content, ext):
    """
    尝试移除现有的头部声明。
    返回: (剥离后的纯代码内容, 是否发现了旧头部)
    """
    if ext not in FILE_CONFIG: return content, False
    conf = FILE_CONFIG[ext]

    # 针对 .obj / .py 的行注释处理逻辑
    if conf.get('style') == 'line':
        lines = content.splitlines(keepends=True)
        new_lines = []
        header_found = False
        reading_header = True
        shebang_line = ""

        for i, line in enumerate(lines):
            # 特殊处理：保留 Shebang (#!/...)
            if i == 0 and line.startswith("#!"):
                shebang_line = line
                continue

            # 如果还在读头部，且行以注释符开头，且包含版权关键字，视为头部
            if reading_header and line.strip().startswith(conf['char']):
                if "Copyright" in line or "License" in line or "Project" in line:
                    header_found = True
                    continue # 跳过这一行（即删除它）
                # 如果是纯粹的空注释行，或者是紧接着协议的空行，也可能属于头部的一部分
                if header_found and (line.strip() == conf['char'] or line.strip() == ""):
                    continue
            
            # 一旦遇到非注释行，头部读取结束
            if reading_header and not line.strip().startswith(conf['char']) and line.strip() != "":
                reading_header = False
            
            # 保存非头部的内容
            if not reading_header:
                new_lines.append(line)
        
        # 移除开头的过多空行
        clean_content = "".join(new_lines).lstrip()
        
        # 如果有 shebang，把它加回最前面
        if shebang_line:
            clean_content = shebang_line + "\n" + clean_content
            
        return clean_content, header_found

    # 针对 js/html/css 的正则块处理逻辑
    else:
        match = re.search(conf['pattern'], content, re.DOTALL | re.MULTILINE)
        if match:
            clean_content = content[match.end():] 
            return clean_content, True
        else:
            return content, False

def process_file(file_path, ext):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            original_content = f.read()

        # 1. 生成目标头部
        target_header = generate_header_string(ext)
        
        # 2. 剥离旧头部
        clean_code, has_old_header = strip_existing_header(original_content, ext)
        
        # 特殊处理：如果是 .py 文件且有 shebang，需要把头部插在 shebang 后面
        final_content = ""
        if ext == '.py' and clean_code.startswith("#!"):
            # 分离 shebang 和其余代码
            lines = clean_code.splitlines(keepends=True)
            shebang = lines[0]
            rest_code = "".join(lines[1:]).lstrip()
            final_content = shebang + target_header + rest_code
        else:
            final_content = target_header + clean_code
        
        # 3. 智能比对
        if original_content == final_content:
            print(f"  [跳过] 内容一致: {os.path.basename(file_path)}")
            return

        # 4. 写入文件
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(final_content)
            
        action = "覆盖" if has_old_header else "新增"
        print(f"  [{action}] 更新协议: {os.path.basename(file_path)}")

    except Exception as e:
        print(f"  [错误] {os.path.basename(file_path)}: {e}")

def main():
    root_dir = os.getcwd()
    print(f"🔍 正在扫描: {root_dir}")
    print(f"🎯 目标协议: {PROJECT_NAME} (C) {YEAR} {AUTHOR}")
    print("-" * 40)
    
    count = 0
    # 获取当前脚本的文件名，避免逻辑死循环（虽然逻辑已经处理了，但防一手）
    current_script = os.path.basename(__file__)

    for subdir, dirs, files in os.walk(root_dir):
        if '.git' in dirs: dirs.remove('.git')
        if 'node_modules' in dirs: dirs.remove('node_modules')
        
        for file in files:
            name, ext = os.path.splitext(file)
            if ext in FILE_CONFIG:
                process_file(os.path.join(subdir, file), ext)
                count += 1
                
    print("-" * 40)
    print(f"✅ 扫描结束，处理了 {count} 个文件。")

if __name__ == "__main__":
    main()