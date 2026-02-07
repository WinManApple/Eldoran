/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/LLM/filters/JSON_Repair.js

/**
 * JSON 修复工具 (V4.1 - 修复版)
 * 针对 H互动系统 (结构严谨) 和 聊天系统 (流式宽容) 提供不同的修复管线
 */
export const JSON_Repair = {

    /**
     * ============================================================
     * 核心策略 A: 严格 JSON 修复 (通用)
     * 目标: 确保输出为合法的 JSON 对象或数组，绝不接受残缺结构
     * 适用: H_System, Summary, Grand_Summary, Attributes
     * ============================================================
     */
    repairForStrict(content) {
        if (!content || typeof content !== 'string') return "{}";
        let str = this._basicClean(content);

        // 1. [关键] 智能提取最外层结构 (优先匹配范围最广的)
        const firstBrace = str.indexOf('{');
        const firstBracket = str.indexOf('[');
        
        let start = -1; 
        let end = -1;
        // isArray 标记暂不需要导出，但逻辑里保留判断
        // let isArray = false;

        // 逻辑：谁先出现且有效，就以谁为尊
        if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
            start = firstBracket;
            end = str.lastIndexOf(']');
            // isArray = true;
        } else if (firstBrace !== -1) {
            start = firstBrace;
            end = str.lastIndexOf('}');
        }

        if (start !== -1 && end !== -1 && end > start) {
            str = str.substring(start, end + 1);
        } else {
            console.warn("[JSON_Repair] 无法提取有效 JSON 结构");
            return "{}";
        }

        // 2. 深度语法修复 (Key: Value 对引号极其敏感)
        
        // 2.1 修复 Key 的引号
        str = str.replace(/([{,]\s*)([a-zA-Z0-9_\-]+?)\s*:/g, '$1"$2":');
        str = str.replace(/'([a-zA-Z0-9_\-]+?)'\s*:/g, '"$1":');

        // 2.2 修复全角双引号 (智能上下文)
        str = str.replace(/([{,]\s*)“([^”\n]*)”\s*:/g, '$1"$2":'); // Key
        str = str.replace(/:\s*“/g, ': "'); // Value Start
        str = str.replace(/”(\s*[:},\]])/g, '"$1'); // Value End
        str = str.replace(/(\[\s*)“/g, '$1"'); // Array Start

        // 2.3 修复尾部逗号 (Trailing Commas)
        str = str.replace(/,(\s*[}\]])/g, '$1');

        // 2.4 移除 Markdown 代码块残留
        str = str.replace(/```json/gi, "").replace(/```/g, "");

        return str;
    },

    /**
     * 别名：为了兼容旧代码，repairForH 直接调用 repairForStrict
     */
    repairForH(content) {
        return this.repairForStrict(content);
    },

    /**
     * ============================================================
     * 策略 B: Chat_System 专用修复 (针对 Action_Chat)
     * 目标: 辅助 _parseLinearChat 正则，保留单引号，保留换行
     * ============================================================
     */
    repairForChat(content) {
        if (!content || typeof content !== 'string') return "{}";
        let str = this._basicClean(content);

        // 1. 去头去尾的 Markdown
        str = str.replace(/^[\s\n]*```\w*[\s\n]*/, ""); 
        str = str.replace(/[\s\n]*```[\s\n]*$/, "");   

        // 2. 宽松提取 (如果有大括号就提取，没有就保持原样)
        const hasBrace = str.indexOf('{') !== -1;
        if (hasBrace) {
            const first = str.indexOf('{');
            const last = str.lastIndexOf('}');
            if (first !== -1 && last > first) {
                str = str.substring(first, last + 1);
            }
        }

        // 3. 修复冒号
        str = str.replace(/"\s*[-=]\s*"/g, '": "'); 
        str = str.replace(/：/g, ':'); 

        return str;
    },


    /**
     * ============================================================
     * 策略 C: 脚本指令专用清洗 (Action_LLM)
     * 目标: 移除 Markdown、HTML 转义、注释，但绝不破坏字符串内部的符号
     * ============================================================
     */
    cleanForScript(content) {
        if (!content || typeof content !== 'string') return "";
        
        let str = content;

        // 1. 移除 Markdown 代码块包裹
        str = str.replace(/^[\s\n]*```\w*[\s\n]*/, ""); 
        str = str.replace(/[\s\n]*```[\s\n]*$/, "");

        // 2. HTML 实体还原 (防止 XML 解析导致的 &gt; 报错)
        str = str.replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')
                 .replace(/&amp;/g, '&')
                 .replace(/&quot;/g, '"')
                 .replace(/&apos;/g, "'");

        // 3. 安全移除注释 (关键步骤)
        // 策略: 
        // - 移除 /* ... */ 块注释
        // - 移除 // ... 行注释 (前提是 // 前面必须是空白符，防止误伤 http://)
        str = str.replace(/(\/\*(?:[\s\S]*?)\*\/)|(\s\/\/.*$)/gm, "");

        return str.trim();
    },

    /**
     * 策略 D: 开局数据专用修复 (针对 Task_Custom_Opening)
     * 目标: 处理长文本 JSON，容忍 LLM 可能的 Markdown 格式错误，严格提取最外层对象
     */
    repairForOpening(content) {
        // 开局数据是一个大的 JSON 对象，直接复用 strict 策略以确保结构完整
        // 如果未来发现 LLM 容易在 items 数组处截断，可以在这里增加自动补全逻辑
        return this.repairForStrict(content);
    },

    /**
     * 开局数据安全解析入口
     */
    safeParseOpening(content) {
        const repaired = this.repairForOpening(content);
        try {
            return JSON.parse(repaired);
        } catch (e) {
            console.error("[JSON_Repair::Opening] 解析失败，原始数据可能损坏:", e);
            return null;
        }
    },

    /**
     * 公共清洗逻辑(保留给 JSON 使用，Script 不调用此方法以免误伤)
     */
    _basicClean(str) {
        // 替换特殊空白符
        str = str.replace(/[\u00A0\u3000]/g, " ");
        // 移除 JS 注释
        str = str.replace(/(\/\*(?:[\s\S]*?)\*\/)|(\s\/\/.*$)/gm, "");
        return str.trim();
    },

    /**
     * ============================================================
     * 通用安全解析入口 (新增方法，解决报错)
     * ============================================================
     */
    
    /**
     * 通用安全解析 (默认使用严格策略)
     * @param {string} content 
     * @returns {Object|null} 解析成功返回对象，失败返回 null
     */
    safeParse(content) {
        // 使用严格修复策略 (适用于 Summary, GrandSummary 等结构化数据)
        const repaired = this.repairForStrict(content);
        try {
            return JSON.parse(repaired);
        } catch (e) {
            console.error("[JSON_Repair] 通用解析失败:", e);
            return null;
        }
    },

    /**
     * H 系统专用安全解析 (保留此方法以兼容 Action_H_Interaction)
     */
    safeParseH(content) {
        const repaired = this.repairForH(content); // 实际也是调用 strict
        try {
            return JSON.parse(repaired);
        } catch (e) {
            console.error("[JSON_Repair::H] 解析失败:", e);
            return null;
        }
    },

    /**
     * Chat 系统清洗 (返回字符串)
     */
    cleanForChat(content) {
        return this.repairForChat(content);
    },
    
    /**
     * Code 清洗
     */
    cleanCode(content) {
        if (!content || typeof content !== 'string') return "";
        let str = content;
        str = str.replace(/^[\s\n]*```\w*[\s\n]*/, ""); 
        str = str.replace(/[\s\n]*```[\s\n]*$/, "");
        str = str.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        return str.trim();
    }
};