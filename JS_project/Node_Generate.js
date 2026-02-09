/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
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

    // ==================================================
    // 🟢 [新增] 特殊设计规则池 (方便后续添加修改)
    // ==================================================
    const DESIGN_RULES_POOL = [
        // 规则 1：强战斗导向 (精英怪/BOSS)
        "依据对话情节(<Previously_On>与<Chat_History>，其中<Previously_On>作为宏观参考，<Chat_History>作为重点参考，当<Previously_On>与<Chat_History>发生冲突，以<Previously_On>为准)，" +
        "PORTAL_NEXT_FLOOR与PORTAL_NEXT_CHAPTER的payload内容必须与<Previously_On>里的情节高度关联，必须包含战斗。\n" +
        "对于PORTAL_NEXT_FLOOR，必须包含精英级别的敌人(属性略高于玩家，必须存在至少2个技能，掉落物必须有一把武器 + 一个装备或一个饰品 + 一个技能书)；\n" +
        "对于PORTAL_NEXT_CHAPTER，必须包含BOSS级别的敌人(属性远高于玩家，必须存在至少2个强力技能，掉落物必须有一把强力武器|一套装备 + 一个饰品 + 一个技能书)，" +
        "同时战斗结束后必须使用\"trigger\": \"next_chapter\"来生成下一章的地图。\n",

        // 规则 2：资源消耗/鉴定导向 (物品鉴定/扣费 + BOSS)
        "依据对话情节(<Previously_On>与<Chat_History>，其中<Previously_On>作为宏观参考，<Chat_History>作为重点参考，当<Previously_On>与<Chat_History>发生冲突，以<Previously_On>为准)，" +
        "PORTAL_NEXT_FLOOR的payload内容必须与<Previously_On>里的情节高度关联，必须包含remove或者check鉴定环节(注意使用exit)，" +
        "remove或者check的物品可以是玩家队伍里已经持有的特殊物品(详见<Player_State>)，也可以是依据情节设计的玩家暂时没有的物品，玩家知道需要这个物品后会推进情节进行动态获取的，" +
        "所以不必担心物品\"不存在\"的问题，不论如何设计，物品必须与情节高度关联。\n" +
        "如果需要扣费，则必须让玩家队伍\"大出血\"，直接扣掉玩家队伍金币的1/2。(例如<Player_State>显示玩家队伍金币为50000.进入下一层则扣掉25000)；\n" +
        "特别的，对于PORTAL_NEXT_CHAPTER，必须包含BOSS级别的敌人(属性远高于玩家，必须存在至少2个强力技能，掉落物必须有一把强力武器|一套装备 + 一个饰品 + 一个技能书)，" +
        "同时战斗结束后必须使用\"trigger\": \"next_chapter\"来生成下一章的地图。\n"
    ];

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

                // ==================================================
                //  处理 {{Special_Design_Rule}} 宏替换
                // ==================================================
                // 随机抽取一条规则
                const randomRule = DESIGN_RULES_POOL[Math.floor(Math.random() * DESIGN_RULES_POOL.length)];
                finalPrompt = finalPrompt.replace(/{{Special_Design_Rule}}/g, () => randomRule);

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