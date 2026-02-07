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

// src/LLM/memory/Party_Memory.js
import { store } from '../../ui/modules/store.js';

/**
 * 队友交互记忆 (Party Memory)
 * 职责：
 * 1. 专门记录已入队队友与玩家的交互历史。
 * 2. 提供从 NPC_Memory 迁移数据的接口 (当 NPC 变成队友时)。
 * 3. 为 LLM 提供队友相关的上下文。
 */
export const Party_Memory = {
    
    // 数据存储核心
    // 结构: { [teammateId]: { id: "...", memory: [] } }
    data: {},

    // ==========================================
    // 1. 写入与迁移 (Write / Import)
    // ==========================================

    /**
     * 获取当前游戏的标准化时间戳
     */
    _getFormattedTime() {
        return store.worldState.timeDisplay;
    },

    /**
     * 🟢 添加队友交互记录
     * @param {string} id - 队友 ID (如 'npc_elara' 或 'player_2')
     * @param {string} record - 交互内容 (如 "在战斗中为玩家挡下了一箭")
     * @param {number|string} time - 可选，发生时间
     */
    addRecord(id, record, time = null) {
        if (!this.data[id]) {
            this._initTeammate(id);
        }
        
        // 修改点：使用统一的时间戳
        const timestamp = time || this._getFormattedTime(); 
        const entry = `[${timestamp}] ${record}`;
        this.data[id].memory.push(entry);
        
        console.log(`[Party_Memory] 📝 队友 ${id} 新增记忆: ${record}`);
    },

    /**
     * 🟢 核心功能：从 NPC 记忆迁移数据
     * 当 NPC 加入队伍时调用此方法，继承过往的历史
     * @param {string} targetId - 新生成的队友 ID (如 player_101)
     * @param {Object} npcData - 旧 NPC 的数据对象 (包含 interaction_history)
     */
    importFromNpc(targetId, npcData) {
        if (!npcData) return;

        if (!this.data[targetId]) {
            this._initTeammate(targetId);
        }

        // 修改点：直接迁移，不再更改标记或添加 [入队前]
        if (npcData.interaction_history && Array.isArray(npcData.interaction_history)) {
            this.data[targetId].memory.push(...npcData.interaction_history);
        }

        console.log(`[Party_Memory] 🔄 记忆迁移完成: ${targetId} (共 ${npcData.interaction_history?.length || 0} 条)`);
    },

    /**
     * 内部初始化
     */
    _initTeammate(id) {
        this.data[id] = {
            id: id,
            memory: [] // 交互记录数组
        };
    },

    // ==========================================
    // 2. 读取 (Read)
    // ==========================================

    /**
     * 获取指定队友的完整记忆对象
     */
    getTeammateMemory(id) {
        return this.data[id] || null;
    },

    /**
     * 获取用于 LLM 上下文的格式化文本 (最近 N 条)
     * @param {string} id 
     * @param {number} limit 
     */
    getContext(id, limit = 5) {
        const entry = this.data[id];
        if (!entry || entry.memory.length === 0) return "";

        const recent = entry.memory.slice(-limit);
        return recent.join("\n");
    },

    // ==========================================
    // 3. 序列化与反序列化 (Storage)
    // ==========================================

    serialize() {
        return this.data;
    },

    deserialize(savedData) {
        if (savedData) {
            this.data = savedData;
            console.log(`[Party_Memory] 已加载 ${Object.keys(savedData).length} 名队友的记忆`);
        } else {
            this.data = {};
        }
    }
};