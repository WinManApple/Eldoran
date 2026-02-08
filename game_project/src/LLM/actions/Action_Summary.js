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

// src/LLM/actions/Action_Summary.js
import { Chat_Memory } from '../memory/Chat_Memory.js';
import { ChatData } from '../../ui/modules/ChatData.js';
import { addLog } from '../../ui/modules/store.js';

export const TAG = 'Task_Summary';

export const Action_Summary = {
    /**
     * 执行频道总结注入 (多对多模式)
     * 职责：解析 LLM 返回的总结 JSON，将其广播注入到所有目标频道的 Memory 和 UI 中
     * @param {string} content - <Task_Summary> 标签内的 JSON 字符串
     */
    async execute(content) {
        if (!content) return;

        let summaryData = {};
        try {
            // 1. JSON 清洗与解析 (去除 Markdown 标记)
            const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
            summaryData = JSON.parse(cleanJson);
        } catch (e) {
            console.error("[Action_Summary] JSON 解析失败:", e);
            addLog("❌ 总结数据解析异常");
            return;
        }

        // 2. 提取关键字段
        // 兼容处理：LLM 有时可能把数组写成单字符串，这里做个防御
        let targetIds = summaryData.Target_ID || summaryData.id; 
        const summaryText = summaryData.summary;

        if (!targetIds || !summaryText) {
            console.warn("[Action_Summary] 返回数据缺失 Target_ID 或 summary 字段");
            return;
        }

        // 强制转为数组，方便统一处理
        if (!Array.isArray(targetIds)) {
            targetIds = [targetIds];
        }

        console.log(`[Action_Summary] 正在广播总结至 ${targetIds.length} 个频道:`, targetIds);

        // 3. 遍历注入
        let successCount = 0;

        for (const targetChannelId of targetIds) {
            // A. 注入到 Chat_Memory (持久化层)
            // 作为 System 消息追加到 recent_chat 尾部，成为未来 LLM 的上下文
            if (window.Chat_Memory) {
                // 调用 Chat_Memory.js 中新增的追加接口
                window.Chat_Memory.addGrandSummary(targetChannelId, summaryText);
            }

            // B. 注入到 ChatData (UI 显示层)
            // 立即在界面上显示 (如果是非活跃频道，会增加红点)
            if (window.ChatData) {
                window.ChatData.appendSystemLog(summaryText, targetChannelId);
            }
            
            successCount++;
        }

        // 4. 系统日志反馈
        if (successCount > 0) {
            addLog(`📝 剧情已收束，同步至 [${successCount}] 个频道`);
        }
    }
};