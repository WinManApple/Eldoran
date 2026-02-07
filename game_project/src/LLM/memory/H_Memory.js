/*
* Project: Eldoran
 * Copyright (C) 2026 WinAppleMan
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

// src/LLM/memory/H_Memory.js
import { reactive } from '../../../lib/vue.esm-browser.js';

/**
 * ==========================================
 * H 互动长期记忆 (H_Memory)
 * ==========================================
 * 职责：
 * 1. 存储给 LLM 看的 H 互动总结 (精简文本)。
 * 2. 结构简单，以 charId 为索引，内容为字符串数组。
 * 3. 提供序列化接口供 useSaveSystem 存档。
 */
export const H_Memory = reactive({
    
    // 数据存储结构: { "charId": ["总结1", "总结2", ...] }
    memories: {},

    // ==========================================
    // 1. 记忆操作
    // ==========================================

    /**
     * 添加一条记忆总结
     * @param {string} charId - 女性角色 ID
     * @param {string} summary - 互动总结文本 (由 LLM 在结算时生成)
     */
    addMemory(charId, summary) {
        if (!charId || !summary) return;

        if (!this.memories[charId]) {
            this.memories[charId] = [];
        }
        this.memories[charId].push(summary);
        // console.log(`[H_Memory] Added memory for ${charId}`);
    },

    /**
     * 获取指定角色的所有记忆 (用于组装 Prompt)
     * @param {string} charId 
     * @returns {Array<string>} 总结列表
     */
    getMemories(charId) {
        return this.memories[charId] || [];
    },

    /**
     * 获取指定角色的记忆文本块 (直接拼接好，方便 Prompt 使用)
     * @param {string} charId 
     * @returns {string} 带序号的文本块
     */
    getFormattedMemoryBlock(charId) {
        const list = this.getMemories(charId);
        if (list.length === 0) return "无";
        
        return list.map((m, i) => `${i + 1}. ${m}`).join("\n");
    },

    /**
     * 清除指定角色的记忆 (调试用)
     */
    clearMemory(charId) {
        if (this.memories[charId]) {
            delete this.memories[charId];
        }
    },

    // ==========================================
    // 2. 序列化接口 (供 useSaveSystem 调用)
    // ==========================================

    /**
     * 存档
     */
    serialize() {
        return JSON.parse(JSON.stringify(this.memories));
    },

    /**
     * 读档
     */
    deserialize(data) {
        this.memories = data || {};
    }
});
