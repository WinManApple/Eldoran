/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/LLM/handlers/H_Interaction.js
// 运行环境: SillyTavern 插件后台 (TavernHelper 环境)

(function() {
    console.log("💕 [H_Interaction.js] 正在加载...");

    const CONFIG = {
        LOREBOOK_NAME: 'Eldoran',
        // 模板条目映射表
        TEMPLATES: {
            OPENING_SINGLE: 'H_Sence_Opening_Single',
            OPENING_MULTI:  'H_Sence_Opening_Multiple',
            INTERACT_SINGLE:'H_Sence_Interation_Single',
            INTERACT_MULTI: 'H_Sence_Interation_Multiple',
            SETTLEMENT:     'H_Sence_Settlement'
        }
    };

    // 确保命名空间存在
    window.parent.RPG_LLM_HANDLERS = window.parent.RPG_LLM_HANDLERS || {};

    // 注册 H_INTERACTION 处理器
    window.parent.RPG_LLM_HANDLERS['H_INTERACTION'] = {
        
        /**
         * 构建 H 场景的 Prompt
         * @param {Object} params - 客户端传来的数据包
         */
        buildPrompt: async (params) => {
            try {
                // 1. 获取 TavernHelper 实例
                const helper = window.parent.TavernHelper || window.TavernHelper;
                if (!helper) throw new Error("TavernHelper 未就绪");

                // 2. 分析当前情境 (阶段 & 人数)
                const userInput = params.userInput || "";
                
                // 解析女性属性 JSON 来判断人数 (容错处理: 如果解析失败则默认为单人)
                let femaleCount = 1;
                try {
                    const females = JSON.parse(params.femaleAttribute || "[]");
                    femaleCount = females.length;
                } catch (e) {
                    console.warn("⚠️ [H_Interaction] 解析女性人数失败，默认为单人:", e);
                }

                // 3. 决定使用的模板名称
                let targetEntryName = "";

                if (userInput.includes("Order_Init_System")) {
                    // --- 开场阶段 ---
                    targetEntryName = (femaleCount > 1) 
                        ? CONFIG.TEMPLATES.OPENING_MULTI 
                        : CONFIG.TEMPLATES.OPENING_SINGLE;
                    console.log(`💕 [H_Interaction] 检测到开场 (人数: ${femaleCount}) -> 使用模板: ${targetEntryName}`);

                } else if (userInput.includes("Order_Start_Settlement")) {
                    // --- 结算阶段 ---
                    targetEntryName = CONFIG.TEMPLATES.SETTLEMENT;
                    console.log(`💕 [H_Interaction] 检测到结算 -> 使用模板: ${targetEntryName}`);

                } else {
                    // --- 互动阶段 ---
                    targetEntryName = (femaleCount > 1) 
                        ? CONFIG.TEMPLATES.INTERACT_MULTI 
                        : CONFIG.TEMPLATES.INTERACT_SINGLE;
                    console.log(`💕 [H_Interaction] 检测到互动 (人数: ${femaleCount}) -> 使用模板: ${targetEntryName}`);
                }

                // 4. 读取世界书
                const entries = await helper.getLorebookEntries(CONFIG.LOREBOOK_NAME);
                if (!entries) throw new Error(`世界书 [${CONFIG.LOREBOOK_NAME}] 读取失败`);

                const templateEntry = entries.find(e => e.comment === targetEntryName);
                if (!templateEntry) throw new Error(`未找到 H 模板条目: ${targetEntryName}`);

                // 5. 执行宏替换
                let prompt = templateEntry.content;

                // --- 通用宏替换 ---
                // 使用回调函数 () => str 防止 replace 处理特殊字符(如 $)时出错
                prompt = prompt.replace(/{{Player_Party}}/g, () => params.playerParty || "[]");
                prompt = prompt.replace(/{{Time_And_Place}}/g, () => params.timePlace || "未知地点");
                prompt = prompt.replace(/{{Event_Name}}/g, () => params.eventName || "未知事件");
                
                prompt = prompt.replace(/{{Female_History}}/g, () => params.femaleHistory || "[]");
                prompt = prompt.replace(/{{Chat_History}}/g, () => params.chatHistory || "[]");
                prompt = prompt.replace(/{{Female_Attribute}}/g, () => params.femaleAttribute || "[]");
                
                // 用户输入 (如果是指令，这里就是指令字符串；如果是对话，就是对话内容)
                prompt = prompt.replace(/{{User_Input}}/g, () => params.userInput || "");

                // --- 结算专用宏替换 ---
                // 只有结算模板里才有这个标签，普通模板里没有，替换了也无妨
                prompt = prompt.replace(/{{Settlement_Guide}}/g, () => {
                    let guide = params.settlementGuide || "";
                    
                    // 🟢 仅在结算模式下，执行经验计算逻辑
                    if (targetEntryName === CONFIG.TEMPLATES.SETTLEMENT) {
                        try {
                            // 1. 解析玩家列表
                            const party = JSON.parse(params.playerParty || "[]");
                            // 2. 找到主角 (通常是第一个，或根据 id 判断)
                            const player = party[0]; 
                            
                            if (player && player.level) {
                                const lv = parseInt(player.level);
                                // 3. 套用公式: 当下等级^2 + 400
                                const nextLevelExp = (lv * lv) + 400;
                                
                                // 4. 追加系统提示给 LLM
                                guide += `\n[System Note: 玩家当前等级 Lv.${lv}。根据规则，升至下一级所需经验值 = ${nextLevelExp}。请基于表现给予适当奖励。]`;
                            }
                        } catch (e) {
                            console.warn("⚠️ [H_Interaction] 经验计算失败:", e);
                        }
                    }
                    
                    return guide;
                });

                return prompt;

            } catch (err) {
                console.error("❌ [H_Interaction] 构建异常:", err);
                return `[System Error in H_Interaction: ${err.message}]`;
            }
        }
    };

    console.log("✅ [H_Interaction.js] 处理器已注册");

})();