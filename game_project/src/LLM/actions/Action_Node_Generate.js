/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/LLM/actions/Action_Node_Generate.js
import { addLog } from '../../ui/modules/store.js';

export const TAG = 'Task_Node_Generate';

/**
 * 节点 Payload 生成执行器 (增强版 v2.0)
 * 监听标签: <Task_Node_Generate>
 * 职责: 接收 LLM 生成的节点详细数据 (战斗配置、剧情脚本、商店库存等) 并注入地图节点
 * 特性:
 * 1. 强力数据清洗 (修复 :=, =, 尾部逗号)
 * 2. 流式注入 (Stream Injection) - 单个节点报错不影响整体
 * 3. 智能定位 (优先 mapId，回退 currentMap)
 */
export const Action_Node_Generate = {

    /**
     * 执行 Payload 注入
     * @param {string} content - JSON 字符串
     */
    async execute(content) {
        let payloadMap = {};
        let targetMapId = null;

        // =================================================
        // 1. 数据清洗 (Data Sanitization)
        // =================================================
        // 移除 Markdown 标记
        let cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();

        // 🟢 语法纠错规则库 (复用 Action_Map_Named 的成功经验)
        const fixRules = [
            { reg: /:\s*=/g, replace: ':', desc: '修复赋值符号 :=' },
            { reg: /"\s*=\s*"/g, replace: '":"', desc: '修复键值分隔符 =' },
            // 修复尾部逗号 (这对复杂嵌套对象特别重要，LLM 经常在数组最后一项加逗号)
            { reg: /,\s*([}\]])/g, replace: '$1', desc: '移除尾部逗号' }
        ];

        fixRules.forEach(rule => {
            if (rule.reg.test(cleanJson)) {
                cleanJson = cleanJson.replace(rule.reg, rule.replace);
            }
        });

        // =================================================
        // 2. 解析 (Robust Parsing)
        // =================================================
        try {
            const parsed = JSON.parse(cleanJson);

            // 协议适配
            if (parsed.mapId && parsed.data) {
                targetMapId = parsed.mapId;
                payloadMap = parsed.data;
            } else if (parsed.data) {
                // 兼容缺失 mapId 的情况
                payloadMap = parsed.data;
            } else {
                // 尝试直接把根对象当作 data (兼容旧格式)
                // 排除 mapId 字段本身
                const { mapId, ...rest } = parsed;
                if (mapId) targetMapId = mapId;
                payloadMap = rest;
            }

        } catch (e) {
            console.error(`[Action_Node_Generate] ❌ JSON 解析致命错误:`, e);
            console.warn("错误片段 (前100字符):", cleanJson.substring(0, 100));
            // 对于复杂的嵌套 Payload，正则降级提取难度极大且风险高，此处选择直接报错
            // 但因为有了上面的 fixRules，解析成功率已大幅提升
            return;
        }

        // =================================================
        // 3. 定位地图
        // =================================================
        const mapManager = window.mapManager;
        if (!mapManager) return;

        const targetMap = targetMapId ? mapManager.maps[targetMapId] : mapManager.currentMap;
        if (!targetMap) {
            console.warn(`[Action_Node_Generate] ❌ 目标地图不存在: ${targetMapId || 'current'}`);
            return;
        }

        // =================================================
        // 4. 流式注入 (Stream Injection)
        // =================================================
        const nodeIds = Object.keys(payloadMap);
        let successCount = 0;
        let failCount = 0;

        nodeIds.forEach(nodeId => {
            // 🟢 独立 try-catch：确保单个坏节点不影响大局
            try {
                const nodePayload = payloadMap[nodeId];
                if (!nodePayload) return;

                // 查找节点
                const node = targetMap.nodes.find(n => n.id === nodeId);
                if (!node) {
                    // 这种情况经常发生（LLM 幻觉生成了不存在的 ID），静默跳过或轻微警告
                    // console.warn(`[Action_Node_Generate] ⚠️ 节点 ID 未找到: ${nodeId}`);
                    return;
                }

                // 🟢 注入数据
                // 采用合并模式，保留原有的 payload 字段 (如 description)
                node.payload = {
                    ...node.payload,
                    ...nodePayload
                };

                node.isGenerated = true;

                successCount++;

            } catch (err) {
                console.warn(`[Action_Node_Generate] ⚠️ 节点 [${nodeId}] 注入异常:`, err);
                failCount++;
            }
        });

        // =================================================
        // 5. 反馈
        // =================================================
        if (successCount > 0) {
            console.log(`[Action_Node_Generate] 内容生成完成: 成功 ${successCount} / 失败 ${failCount} (Map: ${targetMap.mapId})`);
            
            // 仅当更新的是当前地图时，刷新 UI
            if (mapManager.currentMap && mapManager.currentMap.mapId === targetMap.mapId) {
                // 这里不需要 addLog，因为节点生成通常是后台静默发生的，除非是玩家显式请求
                // 但为了调试体验，我们可以加一条 debug log
                // addLog(`⚡ 节点内容已就绪 (${successCount})`); 
                
                // 触发 Vue Store 更新 (如果有必要)
                if (window.uiStore) window.uiStore.tempMapData = Date.now();
            }
        }
    }
};