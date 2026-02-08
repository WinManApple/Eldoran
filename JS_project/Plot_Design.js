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

// Plot_Design.js
// 运行环境: SillyTavern 插件后台 (TavernHelper 环境)

(function() {
    console.log("📜 [Plot_Design] 正在加载...");
    if (!window.parent) return;

    // 确保命名空间存在
    window.parent.RPG_LLM_HANDLERS = window.parent.RPG_LLM_HANDLERS || {};

    // [配置区域]
    const CONFIG = {
        LOREBOOK_NAME: "Eldoran",
        // [修改] 定义不同模式下的世界书条目名称 (Comment)
        ENTRY_MAIN: "Plot_Design_Main",  // 主线剧情模板
        ENTRY_SUB: "Plot_Design_Sub"     // 支线/裂缝模板
    };

    window.parent.RPG_LLM_HANDLERS['PLOT_DESIGN'] = {
        
        /**
         * 构建 Prompt
         * @param {Object} params - 前端 Call_Plot_Design.js 传来的参数
         */
        buildPrompt: async (params) => {
            const helper = window.parent.TavernHelper || window.TavernHelper;
            if (!helper) return "";

            try {
                // 1. 获取世界书所有条目
                const entries = await helper.getLorebookEntries(CONFIG.LOREBOOK_NAME);
                const entriesArray = Array.isArray(entries) ? entries : Object.values(entries || {});

                // 2. [修改] 根据地图类型动态决定使用哪个模板
                const isSub = params.mapType === 'SUB';
                const targetEntryName = isSub ? CONFIG.ENTRY_SUB : CONFIG.ENTRY_MAIN;

                console.log(`🔍 [Plot_Design] 正在寻找模板: ${targetEntryName} (模式: ${params.mapType || 'MAIN'})`);

                // 3. 查找对应条目
                const targetEntry = entriesArray.find(e => e.comment === targetEntryName);
                if (!targetEntry) {
                    throw new Error(`未找到世界书条目: ${targetEntryName} (请检查酒馆世界书配置)`);
                }

                let template = targetEntry.content;

                // 4. 执行基础参数替换
                const prevPlotText = params.previouslyPlot ? params.previouslyPlot : "(暂无前情提要)";

                // 使用回调函数防止特殊字符导致正则错误
                template = template.replace(/{{params\.previouslyPlot}}/g, () => prevPlotText);
                template = template.replace(/{{params\.chapterId}}/g, params.chapterId || 'UNKNOWN_ID');
                template = template.replace(/{{params\.mapType}}/g, params.mapType || 'MAIN');
                template = template.replace(/{{params\.locationName}}/g, params.locationName || '未知之地');
                template = template.replace(/{{params\.theme}}/g, params.theme || 'THEME_UNKNOWN');
                template = template.replace(/{{params\.totalStages}}/g, params.totalStages || 1);

                // 5. [修改] 处理支线信息替换 ({{Side_Line_Information}})
                // 逻辑：如果是主线，显示固定忽略文本；如果是支线，显示传入的 payload 信息
                let sideLineText = "此为主线剧情设计，不需要这部分信息";
                
                if (isSub) {
                    // 优先使用传入的 sideLineInfo，如果为空则兜底
                    sideLineText = params.sideLineInfo || "无额外支线信息";
                }
                
                template = template.replace(/{{Side_Line_Information}}/g, () => sideLineText);

                // 6. [修改] 处理对话历史替换 ({{Chat_Memory}})
                const chatHistoryText = params.chatHistory || "暂无对话记录";
                template = template.replace(/{{Chat_Memory}}/g, () => chatHistoryText);

                console.log(`✅ [Plot_Design] Prompt 构建完成`);
                return template;

            } catch (error) {
                console.error("❌ [Plot_Design] 构建失败:", error);
                return `[System Error: ${error.message}]`;
            }
        },

        /**
         * 解析 LLM 返回的 XML 结果
         * (此逻辑保持不变，用于提取 JSON)
         */
        parseResponse: (rawText) => {
            // 尝试捕获 <Task_Plot_Design> ... </Task_Plot_Design>
            const match = rawText.match(/<Task_Plot_Design>([\s\S]*?)<\/Task_Plot_Design>/);
            if (match && match[1]) {
                try {
                    // 清洗 Markdown 代码块标记
                    const cleanJson = match[1].replace(/```json/g, '').replace(/```/g, '').trim();
                    const parsed = JSON.parse(cleanJson);
                    // 简单校验
                    if (parsed.mapId) return parsed;
                } catch (e) { 
                    console.error("❌ [Plot_Design] JSON 解析失败:", e); 
                }
            }
            return null;
        }
    };

    console.log("✅ [Plot_Design] 处理器已注册 (Sub/Main Mode)");
})();