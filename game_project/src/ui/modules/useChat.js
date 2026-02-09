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

// src/ui/modules/useChat.js
import { store } from './store.js';
import { ChatData } from './ChatData.js'; 
import { Call_Chat } from '../../LLM/calls/Call_Chat.js'; 

/**
 * ==========================================
 * AI 与 聊天系统模块 (AI & Chat System) - v3.0 异步架构版
 * ==========================================
 * 职责：
 * 1. 处理用户输入 UI 逻辑 (上屏、锁定状态)。
 * 2. 调用 Call_Chat 发送请求 (不等待结果)。
 * 3. 结果处理权移交给 Action 系统 (后续通过 WebSocket 回调)。
 */

export function useChat() {

    // ==========================================
    // 核心交互逻辑 (Handle Chat)
    // ==========================================

    /**
     * 处理用户发送消息
     * @param {string} text - 用户输入的文本
     */
    const handleUserChat = async (text) => {
        // 0. 基础校验
        if (!text || !text.trim()) return;

        const currentChannel = ChatData.currentChannelInfo;
        if (!currentChannel) {
            console.error("[Chat] 错误: 未找到当前频道信息");
            return;
        }
        
        console.log(`[Chat] 发送消息至 [${currentChannel.name}]: ${text}`);

        // 2. 消息上屏 (仅玩家侧)
        // 使用新版 ChatData 的结构化写入方法，在 UI 上立即显示玩家的气泡
        ChatData.pushUserMessage(text);

        try {
            // 3. 发送请求 (Fire and Forget)
            // 我们不再需要在前端构建 context，Call_Chat 会自动去 Memory 里抓取
            await Call_Chat.requestChat(
                text,
                currentChannel.name,
                currentChannel.type,
                currentChannel.id
            );

            // ⚠️ 关键点：这里不再等待 response.text
            // 也不再调用 ChatData.addMessage('ai', ...)
            // 真正的回复将由 Action_Chat 触发 ChatData.fillAiReply 来完成

        } catch (err) {
            console.error("[Chat] 请求发射失败:", err);
            //  界面刷新反馈：
            // 虽然 Manager 会停止转圈，但我们需要在聊天流里明确告诉用户发生了错误
            // 使用数组格式构建系统消息
            ChatData.fillAiReply([
                { role: "system", text: `❌ 信号中断: ${err.message || "未知错误"}` }
            ], null, true);
        }
        
    };

    /**
     * 🟢 [新增] 处理静默请求 (不通过 UI 上屏，不记录入 Memory)
     * 用于 "重发/续写" 或 "系统自动触发" 的场景
     * @param {string} text - 发送给 LLM 的指令文本
     */
    const handleSilentRequest = async (text) => {
        // 0. 基础校验
        if (!text || !text.trim()) return;

        const currentChannel = ChatData.currentChannelInfo;
        if (!currentChannel) {
            console.error("[Chat] 错误: 未找到当前频道信息");
            return;
        }
        
        console.log(`[Chat] 发起静默请求 (Silent): ${text}`);

        // 🛑 核心区别：跳过 ChatData.pushUserMessage(text);
        // 这样这句话就不会出现在玩家的聊天记录里，也不会污染短期记忆

        try {
            // 3. 发送请求 (Fire and Forget)
            await Call_Chat.requestChat(
                text,
                currentChannel.name,
                currentChannel.type,
                currentChannel.id
            );

        } catch (err) {
            console.error("[Chat] 静默请求失败:", err);
            // 错误反馈依然需要上屏，告知玩家为什么没反应
            ChatData.fillAiReply([
                { role: "system", text: `❌ 续写失败: ${err.message || "未知错误"}` }
            ], null, true);
        }
    };

    // ==========================================
    // 3. 挂载全局接口
    // ==========================================
    // 方便 DialogueOverlay 或其他组件调用
    window.handleUserChat = handleUserChat;
    window.handleSilentRequest = handleSilentRequest;

    return {
        handleUserChat,
        handleSilentRequest
    };
}