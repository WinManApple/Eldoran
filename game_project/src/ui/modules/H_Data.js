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

// src/ui/modules/H_Data.js

import { reactive } from '../../../lib/vue.esm-browser.js';

// [新增] 定义多人回忆的归档 ID 常量
export const GROUP_ARCHIVE_ID = 'group_archive';

/**
 * ==========================================
 * H 互动历史数据 (H_Data)
 * ==========================================
 * 职责：
 * 1. 存储所有已完成的 H 互动历史 (供 UI 回顾)。
 * 2. 维护当前正在进行的 H 互动会话 (Buffer)。
 * 3. 提供序列化接口供 useSaveSystem 存档。
 */
export const H_Data = reactive({
    
    // --- 持久化数据 ---
    // 存储历史记录列表 (Array of Session Objects)
    history: [],

    // --- 运行时临时数据 ---
    // 当前正在进行的会话 (未存入历史前)
    currentSession: null,

    // ==========================================
    // 1. 会话生命周期管理
    // ==========================================

    /**
     * 开启一个新的互动会话
     * @param {string|Array} targetInput - 单个ID字符串 或 ID数组
     * @param {string} eventName - 事件名称
     * @param {Object} contextData - 上下文数据
     */
    startSession(targetInput, eventName, contextData = null) {
        // 1. 归一化处理：确保 targets 是数组
        const targets = Array.isArray(targetInput) ? targetInput : [targetInput];

        // 2. 核心分流逻辑：
        // - 如果只有1人 -> 归档 ID 为该角色 ID (进入个人回忆录)
        // - 如果有多人 -> 归档 ID 为 GROUP_ARCHIVE_ID (进入"多人羁绊"回忆录)
        // - 兜底 -> 'unknown'
        let storageKey = 'unknown';
        if (targets.length === 1) {
            storageKey = targets[0];
        } else if (targets.length > 1) {
            storageKey = GROUP_ARCHIVE_ID;
        }

        this.currentSession = {
            h_history_id: Date.now().toString() + "_" + Math.floor(Math.random() * 1000),
            
            // [修改] charId 现在代表"归档分组ID" (Folder ID)
            charId: storageKey,
            
            // [新增] 真实参与者列表 (即使归档到多人组，也需要知道具体有谁)
            participants: targets,

            eventName: eventName || "未知事件",
            
            // [新增] 存储上下文数据 (保持不变)
            context: contextData, 

            visibleCount: 0, 
            startTime: Date.now(),
            messages: [], 
            unread: 0     
        };
        console.log(`[H_Data] New session started. Folder: ${storageKey}, Participants: ${targets.join(',')}`);
    },

    /**
     * 向当前会话添加消息
     * @param {string} role - 'user' | 'ai' | 'system'
     * @param {string} text - 内容
     * @param {string|null} name - [新增] 说话人名字 (可选)
     */
    addMessage(role, text, name = null) {
        if (!this.currentSession) return;

        this.currentSession.messages.push({
            role: role,
            text: text,
            name: name, // [新增] 存储名字字段
            timestamp: Date.now()
        });
        // 如果是玩家发言，自动增加可见计数，不用自己点击自己
        if (role === 'user') {
            this.currentSession.visibleCount++;
        }
    },

    /**
     * 结束当前会话并归档
     * (通常在 HInteractionSystem.endInteraction 时调用)
     */
    archiveCurrentSession() {
        if (!this.currentSession) return;

        // 深拷贝一份存入历史
        const sessionToSave = JSON.parse(JSON.stringify(this.currentSession));
        sessionToSave.endTime = Date.now();
        
        // 档时，将可见计数设为最大，确保回顾历史时无需再次点击
        sessionToSave.visibleCount = sessionToSave.messages.length;

        this.history.push(sessionToSave);
        
        // 清空当前会话
        this.currentSession = null;
        // console.log("[H_Data] Session archived. Total history:", this.history.length);
    },

    // 🟢 新增：揭示下一条消息
    revealLog() {
        if (this.currentSession && this.currentSession.visibleCount < this.currentSession.messages.length) {
            this.currentSession.visibleCount++;
            return true; // 返回 true 表示还有新消息被揭示
        }
        return false; // 返回 false 表示已经到底了
    },

    // [新增] 删除指定的历史记录
    deleteSession(historyId) {
        const index = this.history.findIndex(item => item.h_history_id === historyId);
        if (index !== -1) {
            // 记录一下被删除的归档组，方便调试
            const folder = this.history[index].charId;
            
            // 从数组移除
            this.history.splice(index, 1);
            
            console.log(`[H_Data] 已删除记录: ${historyId} (原归属: ${folder})`);
            
            // 可选：如果被删除的正好是当前 UI 正在回放的 (虽然 UI 层通常会处理，但这里可以做个兜底)
            // 比如通知 UI 关闭回放窗口，但这通常由 UI 组件监听数据变化自动处理
            return true;
        }
        return false;
    },

    // ==========================================
    // 2. 数据获取 (Getters)
    // ==========================================

    /**
     * 获取指定角色的所有互动历史
     * @param {string} charId 
     */
    getHistoryByCharId(charId) {
        return this.history.filter(record => record.charId === charId);
    },

    /**
     * 获取当前活动的日志 (用于 UI 实时渲染)
     */
    getCurrentLogs() {
        return this.currentSession ? this.currentSession.messages : [];
    },

    // ==========================================
    // 3. 序列化接口 (供 useSaveSystem 调用)
    // ==========================================

    /**
     * 存档：导出历史记录
     */
    serialize() {
        // 只保存 history 数组，不保存正在进行中的 currentSession (因为存档时互动通常已结束或视为中断)
        return JSON.parse(JSON.stringify({
            history: this.history
        }));
    },

    /**
     * 读档：恢复历史记录
     */
    deserialize(data) {
        if (!data) {
            this.history = [];
            return;
        }
        // 兼容处理：data 可能是 { history: [] } 或者是直接的数组 (旧版本兼容)
        if (Array.isArray(data.history)) {
            this.history = data.history;
        } else if (Array.isArray(data)) {
            this.history = data;
        } else {
            this.history = [];
        }
        this.currentSession = null;
    }
});

window.H_Data = H_Data;