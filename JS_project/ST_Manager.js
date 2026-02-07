/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// ST_Manager.js
// 运行环境: SillyTavern 插件后台 (TavernHelper 环境)
// 职责: 核心调度器 - 全权接管 Prompt 构建流程 (System Header + Tasks + System Footer)

(function() {
    console.log("🔮 [ST_Manager] 正在启动 (Refactored v2.0)...");

    // ==========================================
    // 1. 配置区域 (模块化构建核心)
    // ==========================================
    const CONFIG = {
        // 目标世界书名称
        LOREBOOK_NAME: "Eldoran",
        
        // System 开头构建顺序 (对应条目的"备注/Comment")
        SYSTEM_HEADER_ORDER: [
            "<System>",                // <System> 标签头
            "System_Game_Introduction", // 游戏简介
            "System_Task_Guide",       // 任务指导
            "System_Game_Background",  // 游戏背景
            "System_Item_Design",      // 物品设计原则
            "System_Enemy_Design"      // 敌人设计原则
        ],

        // System 结尾构建顺序
        SYSTEM_FOOTER_ORDER: [
            "</System>"                // </System> 标签尾
        ],

        // 任务优先级 (数字越小越优先)
        PRIORITY_MAP: {
            'OPENING': -1,
            'PLOT_DESIGN': 0,
            'MAP_INIT': 1,
            'NODE_GENERATE': 2,
            'CHAT': 3,
            'H_MODE': 4,
            'H_INTERACTION': 5,
            'SUMMARY': 6
        }
    };

    // ==========================================
    // 2. 通信协议定义
    // ==========================================
    const Protocol = {
        SYS: { HANDSHAKE: 'SYS:HANDSHAKE', PAIRED: 'SYS:PAIRED', ERROR: 'SYS:ERROR' },
        LLM: { GENERATE: 'LLM:GENERATE', CANCEL: 'LLM:CANCEL' }
    };

    const bus = new BroadcastChannel('rpg_sync');
    // [新增] 用于追踪当前正在进行的生成任务 ID
    let currentGenerationId = null;

    // ==========================================
    // 3. 消息监听主循环
    // ==========================================
    bus.onmessage = async (event) => {
        const packet = event.data;
        if (!packet || !packet.type || packet.sender !== 'client') return;

        switch (packet.type) {
            case Protocol.SYS.HANDSHAKE:
                console.log("🤝 [ST_Manager] 收到握手请求");
                _reply(bus, Protocol.SYS.PAIRED, { msg: "ST Manager Online (Manual Mode)" }, packet.id);
                break;

            case Protocol.LLM.GENERATE:
                await handleBatchRequest(bus, packet);
                break;
            // [新增] 处理中断请求
            case Protocol.LLM.CANCEL:
                console.log("🛑 [ST_Manager] 收到中断信号");
                if (currentGenerationId) {
                    const helper = window.parent.TavernHelper || window.TavernHelper;
                    // 尝试停止任务
                    const success = await helper.stopGenerationById(currentGenerationId);
                    console.log(`[ST_Manager] 任务停止结果: ${success}`);
                    
                    // 重置 ID
                    currentGenerationId = null;
                    
                    // 返回 true/false 给客户端
                    _reply(bus, Protocol.LLM.CANCEL, success, packet.id);
                } else {
                    console.warn("[ST_Manager] 当前无活动任务，无法停止");
                    _reply(bus, Protocol.LLM.CANCEL, false, packet.id);
                }
                break;
        }
    };

    console.log("✅ [ST_Manager] 监听中...");


    // ==========================================
    // 4. 核心处理逻辑
    // ==========================================
    async function handleBatchRequest(bus, packet) {
        const reqId = packet.id;
        const helper = window.parent.TavernHelper || window.TavernHelper;

        if (!helper) {
            _reply(bus, Protocol.SYS.ERROR, "TavernHelper 未就绪", reqId);
            return;
        }

        try {
            console.log(`📝 [ST_Manager] 开始处理批次请求 (ID: ${reqId})`);

            // --- A. 预加载世界书 (供头尾构建使用) ---
            const lorebookEntries = await helper.getLorebookEntries(CONFIG.LOREBOOK_NAME);
            if (!lorebookEntries) throw new Error(`世界书 [${CONFIG.LOREBOOK_NAME}] 读取失败`);

            // 🟢 [Step 1] 提前解析 Payload (为了判断是否需要剔除 System Header 条目)
            // ====================================================================
            console.log("   🏗️ 解析 Payload...");
            let batchPayload = [];
            let expectedTags = [];

            if (Array.isArray(packet.payload)) {
                batchPayload = packet.payload;
            } else if (packet.payload && packet.payload.tasks) {
                batchPayload = packet.payload.tasks;
                expectedTags = packet.payload.expectedTags || [];
            } else {
                throw new Error("无效的 Payload 格式");
            }

            // 🟢 [Step 2] 动态过滤 System Header
            // ====================================================================
            // 检测是否存在 特殊需求 任务
            const isHInteraction = batchPayload.some(task => task[0] === 'H_INTERACTION');
            const isSummary = batchPayload.some(task => task[0] === 'SUMMARY'); // 🟢 [新增] 检测总结任务
            const isOpening = batchPayload.some(task => task[0] === 'OPENING');

            // 复制配置副本
            let currentHeaderOrder = [...CONFIG.SYSTEM_HEADER_ORDER];

            //  H 模式过滤 
            if (isHInteraction) {
                console.log("💕 [ST_Manager] 检测到 H_INTERACTION: 正在剔除物品与敌人设计规则...");
                const excludeItems = ['System_Item_Design', 'System_Enemy_Design'];
                currentHeaderOrder = currentHeaderOrder.filter(item => !excludeItems.includes(item));
            }

            //  Summary 模式过滤
            if (isSummary) {
                console.log("📝 [ST_Manager] 检测到 SUMMARY: 正在精简 System Header (去除背景/物品/敌人)...");
                // 依据指令剔除: 游戏背景、物品设计、敌人设计
                const excludeItems = ['System_Game_Background', 'System_Item_Design', 'System_Enemy_Design'];
                currentHeaderOrder = currentHeaderOrder.filter(item => !excludeItems.includes(item));
            }

            //  Opening 模式下的 Header 处理 
            // 剔除System_Enemy_Design条目
            if (isOpening) {
                console.log("🚀 [ST_Manager] 检测到 OPENING: 启动创世序列...");
                const excludeItems = ['System_Enemy_Design'];
                currentHeaderOrder = currentHeaderOrder.filter(item => !excludeItems.includes(item));
            }

            // --- B. 构建 System Header (使用动态列表) ---
            console.log("   🏗️ 构建 System Header...");
            // 注意：此处传入的是 currentHeaderOrder 而非 CONFIG.SYSTEM_HEADER_ORDER
            const systemHeader = constructSystemBlock(lorebookEntries, currentHeaderOrder);

            // --- C. 构建 Tasks Body (任务分发) ---
            console.log("   🏗️ 构建 Task Body...");

            // 任务排序
            const sortedTasks = [...batchPayload].sort((a, b) => {
                const pA = CONFIG.PRIORITY_MAP[a[0]] ?? 99;
                const pB = CONFIG.PRIORITY_MAP[b[0]] ?? 99;
                return pA - pB;
            });

            // 获取子处理器
            const sharedHandlers = window.parent.RPG_LLM_HANDLERS || {};
            let taskBodyPrompt = "";
            let processedCount = 0;

            for (const task of sortedTasks) {
                const command = task[0];
                const params = task[1];

                if (sharedHandlers[command]) {
                    // 调用子处理器生成 Prompt
                    // 注意：子处理器内部可能还会自己去读一遍世界书(取Task模板)，这保持了模块独立性，是可接受的
                    const part = await sharedHandlers[command].buildPrompt(params);
                    
                    // 仅当返回有效内容时拼接
                    if (part && part !== "READY" && part !== "ERROR") {
                        taskBodyPrompt += "\n" + part;
                    }
                    processedCount++;
                } else {
                    console.warn(`⚠️ [ST_Manager] 未处理指令: ${command}`);
                }
            }

            if (processedCount === 0) {
                throw new Error("没有有效的任务被处理");
            }

            // --- D. 构建 System Footer (模块化) ---
            console.log("   🏗️ 构建 System Footer...");
            const systemFooter = constructSystemBlock(lorebookEntries, CONFIG.SYSTEM_FOOTER_ORDER);


            // --- E. 最终组装与发送 ---
            // 结构: [System Header] + [Tasks] + [System Footer]
            const finalPrompt = `${systemHeader}\n\n${taskBodyPrompt}\n\n${systemFooter}`;

            console.log(`📤 [ST_Manager] 发送 Prompt (长度: ${finalPrompt.length})`);
            // console.log("--- Prompt Preview ---\n", finalPrompt.substring(0, 500) + "...");

            currentGenerationId = reqId;

            const resultText = await helper.generate({
                generation_id: reqId,
                injects: [{
                    role: 'user',           // 整个 Prompt 包裹在 User 消息中发送
                    content: finalPrompt,
                    position: 'in_chat',    
                    depth: 0,               // 强制最新
                    should_write_to_chat: false, // 静默
                    should_scan: false      // 关闭自动扫描，防止触发意料之外的条目
                }],
                should_stream: false,
                auto_scroll: false
            });

            console.log(`📥 [ST_Manager] 收到 LLM 回复`);

            // 🟢 [新增] 数据清洗逻辑
            let finalOutput = resultText;
            
            // 尝试获取全局挂载的清洗器 (由 Data_Sanitize.js 提供)
            const sanitizer = window.parent.RPG_DataSanitizer;

            if (sanitizer && expectedTags.length > 0) {
                console.log(`🧹 [ST_Manager] 正在执行清洗 (目标标签: ${expectedTags.join(', ')})`);
                try {
                    // 执行清洗
                    finalOutput = sanitizer.process(resultText, { 
                        expectedTags: expectedTags 
                    });
                } catch (sanitizeErr) {
                    console.error("⚠️ [ST_Manager] 清洗过程异常，将返回原始数据:", sanitizeErr);
                    // 降级处理：清洗失败时返回原文，避免游戏卡死
                    finalOutput = resultText; 
                }
            } else {
                if (!sanitizer) console.warn("⚠️ [ST_Manager] RPG_DataSanitizer 未就绪，跳过清洗");
                // 如果没有 expectedTags，通常意味着不需要清洗，或者使用的是旧协议
            }

            // --- F. 回传结果 (发送清洗后的数据) ---
            _reply(bus, Protocol.LLM.GENERATE, finalOutput, reqId);

        } catch (e) {
            // 发生错误，清除 ID
            currentGenerationId = null;
            console.error("❌ [ST_Manager] 处理异常:", e);
            _reply(bus, Protocol.SYS.ERROR, e.message, reqId);
        }
    }

    // ==========================================
    // 5. 辅助函数：模块化构建器
    // ==========================================

    /**
     * 根据配置顺序，从世界书条目中提取内容并拼接
     * @param {Array} allEntries - 世界书所有条目数组
     * @param {Array} orderConfig - 需要提取的条目名称列表 (Comment)
     */
    function constructSystemBlock(allEntries, orderConfig) {
        let block = "";
        
        for (const entryName of orderConfig) {
            const entry = allEntries.find(e => e.comment === entryName);
            
            if (entry) {
                // 拼接内容，并添加换行符以防粘连
                if (entry.content) {
                    block += entry.content + "\n";
                }
            } else {
                console.warn(`⚠️ [ST_Manager] 缺失 System 条目: ${entryName}`);
                // 可以选择在这里插入一个默认的占位符，或者直接跳过
            }
        }
        
        return block.trim();
    }

    function _reply(bus, type, payload, id) {
        bus.postMessage({
            type: type,
            payload: payload,
            id: id,
            timestamp: Date.now(),
            sender: 'server'
        });
    }

})();