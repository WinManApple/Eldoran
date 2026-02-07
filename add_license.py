#!/usr/bin/env python3
# Project: Eldoran
# Copyright (C) 2026 WinManApple
#
# This work is licensed under the Creative Commons Attribution-NonCommercial
# 4.0 International License. To view a copy of this license, visit
# http://creativecommons.org/licenses/by-nc/4.0/

import os
import re

# --- 配置区域 ---
PROJECT_NAME = "Eldoran"
AUTHOR = "WinManApple"
YEAR = "2026"

# 核心协议文本 (CC BY-NC 4.0)
LICENSE_BODY_TEXT = f"""
 * Project: {PROJECT_NAME}
 * Copyright (C) {YEAR} {AUTHOR}
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
"""

# 文件处理配置
FILE_CONFIG = {
    '.js': {
        'pattern': r'^\s*/\*.*?(?:Copyright|License|Creative Commons).*?\*/\s*',
        'start': '/*', 'end': '*/', 'style': 'block'
    },
    '.css': {
        'pattern': r'^\s*/\*.*?(?:Copyright|License|Creative Commons).*?\*/\s*',
        'start': '/*', 'end': '*/', 'style': 'block'
    },
    '.html': {
        'pattern': r'^\s*\s*',
        'start': '', 'style': 'block'
    },
    '.obj': {
        'style': 'line', 'char': '#'
    },
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
        # 行注释模式
        lines = body.split('\n')
        commented_lines = []
        for line in lines:
            # 去掉原文本中可能自带的 * 号前缀，避免由 python 生成时变成 # * *
            clean_line = line.strip().lstrip('*').strip()
            commented_lines.append(f"{conf['char']} {clean_line}" if clean_line else conf['char'])
        return "\n".join(commented_lines) + "\n\n"
    return ""

def strip_existing_header(content, ext):
    """
    智能移除现有的头部声明（支持 GNU, CC 等各种协议）
    返回: (剥离后的纯代码内容, 是否发现了旧头部, Shebang行)
    """
    shebang_line = ""
    clean_content = content
    header_found = False

    # 1. 提取并暂时移除 Shebang
    if content.startswith("#!"):
        lines = content.splitlines(keepends=True)
        shebang_line = lines[0]
        clean_content = "".join(lines[1:]) # 剩余内容

    if ext not in FILE_CONFIG: 
        return clean_content, False, shebang_line
    
    conf = FILE_CONFIG[ext]

    # 2. 处理行注释 (Python / Configs)
    if conf.get('style') == 'line':
        lines = clean_content.splitlines(keepends=True)
        new_lines = []
        reading_header = True # 假设文件开头就是头部
        
        # 关键词列表：只要注释行包含这些词，就认为是协议头的一部分
        keywords = ["Copyright", "License", "GNU", "Creative Commons", "Project", "Rights Reserved"]

        for line in lines:
            stripped = line.strip()
            
            # 如果处于读取头部模式，且该行是注释
            if reading_header and stripped.startswith(conf['char']):
                # 检查是否是空注释行，或者是包含关键词的行
                is_keyword_line = any(k in line for k in keywords)
                is_empty_comment = stripped == conf['char'] or stripped == f"{conf['char']} *"
                
                # 这是一个协议行，跳过（即删除）
                if is_keyword_line or is_empty_comment:
                    header_found = True
                    continue
                
                # 如果是注释但没有关键词，且我们已经找到了至少一个协议关键词，那它可能也是协议的一部分
                if header_found:
                    continue
                
                # 如果还没找到协议关键词，但这行只是个普通注释（比如 # import area），那可能不是协议头
                # 但为了安全，如果它紧挨着顶部，我们通常假设它是旧头。
                # 此处策略：只要是顶部连续的注释块，都视为待处理区域，除非它是明确的代码说明
                if header_found: 
                    continue
            
            # 遇到空行，如果正在读头部且已经发现过头部内容，则跳过空行
            if reading_header and stripped == "" and header_found:
                continue

            # 一旦遇到非注释行，或者明显的代码，停止读取头部
            if reading_header and (not stripped.startswith(conf['char']) or stripped == ""):
                reading_header = False
            
            # 保存正文
            if not reading_header:
                new_lines.append(line)
        
        clean_content = "".join(new_lines).lstrip()

    # 3. 处理块注释 (JS / CSS / HTML)
    else:
        # 使用正则非贪婪匹配头部
        match = re.search(conf['pattern'], clean_content, re.DOTALL | re.MULTILINE)
        if match:
            # 只有当匹配内容在文件开头（允许少量空白）时才移除
            if match.start() < 10: 
                clean_content = clean_content[match.end():].lstrip()
                header_found = True

    return clean_content, header_found, shebang_line

def process_file(file_path, ext):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            original_content = f.read()

        # 1. 剥离旧头部，并分离 Shebang
        clean_code, has_old_header, shebang = strip_existing_header(original_content, ext)
        
        # 2. 生成新协议头
        new_license = generate_header_string(ext)
        
        # 3. 组装最终内容
        # 顺序必须是：Shebang -> 新协议 -> 原始内容
        final_content = ""
        if shebang:
            final_content = shebang + new_license + clean_code
        else:
            final_content = new_license + clean_code
        
        # 4. 智能比对（防止无意义的写入）
        if original_content == final_content:
            return # 内容完全一致，跳过

        # 5. 写入文件
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(final_content)
            
        action = "更新协议" if has_old_header else "新增协议"
        print(f"  [{action}] {os.path.basename(file_path)}")

    except Exception as e:
        print(f"  [错误] {os.path.basename(file_path)}: {e}")

def main():
    root_dir = os.getcwd()
    print(f"🔍 扫描目录: {root_dir}")
    print(f"🎯 目标协议: CC BY-NC 4.0")
    print("-" * 40)
    
    count = 0
    # 忽略列表
    ignore_dirs = ['.git', 'node_modules', '__pycache__', 'venv', '.idea', '.vscode']

    for subdir, dirs, files in os.walk(root_dir):
        # 原地修改 dirs 列表以剪枝
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        
        for file in files:
            name, ext = os.path.splitext(file)
            if ext in FILE_CONFIG:
                file_path = os.path.join(subdir, file)
                process_file(file_path, ext)
                count += 1
                
    print("-" * 40)
    print(f"✅ 处理完成: {count} 个文件")

if __name__ == "__main__":
    main()