/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
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
*/

// src/LLM/handlers/Chat.js
// 运行环境: SillyTavern 插件后台 (TavernHelper 环境)

(function() {
    console.log("💬 [Chat.js] 正在加载 (v3.0 Refactored)...");

    // 配置常量：对应世界书的条目名称
    const CONFIG = {
        LOREBOOK_NAME: 'Eldoran',
        MAIN_ENTRY: 'Interaction_With_Player',           // 主提示词模板
        INSTRUCTION_ENTRY: 'System_LLM_Instruction_In_Chat' // 系统指令模板
    };

    // 确保命名空间存在
    window.parent.RPG_LLM_HANDLERS = window.parent.RPG_LLM_HANDLERS || {};

    // 注册 CHAT 处理器
    window.parent.RPG_LLM_HANDLERS['CHAT'] = {
        /**
         * 构建最终 Prompt
         * @param {Object} params - 由前端 Call_Chat.js 发送的扁平化数据对象
         */
        buildPrompt: async (params) => {
            try {
                // 1. 获取 TavernHelper 实例
                const helper = window.parent.TavernHelper || window.TavernHelper;
                if (!helper) throw new Error("TavernHelper 未就绪");

                // 2. 读取世界书内容
                const entries = await helper.getLorebookEntries(CONFIG.LOREBOOK_NAME);
                if (!entries) throw new Error(`世界书 [${CONFIG.LOREBOOK_NAME}] 读取失败`);

                const mainEntry = entries.find(e => e.comment === CONFIG.MAIN_ENTRY);
                const instrEntry = entries.find(e => e.comment === CONFIG.INSTRUCTION_ENTRY);

                if (!mainEntry) throw new Error(`未找到主模板: ${CONFIG.MAIN_ENTRY}`);
                
                // 指令集允许为空（容错）
                const instructionContent = instrEntry ? instrEntry.content : "";
                let promptTemplate = mainEntry.content;

                // 3. 执行宏替换
                console.log("⚙️ [Chat.js] 开始执行宏替换...");
                // 🔍 调试日志：检查前端传入的预处理字符串 keys
                console.log("   - Params Keys:", Object.keys(params || {}));
                
                // 🟢 核心：调用替换逻辑，params 包含了前端生成的 xxxStr 字符串
                const processedPrompt = processMacros(promptTemplate, params);

                // 4. 拼接系统指令并返回
                return processedPrompt + "\n\n" + instructionContent;

            } catch (err) {
                console.error("❌ [Chat.js] 构建异常:", err);
                return `[System Error: ${err.message}]`;
            }
        }
    };

    console.log("✅ [Chat.js] 处理器已注册 (纯净版)");

    // ==========================================
    // 核心逻辑：宏替换引擎 (Macro Replacement)
    // ==========================================
    
    /**
     * 执行模板变量替换
     * @param {string} template - 原始提示词模板
     * @param {Object} data - 前端传来的数据 (params)
     */
    function processMacros(template, data) {
        let result = template;

        // 获取控制信号 (用于决定是否需要 Summary)
        const ctrl = data.control || {};

        // ------------------------------------------
        // A. 基础环境数据 (已由前端预处理为 String)
        // ------------------------------------------
        
        // 时间与地点
        const locationStr = data.locationStr || "位置未知";
        result = result.replace(/{{Time_And_Place}}/g, locationStr);

        // 剧情上下文
        const plotStr = data.plotStr || "暂无剧情";
        // 🟢 安全替换：使用回调函数 () => str，防止文本中包含 '$' 导致正则替换异常
        result = result.replace(/{{Plot}}/g, () => plotStr); 

        // 地图节点信息
        const mapNodeStr = data.mapNodeStr || "暂无节点信息";
        result = result.replace(/{{Map_Node}}/g, () => mapNodeStr);

        // ------------------------------------------
        // B. 聊天交互数据
        // ------------------------------------------

        // 用户最新输入
        const userStr = data.userInputStr || "(无输入)";
        result = result.replace(/{{User_Input}}/g, () => userStr);

        // 对话历史 (宏观+阶段+近期)
        const historyStr = data.chatHistoryStr || "暂无历史";
        result = result.replace(/{{Chat_History}}/g, () => historyStr);

        // ------------------------------------------
        // C. 玩家与队伍数据
        // ------------------------------------------

        // 玩家状态宏 (已由前端计算属性、装备、技能并格式化)
        const playerStr = data.playerStateStr || "暂无玩家数据";
        result = result.replace(/{{Player_State}}/g, () => playerStr);
        result = result.replace(/{{Player_State_WithoutHstate}}/g, () => playerStr);

        // 原始数据 Dump (Party/NPC) - 保持 JSON 格式注入，以备不时之需
        const partyJson = JSON.stringify(data.partyData || {}, null, 2);
        result = result.replace(/{{Party_Memory}}/g, () => partyJson);

        const npcJson = JSON.stringify(data.npcData || {}, null, 2);
        result = result.replace(/{{NPC_Data}}/g, () => npcJson);

        // ------------------------------------------
        // D. 女性 H 系统 (Frontend Generated)
        // ------------------------------------------

        // 前端已生成指导 JSON 字符串 (包含好感度/堕落度/部位反应的文本描述)
        const femaleInstrStr = data.femaleInstrStr || "[]";
        result = result.replace(/{{Female_Action_Instruction}}/g, () => femaleInstrStr);
        
        // 以下旧标签暂时复用指导数据或置空
        result = result.replace(/{{Female_H_Atrribute}}/g, () => femaleInstrStr);
        result = result.replace(/{{Female_H_History_And_Atrribute}}/g, () => femaleInstrStr);

        // ------------------------------------------
        // E. 任务控制与输出格式 (Output Format Logic)
        // ------------------------------------------
        
        const reqSummary = ctrl.require_summary;
        const reqGrand = ctrl.require_grand_summary;

        // 1. 构建小总结任务 (Task_Summary)
        // 🟢 [核心修复] 注入 Call_Chat 传来的纯净数据 historyRecentStr
        let summaryTask = "无小总结任务"; // 默认占位符

        if (reqSummary) {
            const cleanRecentHistory = data.historyRecentStr || "暂无近期数据";
            summaryTask = `<Summary>
你需要对下面的历史进行小总结(summary)。
要求：
1. 总结不超50字，内容凝实精炼。
2. 必须输出 JSON 格式。
示例：{"summary": "这里是总结内容"}

[近期对话历史]
${cleanRecentHistory}
</Summary>`;
        }
        result = result.replace(/{{Task_Summary}}/g, summaryTask);


        // 2. 构建大总结任务 (Task_Grand_Summary)
        // 🟢 [核心修复] 注入 Call_Chat 传来的纯净数据 historySummaryStr
        let grandTask = "无大总结任务"; // 默认占位符

        if (reqGrand) {
            const cleanSummaryHistory = data.historySummaryStr || "暂无前情提要";
            grandTask = `<Grand_Summary>
你需要对下面的历史进行大总结(grand_summary)。
要求：
1. 总结不超50字，内容凝实精炼。
2. 必须输出 JSON 格式。
示例：{"grand_summary": "这里是宏观总结内容"}

[阶段总结历史]
${cleanSummaryHistory}
</Grand_Summary>`;
        }
        result = result.replace(/{{Task_Grand_Summary}}/g, grandTask);

        // 决定输出格式模板 ID
        let formatKey = "1"; // 默认: 仅回复 + 指令
        if (reqSummary && !reqGrand) formatKey = "2"; // + 小结
        if (reqSummary && reqGrand) formatKey = "3";  // + 大结

        const outputFormat = getOutputFormatTemplate(formatKey);
        result = result.replace(/{{Output_Format}}/g, outputFormat);

        return result;
    }

    // ==========================================
    // 辅助函数: 输出格式模板选择
    // ==========================================

    function getOutputFormatTemplate(type) {
        const baseContent = `
            <Chat_Content>
                (针对此次对话的互动，详见<User_Input>)
            </Chat_Content>`;
        
        const systemInstr = `
            <LLM_System_Instruction>
                (你使用函数的地方，详见<System_LLM_Instruction_In_Chat>)
            </LLM_System_Instruction>`;

        if (type === "1") {
            return `<Task_Interaction_With_Player>${baseContent}${systemInstr}</Task_Interaction_With_Player>`;
        }
        if (type === "2") {
            return `<Task_Interaction_With_Player>${baseContent}
            <Summary>
                (小总结的内容)
            </Summary>${systemInstr}</Task_Interaction_With_Player>`;
        }
        if (type === "3") {
            return `<Task_Interaction_With_Player>${baseContent}
            <Summary>
                (小总结的内容)
            </Summary>
            <Grand_Summary>
                (大总结的内容)
            </Grand_Summary>${systemInstr}</Task_Interaction_With_Player>`;
        }
        return "";
    }

})();