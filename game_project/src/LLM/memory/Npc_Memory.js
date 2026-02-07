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

// src/LLM/memory/Npc_Memory.js
import { store } from '../../ui/modules/store.js';

/**
 * NPC 记忆库 (NPC Memory)
 * 职责：
 * 1. 记录世界中遇到或创造的所有重要 NPC 的档案。
 * 2. 追踪 NPC 的生死状态、对玩家态度以及过往交集。
 * 3. 为 Combat Action 提供强度参考 (high/medium/low)。
 */
export const Npc_Memory = {
    
    // 核心存储容器
    // 结构: { [npcId]: { base_information: {...}, interaction_history: [], ... } }
    npcs: {},

    /**
     * 获取当前游戏的标准化时间戳
     */
    _getFormattedTime() {
        return store.worldState.timeDisplay;
    },

    // ==========================================
    // 1. 写入与更新 (Write / Update)
    // ==========================================

    /**
     * 🟢 注册或更新 NPC 基础档案
     * 通常在 NPC 初次登场或发生重大变化时调用
     * * @param {Object} params - NPC 参数对象
     * @param {string} params.id - NPC唯一ID (如 'npc_guard_01')
     * @param {string} params.name - 姓名
     * @param {string} params.sex - 性别
     * @param {string} params.character - 性格描述 (LLM生成)
     *  @param {string} params.appearance - [新增] 外貌描述
     *  @param {string} coreObjective - 核心目标
     * @param {string} params.lineup - 阵容 (如 '帝国军', '中立', '魔物')
     * @param {string} params.attitude - 对玩家态度 (如 '敌对', '友善', '恐惧')
     * @param {string} params.combatEffectiveness - 战斗强度 ('high' | 'medium' | 'low')
     */
    registerNPC({ id, name, sex, appearance, character, identity, coreObjective, lineup, attitude, combatEffectiveness }) {
        // 如果不存在，初始化结构
        if (!this.npcs[id]) {
            this.npcs[id] = {
                base_information: {
                    NPC_ID: id,
                    name: name || "未知人物",
                    sex: sex || "unknown",
                    appearance: appearance || "外貌平平",
                    character: character || "普通",
                    identity: identity || "未知身份",
                    core_objective: coreObjective || "未知目标"
                },
                lineup: lineup || "中立",
                attitude_to_player: typeof attitude === 'number' ? attitude : 0,
                combat_effectiveness: combatEffectiveness || "medium", // 默认为中等
                interaction_history: [],
                state: "Live" // 默认存活
            };
            console.log(`[Npc_Memory] 新建档案: ${name} (${id})`);
        } else {
            // 如果已存在，更新可变属性 (保留历史记录)
            const npc = this.npcs[id];
            if (lineup) npc.lineup = lineup;
            if (attitude) npc.attitude_to_player = attitude;
            if (combatEffectiveness) npc.combat_effectiveness = combatEffectiveness;
            
            // 基础信息通常不变，但如果传入了新的性格或外貌描述，也可以更新
            if (character) npc.base_information.character = character;
            if (appearance) npc.base_information.appearance = appearance;
            //  允许更新身份
            if (identity) npc.base_information.identity = identity;
            //  允许更新核心目标
            if (coreObjective) npc.base_information.core_objective = coreObjective;

            console.log(`[Npc_Memory] 更新档案: ${npc.base_information.name}`);
        }
    },

    /**
     * 🟢 添加交集记录 (Interaction History)
     * 当玩家与 NPC 对话、战斗或发生事件后调用
     * @param {string} id - NPC ID
     * @param {string} detail - 发生的事件描述 (如 "在酒馆与玩家争吵", "被玩家击败并求饶")
     */
    addInteraction(id, detail) {
        const npc = this.npcs[id];
        if (!npc) {
            console.warn(`[Npc_Memory] 无法添加记录，NPC ${id} 不存在`);
            return;
        }
        // 修改点：存入时即刻打上时间戳戳记
        const timestamp = this._getFormattedTime();
        npc.interaction_history.push(`[${timestamp}] ${detail}`);
    },

    /**
     * 🟢 更新生死状态
     * @param {string} id - NPC ID
     * @param {string} state - 'Live' | 'Dead'
     */
    updateState(id, state) {
        const npc = this.npcs[id];
        if (npc) {
            npc.state = state;
            console.log(`[Npc_Memory] ${npc.base_information.name} 状态变更为: ${state}`);
        }
    },

    /**
     * 🟢 [新增] 彻底删除 NPC 档案
     * 用于 NPC 转正为队友时，防止 ID 冲突和 LLM 认知混乱
     */
    deleteNPC(id) {
        if (this.npcs[id]) {
            const name = this.npcs[id].base_information.name;
            delete this.npcs[id];
            console.log(`[Npc_Memory] 🗑️ 已销毁旧档案: ${name} (${id})`);
            return true;
        }
        return false;
    },

    // ==========================================
    // 2. 读取与获取 (Read)
    // ==========================================

    /**
     * 获取单个 NPC 的完整数据
     */
    getNPC(id) {
        return this.npcs[id] || null;
    },

    /**
     * 获取用于 LLM Prompt 的精简描述
     * @param {string} id 
     */
    getNpcContext(id) {
        const npc = this.npcs[id];
        if (!npc) return "";

        const base = npc.base_information;
        // 格式化历史记录 (最近 3 条)
        const recentHistory = npc.interaction_history.slice(-3).join("; ");

        return `
[人物档案]
- 姓名: ${base.name} (${base.sex})
- 身份: ${base.identity || "未知"}
- 性格: ${base.character}
- 外貌: ${base.appearance || "暂无描述"}
- 核心目标: ${base.core_objective || "未知"}
- 阵营: ${npc.lineup}
- 状态: ${npc.state}
- 对玩家态度: ${npc.attitude_to_player}
- 战斗强度评估: ${npc.combat_effectiveness}
- 过往交集: ${recentHistory || "初次见面"}
`.trim();
    },

    // ==========================================
    // 3. 序列化与反序列化 (Storage)
    // ==========================================

    serialize() {
        return this.npcs;
    },

    deserialize(data) {
        if (data) {
            this.npcs = data;
            console.log(`[Npc_Memory] 已载入 ${Object.keys(data).length} 名 NPC 档案`);
        } else {
            this.npcs = {};
        }
    }
};

window.Npc_Memory = Npc_Memory;