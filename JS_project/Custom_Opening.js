/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// Custom_Opening.js
// 运行环境: SillyTavern 插件后台 (TavernHelper 环境)
// 职责: 处理 'OPENING' 指令 - 纯粹的 Prompt 构建器

(function() {
    // 增加版本号以便在控制台确认是否加载了最新版
    console.log("🚀 [Custom_Opening] 正在加载 (v2.0 - Refactored)...");
    
    if (!window.parent) return;

    // 确保命名空间存在
    window.parent.RPG_LLM_HANDLERS = window.parent.RPG_LLM_HANDLERS || {};

    // ==========================================
    // 配置区域
    // ==========================================
    const CONFIG = {
        LOREBOOK_NAME: "Eldoran",
        // 对应世界书条目的 Comment/备注
        ENTRY_NAME: "Custom_Opening" 
    };

    // ==========================================
    // 注册处理器: OPENING
    // ==========================================
    window.parent.RPG_LLM_HANDLERS['OPENING'] = {
        
        /**
         * 构建 Prompt
         * @param {Object} params - 前端 Call_Custom_Opening.js 传来的参数
         * @param {string} params.customOpeningSkeleton - 待填充的 JSON 骨架字符串
         * @param {string} params.userPlotDesign - 用户的剧情设计意图
         */
        buildPrompt: async (params) => {
            const helper = window.parent.TavernHelper || window.TavernHelper;
            // 严谨一点，如果 helper 不存在则返回空字符串或错误标记，防止 ST_Manager 崩溃
            if (!helper) {
                console.error("❌ [Custom_Opening] TavernHelper 未找到");
                return "";
            }

            try {
                // 1. 获取世界书
                const entries = await helper.getLorebookEntries(CONFIG.LOREBOOK_NAME);
                if (!entries) throw new Error(`无法读取世界书: ${CONFIG.LOREBOOK_NAME}`);

                const entriesArray = Array.isArray(entries) ? entries : Object.values(entries);

                // 2. 查找目标模板条目
                const targetEntry = entriesArray.find(e => e.comment === CONFIG.ENTRY_NAME);
                if (!targetEntry) {
                    throw new Error(`未找到世界书条目: ${CONFIG.ENTRY_NAME}`);
                }

                let template = targetEntry.content;

                // 3. 执行宏替换: {{Custom_Opening}} (骨架)
                const skeleton = params.customOpeningSkeleton || "{}";
                // 使用回调函数替换，防止 JSON 字符串中的特殊字符($等)破坏正则
                template = template.replace(/{{Custom_Opening}}/g, () => skeleton);

                // 4. 执行宏替换: {{User_Plot_Design}} (用户剧情想法)
                const plotDesign = params.userPlotDesign || "无特殊要求";
                template = template.replace(/{{User_Plot_Design}}/g, () => plotDesign);

                // 日志只在构建成功时输出，减少刷屏
                // console.log(`✅ [Custom_Opening] Prompt 构建成功 (Length: ${template.length})`);
                
                return template;

            } catch (error) {
                console.error("❌ [Custom_Opening] 构建失败:", error);
                // 返回包含错误信息的 Prompt，这样 LLM 或者 Log 就能看到错误，
                // 或者 ST_Manager 可以捕获这个特定的错误格式
                return `[System Error: ${error.message}]`;
            }
        }
        
        // 已移除 parseResponse，数据清洗全权交给游戏端 Action_Custom_Opening.js
    };

    console.log("✅ [Custom_Opening] 处理器已就绪");
})();