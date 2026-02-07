/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// Node_Genertate.js
// 运行环境：酒馆助手脚本后台

(function() {
    console.log("🎲 [Node_Genertate] 正在加载...");
    if (!window.parent) return;

    window.parent.RPG_LLM_HANDLERS = window.parent.RPG_LLM_HANDLERS || {};
    window.parent.RPG_CONTEXT = window.parent.RPG_CONTEXT || {
        playerStateMacro: "暂无玩家战力数据",
        processedEntries: {}
    };

    const CONFIG = {
        LOREBOOK_NAME: "Eldoran",
        ENTRY_COMMENT: "Node_Generate"
    };

    window.parent.RPG_LLM_HANDLERS['NODE_GENERATE'] = {
        buildPrompt: async (params) => {
            const helper = window.parent.TavernHelper || window.TavernHelper;
            if (!helper) return "";

            try {

                // 1. 获取模板 (直接读取，不再依赖 RPG_CONTEXT 缓存，保证实时性)
                const entries = await helper.getLorebookEntries(CONFIG.LOREBOOK_NAME);
                const entriesArray = Array.isArray(entries) ? entries : Object.values(entries || {});
                const targetEntry = entriesArray.find(e => e.comment === CONFIG.ENTRY_COMMENT);
                
                if (!targetEntry) throw new Error(`未找到条目: ${CONFIG.ENTRY_COMMENT}`);
                let template = targetEntry.content;

                // 🟢 1. 处理玩家数据宏替换 {{Player_State_WithoutHstate}}
                // 逻辑已前移至 Call_Node_Generate.js，直接接收处理好的字符串
                // 使用回调函数 () => val 替换，防止特殊字符干扰
                const playerStateStr = params.playerStateStr || "暂无玩家数据";
                template = template.replace(/{{Player_State_WithoutHstate}}/g, () => playerStateStr);

                // ==================================================
                // 🟢 2. 核心修改：处理 {{Plot}} 宏替换 (逻辑已前移至前端)
                // ==================================================
                // 直接使用前端传来的 params.plotContextStr
                // 使用回调函数 () => val 替换，防止文本中包含 "$" 导致正则解析错误
                const plotStr = params.plotContextStr || "（暂无剧情上下文）";
                let finalPrompt = template.replace(/{{Plot}}/g, () => plotStr);

                // ==================================================
                // 🟢 3. 新增：处理 {{Chat_Data}} 宏替换
                // ==================================================
                const chatStr = params.chatContextStr || "（暂无对话记录）";
                finalPrompt = finalPrompt.replace(/{{Chat_Data}}/g, () => chatStr);
                // ==================================================

                // 3. 节点数据替换
                const nodesToGen = params.nodes || [];
                const nodeDataStr = JSON.stringify(nodesToGen, null, 2);
                finalPrompt = finalPrompt.replace(/{{Node_Data}}/g, nodeDataStr);

                // 🟢 [新增] 处理 {{params.name_and_theme}} 宏替换
                // 拼接地图名称与主题ID，帮助 LLM 锁定生成风格
                const mapNameVal = params.mapName || "未知地图";
                const themeIdVal = params.themeId || "未知主题";
                const nameAndThemeStr = `地图名称: ${mapNameVal} (ThemeID: ${themeIdVal})`;
                
                finalPrompt = finalPrompt.replace(/{{params\.name_and_theme}}/g, nameAndThemeStr);

                // 4. MapID 替换
                if (params.mapId) {
                    finalPrompt = finalPrompt.replace(/{{params\.mapId}}/g, params.mapId);
                }

                console.log(`✅ [Node_Genertate] Prompt 构建完成 (含剧情上下文)`);
                return finalPrompt;

            } catch (error) {
                console.error("❌ [Node_Genertate] 构建失败:", error);
                return `[Error: ${error.message}]`;
            }
        },

        parseResponse: (rawText) => {
            // ... (保持原样)
            const match = rawText.match(/<Task_Node_Generate>([\s\S]*?)<\/Task_Node_Generate>/);
            if (match && match[1]) {
                try {
                    const cleanJson = match[1].replace(/```json/g, '').replace(/```/g, '').trim();
                    const parsed = JSON.parse(cleanJson);
                    if (parsed.mapId && parsed.data) return parsed;
                } catch (e) { console.error(e); }
            }
            return null;
        }
    };
    console.log("✅ [Node_Genertate] 处理器已注册");
})();