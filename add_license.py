#!/usr/bin/env python3
# Project: Eldoran License Manager (Auto-Updater)
# Copyright (C) 2026 WinManApple
# 
# 功能：
# 1. 自动识别并移除旧的协议头（无论旧头部的年份或作者写的是什么）。
# 2. 根据当前配置生成全新的协议头。
# 3. 智能处理 Shebang (#!...)。
# 4. 只支持 .js, .css, .html, .py, .obj (已移除 .vue)。

import os
import re

# ==========================================
# 🔧 配置区域 (后续修改这里即可)
# ==========================================
CONFIG = {
    "PROJECT_NAME": "Eldoran",
    "AUTHOR": "WinManApple",      # 后续改名直接改这里
    "YEAR": "2026",               # 到了2027年直接改这里
}

# 1. 代码文件的协议模板 (AGPL-3.0)
LICENSE_AGPL_TEMPLATE = """
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

# 2. 资源文件的协议模板 (CC BY-NC-SA 4.0)
LICENSE_CC_TEMPLATE = """
 * Project: {PROJECT_NAME}
 * Copyright (C) {YEAR} {AUTHOR}
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc-sa/4.0/
"""

# 文件类型定义 (已移除 .vue)
FILE_TYPES = {
    '.js':   {'style': 'block', 'start': '/*',   'end': '*/'},
    '.css':  {'style': 'block', 'start': '/*',   'end': '*/'},
    '.html': {'style': 'block', 'start': ''}, # HTML 专用注释
    '.obj':  {'style': 'line',  'char': '#'},
    '.py':   {'style': 'line',  'char': '#'}
}

# ==========================================
# 🚀 核心逻辑
# ==========================================

def get_new_header_content(ext):
    """根据扩展名渲染最新的协议文本"""
    # 渲染模板
    if ext == '.obj':
        raw_text = LICENSE_CC_TEMPLATE.format(**CONFIG).strip()
    else:
        raw_text = LICENSE_AGPL_TEMPLATE.format(**CONFIG).strip()
    
    conf = FILE_TYPES[ext]
    
    # 格式化为注释块
    if conf['style'] == 'block':
        return f"{conf['start']}\n{raw_text}\n{conf['end']}\n\n"
    elif conf['style'] == 'line':
        lines = raw_text.split('\n')
        formatted = []
        for line in lines:
            # 去除首尾空白和可能存在的星号，重新包装
            clean = line.strip().lstrip('*').strip()
            if clean:
                formatted.append(f"{conf['char']} {clean}")
            else:
                formatted.append(conf['char'])
        return "\n".join(formatted) + "\n\n"
    return ""

def remove_old_header(content, ext):
    """
    智能移除旧头部。
    不匹配具体的作者名/年份，而是匹配 'Copyright' 或 'License' 等特征词。
    """
    if ext not in FILE_TYPES: return content, ""
    
    clean_content = content
    shebang = ""
    conf = FILE_TYPES[ext]
    
    # 1. 提取 Shebang (保留 Python/Shell 的 #! 行)
    if content.startswith("#!"):
        lines = content.splitlines(keepends=True)
        shebang = lines[0]
        clean_content = "".join(lines[1:])
    
    # 特征关键词 (只要头部包含这些词之一，就认为是旧协议头)
    # 这确保了即使你改了作者名，旧的 WinManApple 头部也能被识别并替换
    keywords = ["Copyright", "License", "GNU", "Affero", "Creative Commons", "Rights Reserved"]
    keywords_pattern = "|".join(keywords)
    
    # 2. 块注释移除逻辑 (JS, CSS, HTML)
    if conf['style'] == 'block':
        s_esc = re.escape(conf['start'])
        e_esc = re.escape(conf['end'])
        # 正则：匹配文件开头的注释块，且该块内包含关键词
        # ^\s* 允许开头有空白
        pattern = re.compile(
            rf'^\s*{s_esc}.*?(?:{keywords_pattern}).*?{e_esc}\s*', 
            re.DOTALL | re.MULTILINE | re.IGNORECASE
        )
        match = pattern.match(clean_content)
        if match:
            # 截取掉匹配到的头部
            clean_content = clean_content[match.end():].lstrip()
            
    # 3. 行注释移除逻辑 (Python, OBJ)
    elif conf['style'] == 'line':
        lines = clean_content.splitlines(keepends=True)
        new_lines = []
        in_header = True # 假设一开始是在头部区域
        
        char = conf['char']
        
        for line in lines:
            stripped = line.strip()
            
            if in_header:
                # 如果是空行，或者是以注释符开头的
                if stripped == "" or stripped.startswith(char):
                    # 如果这行包含关键词，那肯定是头部，继续忽略
                    if any(k in line for k in keywords):
                        continue
                    # 如果是纯装饰线 (###, # ---)，继续忽略
                    if set(stripped.replace(char, '').strip()) <= {'-', '*', '=', '#'}:
                        continue
                    # 如果是普通注释但紧跟在头部之后，为了安全，我们设定：
                    # 只要连续的注释块里出现了关键词，整个块都被视为协议头。
                    # 但为了防止删掉真正的代码注释，我们采取更保守策略：
                    # 只有包含关键词的行，以及它上下的装饰行才算。
                    # (简化策略：只要还在头部区域，且是注释，就认为是头部的一部分，直到遇到代码)
                    continue 
                else:
                    # 遇到非注释行（代码），头部区域结束
                    in_header = False
                    new_lines.append(line)
            else:
                # 头部已结束，保留后续所有内容
                new_lines.append(line)
        
        clean_content = "".join(new_lines).lstrip()

    return clean_content, shebang

def process_file(file_path):
    _, ext = os.path.splitext(file_path)
    if ext not in FILE_TYPES: return

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            original_content = f.read()

        # 1. 移除旧头 (无论旧头长什么样)
        content_no_header, shebang = remove_old_header(original_content, ext)
        
        # 2. 生成新头 (根据当前 CONFIG)
        new_header = get_new_header_content(ext)
        
        # 3. 拼接
        final_content = (shebang + new_header + content_no_header)
        
        # 4. 对比是否有变化 (避免修改未变文件导致 Git 变动)
        if final_content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(final_content)
            print(f"✅ 更新: {os.path.basename(file_path)}")
        else:
            # 文件内容一致，无需写入
            pass

    except Exception as e:
        print(f"❌ 错误 {file_path}: {e}")

def main():
    root_dir = os.getcwd()
    print(f"🎯 正在更新协议头...")
    print(f"   项目: {CONFIG['PROJECT_NAME']}")
    print(f"   作者: {CONFIG['AUTHOR']}")
    print(f"   年份: {CONFIG['YEAR']}")
    print("-" * 40)

    # 忽略列表
    ignore_dirs = {'.git', 'node_modules', '__pycache__', 'venv', 'dist', 'build'}
    
    count = 0
    for subdir, dirs, files in os.walk(root_dir):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        for file in files:
            if file == os.path.basename(__file__): continue # 跳过脚本自己
            
            ext = os.path.splitext(file)[1]
            if ext in FILE_TYPES:
                process_file(os.path.join(subdir, file))
                count += 1
                
    print("-" * 40)
    print(f"✨ 完成！扫描并处理了 {count} 个文件。")

if __name__ == "__main__":
    main()