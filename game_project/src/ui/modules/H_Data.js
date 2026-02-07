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

// src/ui/modules/H_Data.js
import { reactive } from '../../../lib/vue.esm-browser.js';

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
     * @param {string} charId - 女性角色ID
     * @param {string} eventName - 事件名称
     */
    //  增加 contextData 参数 (默认为 null，不影响旧逻辑)
    startSession(charId, eventName, contextData = null) {
        this.currentSession = {
            h_history_id: Date.now().toString() + "_" + Math.floor(Math.random() * 1000),
            charId: charId,
            eventName: eventName || "未知事件",
            
            // 🟢 [新增] 存储上下文数据 (将 ChatData 传来的记录存入本次会话)
            // 这会自动被 archiveCurrentSession 方法深拷贝到历史记录中，无需额外处理
            context: contextData, 

            visibleCount: 0, // 可见数，实现点击逐行显示消息的效果
            startTime: Date.now(),
            messages: [], // 存储 {role, text, timestamp}
            unread: 0     // 历史回顾时的未读标记
        };
        console.log("[H_Data] New session started:", this.currentSession.h_history_id);
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