/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
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

    // ==========================================
    // 3. 挂载全局接口
    // ==========================================
    // 方便 DialogueOverlay 或其他组件调用
    window.handleUserChat = handleUserChat;

    return {
        handleUserChat
    };
}