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

// Summary.js
// 运行环境: SillyTavern 插件后台 (TavernHelper 环境)
// 职责: 多对多总结模式 - 上下文注入器

(function() {
    console.log("📜 [Summary] 正在加载 (v3.0 - Many-to-Many)...");
    if (!window.parent) return;

    window.parent.RPG_LLM_HANDLERS = window.parent.RPG_LLM_HANDLERS || {};

    const CONFIG = {
        LOREBOOK_NAME: "Eldoran",
        ENTRY_NAME: "Summary"
    };

    window.parent.RPG_LLM_HANDLERS['SUMMARY'] = {
        
        /**
         * 构建 Prompt
         * @param {Object} params - 前端 Call_Summary.js 传来的参数
         * 包含: summary_context (已拼接的所有源频道文本), target_ids (目标ID数组)
         */
        buildPrompt: async (params) => {
            const helper = window.parent.TavernHelper || window.TavernHelper;
            if (!helper) return "";

            try {
                // 1. 获取世界书模板
                const entries = await helper.getLorebookEntries(CONFIG.LOREBOOK_NAME);
                const targetEntry = (Array.isArray(entries) ? entries : Object.values(entries || {}))
                    .find(e => e.comment === CONFIG.ENTRY_NAME);

                if (!targetEntry) throw new Error(`模板缺失: ${CONFIG.ENTRY_NAME}`);

                let template = targetEntry.content;

                // 2. 执行宏替换
                
                // A. 注入待总结的内容 (Summary_Context)
                // 前端已经把它格式化成了 "=== 频道: xxx ===\n内容..." 的长文本
                template = template.replace(/{{Summary_Context}}/g, () => params.summary_context || "无待总结数据");

                // B. 注入目标频道列表 (Target_Channels)
                // 将数组转为 JSON 字符串，供 LLM 照抄进返回值的 "Target_ID" 字段
                const targetsJson = JSON.stringify(params.target_ids || ["main"]);
                template = template.replace(/{{Target_Channels}}/g, () => targetsJson);

                // C. 注入字数限制 ({{sum_number}})
                // 如果前端没传，兜底 "100-300"
                template = template.replace(/{{sum_number}}/g, () => params.sum_number || "100-300");

                return template;

            } catch (error) {
                console.error("❌ [Summary] 构建失败:", error);
                return `[System Error: ${error.message}]`;
            }
        }
        
        // 不需要 parseResponse，清洗与解析工作由前端 Action_Summary 统一处理
    };

    console.log("✅ [Summary] 处理器已就绪 (多频道模式)");
})();