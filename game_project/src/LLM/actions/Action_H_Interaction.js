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

// src/LLM/actions/Action_H_Interaction.js

import { HInteractionSystem } from '../../systems/HInteractionSystem/HInteractionSystem.js';
import { H_Memory } from '../memory/H_Memory.js';
import { H_Data } from '../../ui/modules/H_Data.js';
import { store, addLog } from '../../ui/modules/store.js';
import { JSON_Repair } from '../filters/JSON_Repair.js';
import { H_State_Memory } from '../memory/H_State_Memory.js';

// 对应 Call 脚本中的 expectedTags
export const TAG = 'Task_H_Scene_Play';

export const Action_H_Interaction = {

    /**
     * 执行 H 场景的指令解析与分发
     * @param {string} content - <Task_H_Sence_Play> 标签内的 JSON 字符串
     */
    async execute(content) {
        if (!content) return;

        console.log(`[Action_H] 收到指令，开始解析...`);

        // 1. JSON 清洗与解析 (使用 safeParse 安全解析)
        // 🟢 [修改] 使用 safeParse 替代手动的 try-catch，它会自动处理修复和解析异常
        const data = JSON_Repair.safeParseH(content);

        if (!data) {
            // 如果 data 为 null，说明修复后依然无法解析，safeParse 内部已打印了错误日志
            H_Data.addMessage('system', '❌ (系统错误：无法解析神谕，数据已损坏)');
            return;
        }

        // 预处理数据 (标准化 content/action 格式)
        this._preprocessData(data);

        // 2. 核心分发逻辑 (依据 JSON 结构中的 key)

        // =================================================
        // Case A: 开场白 (Opening)
        // =================================================
        if (data.opening) {
            console.log("[Action_H] 🎬 处理 Opening...");
            
            // 移交 System 处理 (初始化属性 + 注入开场对话)
            HInteractionSystem.handleOpening(data.opening);
            
            addLog("💕 H互动开始");
        }

        // =================================================
        // Case B: 互动脚本 (Interaction)
        // =================================================
        else if (data.interaction) {
            console.log("[Action_H] 🔄 处理 Interaction Script...");

            // 移交 System 处理 (脚本播放器：Action -> Content -> Choice)
            HInteractionSystem.loadScript(data.interaction);
        }

        // =================================================
        // Case C: 结算 (Settlement)
        // =================================================
        else if (data.settlement) {
            console.log("[Action_H] 🏁 处理 Settlement...");
            await this._handleSettlement(data.settlement);
        }

        // =================================================
        // Case D: 异常兜底
        // =================================================
        else {
            console.warn("[Action_H] 未知的数据结构:", Object.keys(data));
            H_Data.addMessage('system', '(系统困惑：收到了无法理解的指令)');
            // 尝试交还控制权，避免卡死
            HInteractionSystem.status = 'WAITING_FOR_USER';
        }
    },

    /**
     * 内部处理：结算逻辑
     * @param {Object} settlementData 
     */
    async _handleSettlement(settlementData) {
        const evalData = settlementData.evaluation || {};

        // 1. [变更] 写入长期记忆 (遍历所有参与者)
        if (settlementData.summary && HInteractionSystem.targetCharIds.length > 0) {
            
            // 🟢 [新增] 获取上下文环境信息
            const ctx = HInteractionSystem.context || {};
            const timeStr = ctx.time || "未知时间";
            const locStr = ctx.location || "未知地点";
            
            // 🟢 [新增] 组合最终记忆文本: [时间 @ 地点] 总结内容
            const finalMemoryText = `[${timeStr} @ ${locStr}] ${settlementData.summary}`;

            HInteractionSystem.targetCharIds.forEach(id => {
                // 写入带环境信息的记忆
                H_Memory.addMemory(id, finalMemoryText);
                console.log(`[Action_H] 记忆已固化: ${id} (包含时空信息)`);
            });
        }

        // =================================================
        // 🟢 [新增] 处理性癖觉醒 (Sexuality)
        // =================================================
        if (settlementData.sexuality) {
            console.log("[Action_H] 🧬 检测到性癖觉醒数据...");
            
            // 遍历返回对象 { charId: "描述/标签", charId2: ["标签1", "标签2"] }
            for (const [charId, content] of Object.entries(settlementData.sexuality)) {
                
                // 兼容处理：LLM 可能返回单个字符串，也可能返回数组
                const tags = Array.isArray(content) ? content : [content];
                
                tags.forEach(tag => {
                    if (tag && typeof tag === 'string') {
                        // 调用 H_State_Memory 写入
                        const success = H_State_Memory.addSexualityTag(charId, tag);
                        
                        if (success) {
                            console.log(`[Action_H] ${charId} 新增性癖: ${tag}`);
                            addLog(`[Action_H] ${charId} 觉醒了新的深层特质： ${tag}`);
                            // 💡 可选：在对话流中给玩家一个显式反馈
                            // 尝试获取角色名以便显示得更友好
                            let charName = charId;
                            if (store.party) {
                                const c = store.party.find(p => p.id === charId);
                                if (c) charName = c.name;
                            }
                        }
                    }
                });
            }
        }

        // 2. 发放奖励 (Rewards)
        if (evalData.rewards) {
            const player = store.playerState;
            
            // A. 经验值
            if (evalData.rewards.exp) {
                const expVal = parseInt(evalData.rewards.exp);
                if (!isNaN(expVal) && expVal > 0) {
                    player.gainExp(expVal);
                    // addLog 由 gainExp 内部触发，这里不再重复
                }
            }

            // B. 物品/道具
            if (evalData.rewards.items) {
                // items 可能是数组，也可能是对象字典，做兼容处理
                const itemsList = Array.isArray(evalData.rewards.items) 
                    ? evalData.rewards.items 
                    : [evalData.rewards.items];

                itemsList.forEach(item => {
                    if (item) {
                        // 使用 Duck Typing 动态物品逻辑
                        player.addItemToInventory(item, item.count || 1);
                        addLog(`🎁 获得: ${item.name} x${item.count || 1}`);
                    }
                });
            }
        }

        // 3. 评价上屏 (作为系统消息插入对话流，留作纪念)
        if (evalData.comment) {
            H_Data.addMessage('system', `[评价]${evalData.comment}`);
        }
        if (evalData.score) {
            H_Data.addMessage('system', `[评分]${evalData.score}`);
        }

        // 4. 触发 System 的结算状态 (弹出结算面板)
        // 注意：不再直接调用 endInteraction，而是展示面板，由玩家点击面板上的“结束”按钮来调用 endInteraction
        HInteractionSystem.triggerSettlement(settlementData);
    },
    
    /**
     * 递归遍历数据，处理 content 的多种简化格式及特殊 Action
     */
    /**
     * 递归遍历数据，处理 content 的多种简化格式及特殊 Action
     */
    _preprocessData(obj) {
        if (!obj || typeof obj !== 'object') return;

        // 1. 处理 Content (保持不变)
        if (obj.content) {
            if (!Array.isArray(obj.content) && typeof obj.content === 'object') {
                obj.content = this._normalizeObjectContent(obj.content);
            } else if (Array.isArray(obj.content)) {
                obj.content = obj.content.map(item => this._normalizeArrayItem(item));
            }
        }

        // 2. 处理特殊 Action (🔴 核心修改处)
        if (obj.action) {
            // [仅做标准化] 统一化处理：无论是对象还是数组，都转为数组处理
            if (!Array.isArray(obj.action)) {
                obj.action = [obj.action];
            } 
            // 把完整的 action 数据保留下来，传给 System 去按顺序执行
        }

        // 3. 递归遍历子属性 (保持不变)
        Object.values(obj).forEach(value => {
            if (typeof value === 'object') {
                this._preprocessData(value);
            }
        });
    },

    /**
     * 将 {"system": "文本"} 这种纯对象转为标准数组
     * (注意：这种格式不支持重复 Key，仅建议用于非对话类描述)
     */
    _normalizeObjectContent(simpleContent) {
        const result = [];
        for (const [key, text] of Object.entries(simpleContent)) {
            result.push({ role: this._mapRole(key), text: text });
        }
        return result;
    },

    /**
     * 标准化数组内的单项 (增强版)
     * 兼容:
     * 1. 标准: { role: "ai", text: "...", name: "..." }
     * 2. 简写: { "莉莉丝": "..." }
     * 3. 抽风兼容: { "role": "莉莉丝", "content": "..." } -> 自动修正为标准格式
     */
    _normalizeArrayItem(item) {
        // 🟢 [兼容修复 1] 字段名修正: LLM 有时用 "content" 代替 "text"
        if (item.content && !item.text) {
            item.text = item.content;
        }

        // 🟢 [兼容修复 2] 角色修正: 如果存在 role 且 text，需要清洗 role 字段
        if (item.role && item.text) {
            let finalRole = 'ai';
            let finalName = item.name || null;
            
            // 归一化判断
            const rawRole = String(item.role).toLowerCase().trim();

            if (rawRole === 'system') {
                finalRole = 'system';
                finalName = null;
            } 
            else if (rawRole === 'user') {
                finalRole = 'user';
                finalName = (store.playerStats && store.playerStats.name) ? store.playerStats.name : 'User';
            } 
            else if (rawRole === 'ai') {
                finalRole = 'ai';
                // name 保持原样，如果没传 name 可能会显示 Unknown
            } 
            else {
                // 🟢 关键: 如果 role 是具体名字 (如 "洛塔斯", "莉莉丝")
                // 将其移动到 name 字段，并将 role 标记为 'ai'
                finalRole = 'ai';
                if (!finalName) finalName = item.role; 
            }

            return {
                role: finalRole,
                text: item.text,
                name: finalName
            };
        }

        // 情况 3: 处理简写格式 { "Name": "Text" }
        const keys = Object.keys(item);
        if (keys.length === 1) {
            const key = keys[0]; // 键名
            const textContent = item[key];
            
            let role = 'ai';
            let name = key;

            if (key === 'user') {
                role = 'user';
                name = (store.playerStats && store.playerStats.name) ? store.playerStats.name : 'User';
            } else if (key === 'system') {
                role = 'system';
                name = null;
            }

            return { 
                role: role, 
                text: textContent,
                name: name 
            };
        }
        
        // 未知格式，原样返回防崩
        return item;
    },

    /**
     * 统一的角色映射逻辑
     */
    _mapRole(key) {
        if (key === 'system') return 'system';
        if (key === 'user') return 'user';
        return 'ai'; // 其他所有名字 (如 "艾莉", "少女") 都视为 ai
    },

};