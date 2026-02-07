/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// Map_Named.js
(function() {
    console.log("🧩 [Map_Named] 正在加载...");
    if (!window.parent) return;

    window.parent.RPG_LLM_HANDLERS = window.parent.RPG_LLM_HANDLERS || {};

    const CONFIG = {
        LOREBOOK_NAME: "Eldoran",
        ENTRY_COMMENT: "Map_Named"
    };

    window.parent.RPG_LLM_HANDLERS['MAP_INIT'] = {
        buildPrompt: async (payload) => {
            const helper = window.parent.TavernHelper || window.TavernHelper;
            if (!helper) return "";

            try {
                // 🟢 修复点：API更换
                const entries = await helper.getLorebookEntries(CONFIG.LOREBOOK_NAME);
                const entriesArray = Array.isArray(entries) ? entries : Object.values(entries || {});
                
                const targetEntry = entriesArray.find(e => e.comment === CONFIG.ENTRY_COMMENT);
                if (!targetEntry) throw new Error(`未找到条目: ${CONFIG.ENTRY_COMMENT}`);

                let template = targetEntry.content;
                const context = payload.context || {};
                const nodes = payload.nodes || [];
                const nodesStr = JSON.stringify(nodes, null, 2);

                template = template.replace(/{{params\.nodes}}/g, nodesStr);
                const mapNameVal = context.currentName || "未知地图";
                const nameAndThemeStr = `地图名称: ${mapNameVal}`;
                template = template.replace(/{{params\.name}}/g, nameAndThemeStr);

                template = template.replace(/{{params\.context\.themeId}}/g, context.themeId || 'UNKNOWN');
                template = template.replace(/{{params\.context\.type}}/g, context.type || 'MAIN');
                template = template.replace(/{{params\.context\.mapId}}/g, context.mapId || 'UNKNOWN');

                console.log(`✅ [Map_Named] Prompt 构建完成`);
                return template;

            } catch (error) {
                console.error("❌ [Map_Named] 构建失败:", error);
                return `[Error: ${error.message}]`;
            }
        },

        parseResponse: (rawText) => {
            const match = rawText.match(/<Task_Map_Named>([\s\S]*?)<\/Task_Map_Named>/);
            if (match && match[1]) {
                try {
                    const cleanJson = match[1].replace(/```json/g, '').replace(/```/g, '').trim();
                    const parsed = JSON.parse(cleanJson);
                    if (parsed.mapId && parsed.nodes) return parsed;
                } catch (e) { console.error(e); }
            }
            return null;
        }
    };
    console.log("✅ [Map_Named] 处理器已注册");
})();