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

// src/LLM/calls/Call_Custom_Opening.js

import { CustomOpeningConfig } from '../../config/CustomOpeningConfig.js';
import { store } from '../../ui/modules/store.js';
import { TAG as Tag_Custom_Opening } from '../actions/Action_Custom_Opening.js'; // 假设 Action 文件已定义该常量

/**
 * 辅助工具：权重随机选择器
 * @param {Array<{value: any, weight: number}>} items - 选项数组
 * @returns {any} 选中的 value
 */
function weightedRandom(items) {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of items) {
        if (random < item.weight) return item.value;
        random -= item.weight;
    }
    return items[items.length - 1].value;
}

/**
 * 辅助工具：生成指定范围内的随机整数
 */
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const Call_Custom_Opening = {

    /**
     * 构建自定义开局生成请求
     * @param {Object} formData - 来自 CustomOpeningOverlay.js 的表单数据
     * @returns {Object} 构造好的 RPC 请求 Payload
     */
    constructRequest(formData) {
        console.log("[Call_Custom_Opening] 收到原始数据:", formData);
        console.log("[Call_Custom_Opening] 收到资源数据:", formData.expectedResources);
        console.log("[Call_Custom_Opening] 开始构建开局骨架...", formData);

        // 1. 初始化数据
        const resources = formData.expectedResources || { gold: 0, itemCount: 0, companionCount: 0 };
        const companionDetails = formData.companionDetails || [];
        const config = CustomOpeningConfig;

        // ----------------------------------------------------
        // Step 1: 物品处理 (静态截留 vs 动态骨架)
        // ----------------------------------------------------
        const staticItems = [];
        const dynamicItemSkeletons = [];

        for (let i = 0; i < resources.itemCount; i++) {
            const isStatic = Math.random() < config.ITEMS.STATIC_RATIO;

            if (isStatic) {
                // --- 生成静态物品 (不发给 LLM) ---
                // 1. 随机类型 (hp/mp/hybrid)
                const typeKeys = Object.keys(config.ITEMS.STATIC_TYPE_WEIGHTS);
                const typeWeights = typeKeys.map(k => ({ value: k, weight: config.ITEMS.STATIC_TYPE_WEIGHTS[k] }));
                const selectedType = weightedRandom(typeWeights);

                // 2. 随机档位 (low/mid/high)
                const tierKeys = Object.keys(config.ITEMS.STATIC_TIER_WEIGHTS);
                const tierWeights = tierKeys.map(k => ({ value: k, weight: config.ITEMS.STATIC_TIER_WEIGHTS[k] }));
                const selectedTier = weightedRandom(tierWeights);

                // 3. 查表获取 ID
                const mapKey = `${selectedType}_${selectedTier}`;
                const itemId = config.ITEMS.STATIC_ID_MAP[mapKey] || 'item_potion_hp_small';

                staticItems.push({
                    id: itemId,
                    count: 1,
                    isStatic: true // 标记
                });
            } else {
                // --- 生成动态物品骨架 (发给 LLM 填空) ---
                const quality = weightedRandom(config.ITEMS.DYNAMIC_QUALITY_WEIGHTS);
                const type = weightedRandom(config.ITEMS.DYNAMIC_TYPE_WEIGHTS);

                dynamicItemSkeletons.push({
                    name: "(待填充)", // LLM 填空
                    type: type,      // 约束: 必须是选定类型
                    quality: quality,// 约束: 必须是选定品质
                    count: 1,
                    description: "(待填充：一段充满风味的物品描述)",
                    stats: {         // LLM 需根据 Quality 填充数值
                        "(待填充:属性键名)": "(待填充:数字)",
                        "(待填充:其他属性键名)": "(待填充:数字)",
                    }
                });
            }
        }

        // ⚠️ 关键副作用：将静态物品暂存到 Store，等待 Action 回调时合并
        // Action_Custom_Opening.js 执行时会读取这个字段
        store.tempStaticItems = staticItems;
        console.log(`[Call_Custom_Opening] 静态物品已暂存 (${staticItems.length}个), 准备生成 ${dynamicItemSkeletons.length} 个动态物品骨架`);


        // ----------------------------------------------------
        // Step 2: 伴侣骨架生成
        // ----------------------------------------------------
        const companionSkeletons = [];
        for (let i = 0; i < resources.companionCount; i++) {
            const detail = companionDetails[i] || {};
            
            // 构建单个伴侣骨架
            companionSkeletons.push({
                id: `dynamic_char_${Date.now()}_${i}`,
                base_info: {
                    // 🟢 [修改] 直接映射用户输入，若为空则提供引导性占位符
                    name: detail.name?.trim() || "(待填充:随机女性名字)",
                    identity: detail.identity?.trim() || "(待填充:身份职业)",
                    character: detail.character?.trim() || "(待填充:详细性格描述)", 
                    appearance: detail.appearance?.trim() || "(待填充:详细外貌描写)",
                    core_objective: "(待填充:核心目标)" // 目标通常由 AI 根据身份生成
                },
                attributes: {
                    base_atk: `(待填充: ${config.COMPANIONS.BASE_STATS.atk[0]}-${config.COMPANIONS.BASE_STATS.atk[1]})`,
                    base_def: `(待填充: ${config.COMPANIONS.BASE_STATS.def[0]}-${config.COMPANIONS.BASE_STATS.def[1]})`,
                    base_speed: `(待填充: ${config.COMPANIONS.BASE_STATS.speed[0]}-${config.COMPANIONS.BASE_STATS.speed[1]})`,
                    base_crit_rate: `(待填充: ${config.COMPANIONS.BASE_STATS.crit[0]}-${config.COMPANIONS.BASE_STATS.crit[1]})`,
                    resistance_phys:  `(待填充(小于1受伤提高，大于1受伤害减少): ${config.COMPANIONS.BASE_STATS.resistance_phys[0]}-${config.COMPANIONS.BASE_STATS.resistance_phys[1]})`,
                    resistance_magic:  `(待填充(小于1受伤提高，大于1受伤害减少): ${config.COMPANIONS.BASE_STATS.resistance_magic[0]}-${config.COMPANIONS.BASE_STATS.resistance_magic[1]})`
                },
                initial_equipment: ["(待填充)"],
                initial_skills: ["(待填充)"],
                h_state_init: {
                    affection: "(待填充: 0-100)",
                    depravity: "(待填充: 0-100)",
                    isVirgin: true,
                    sexCount: 0,
                    parts: { mouth: 0, breast: 0, pussy: 0, anal: 0 },
                    call_player: "(待填充: 称呼)"
                }
            });
        }

        // ----------------------------------------------------
        // Step 3: 剧本骨架生成 (固定长度)
        // ----------------------------------------------------
        const scriptLen = randomInt(config.SCRIPTS.LENGTH_RANGE[0], config.SCRIPTS.LENGTH_RANGE[1]);
        const scriptSkeletons = [];
        
        // 预填几行 System 以引导 LLM
        scriptSkeletons.push({ role: "system", text: "(待填充)" });
        scriptSkeletons.push({ role: "system", text: "(待填充)" });
        
        // 填充剩余空行
        for (let i = 2; i < scriptLen; i++) {
            scriptSkeletons.push({ role: "(待填充)", text: "(待填充)" });
        }


        // ----------------------------------------------------
        // Step 4: 组装最终 JSON 骨架
        // ----------------------------------------------------
        const fullSkeleton = {
            meta: {
                title: "(待填充: 开局标题)",
                description: "(待填充: 简短剧情简介)",
                tags: ["(待填充: 标签1)", "(待填充: 标签2)", `(待填充: 对应 ${formData.worldStyle || '未知'} 风格)`]
            },
            openingData: {
                playerConfig: {
                    name: formData.playerName || "(待填充)",
                    identity: formData.playerIdentity || "(待填充)",
                    character: formData.playerPersonality || "(待填充: 基于用户输入扩展)",
                    appearance: formData.playerAppearance || "(待填充: 基于身份补全详细外貌)",
                    core_objective: formData.playerObjective || "(待填充: 角色的核心行动目标)",
                    extraGold: resources.gold // 🔒 强制锁定，LLM 不可修改
                },
                items: dynamicItemSkeletons, // 仅动态物品
                scripts: scriptSkeletons
            },
            companionData: companionSkeletons,
            mapTheme: {
                id: "THEME_DYNAMIC_GENERATED",
                name: `(待填充: 与 ${formData.worldStyle} 相关的地名)`,
                depthRange: ["(待填充:最小层数)", "(待填充:最大层数)"], 
                nodeCountRange: ["(待填充:最少节点)", "(待填充:最多节点)"],
                distribution: {
                    "COMBAT": "(待填充), 该节点所占节点数量比例",
                    "RESOURCE":"(待填充), 该节点所占节点数量比例",
                    "EVENT_CHOICE": "(待填充)",
                    "EVENT_H": "(待填充)",
                    "EVENT_QUEST": "(待填充)",
                    "REST": "(待填充)",
                    "SHOP": "(待填充)",
                    "LOCATION": "(待填充)"
                }
            }
        };

        // ----------------------------------------------------
        // Step 5: 返回 RPC Payload
        // ----------------------------------------------------
        return {
            command: 'OPENING',
            expectedTags: ['Task_Custom_Opening'], 
            params: {
                // 这个字段将被 ST 端的 Custom_Opening.js 脚本用于替换 {{Custom_Opening}} 宏
                // 我们发送格式化好的 JSON 字符串
                customOpeningSkeleton: JSON.stringify(fullSkeleton, null, 2),
                
                // 用户对情节的具体设计 (对应 formData.worldStyle)
                // 如果用户没填，给一个默认值
                userPlotDesign: formData.worldStyle || "无特殊剧情要求",
            }
        };
    }
};