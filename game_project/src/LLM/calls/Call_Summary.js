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

// src/LLM/calls/Call_Summary.js
import { Chat_Memory } from '../memory/Chat_Memory.js';
import { TAG as Tag_Summary } from '../actions/Action_Summary.js';

/**
 * 频道总结请求构建器 (Refactored v2.0 - Many-to-Many)
 * 职责：
 * 1. 聚合多个源频道 (Source) 的历史数据
 * 2. 格式化为单一的上下文文本块
 * 3. 指示 LLM 将总结结果注入到多个目标频道 (Target)
 */
export const Call_Summary = {

    /**
     * 构建请求数据
     * @param {Array<string>|string} sourceChannelIds - 源频道 ID 列表 (如 ['sub_1', 'sub_2'])
     * @param {Array<string>|string} targetChannelIds - 目标频道 ID 列表 (如 ['main', 'sub_1'])
     * @param {Array<number>} wordCount - [新增] 字数范围 [min, max], 默认 [100, 300]
     */
    constructRequest(sourceChannelIds, targetChannelIds, wordCount = [100, 300]) {
        // 1. 参数归一化 (确保是数组)
        const sources = Array.isArray(sourceChannelIds) ? sourceChannelIds : [sourceChannelIds];
        const targets = Array.isArray(targetChannelIds) ? targetChannelIds : [targetChannelIds];

        if (sources.length === 0 || targets.length === 0) {
            console.warn("[Call_Summary] 源频道或目标频道列表为空，请求取消");
            return null;
        }

        // 2. 遍历源频道，组装上下文
        let contextBlocks = [];

        sources.forEach(sourceId => {
            const channelData = Chat_Memory.getChannelData(sourceId);
            
            if (!channelData) {
                console.warn(`[Call_Summary] 忽略无效的源频道: ${sourceId}`);
                return; // continue
            }

            const history = channelData.history;
            const channelName = channelData.name || sourceId;

            // A. 数据提取
            // [修改] 兼容 grand_summary (支持数组列表与旧版对象)
            let grandSummary = "暂无";
            if (history.grand_summary) {
                if (Array.isArray(history.grand_summary)) {
                    // 新版：数组结构 -> 拼接列表
                    if (history.grand_summary.length > 0) {
                        grandSummary = history.grand_summary.map(s => `- ${s.content}`).join("\n");
                    }
                } else if (history.grand_summary.content) {
                    // 旧版兼容：对象结构
                    grandSummary = history.grand_summary.content;
                }
            }
            
            const recentSummaries = history.summary && history.summary.length > 0
                ? history.summary.map(s => `- ${s.content}`).join("\n")
                : "暂无";

            const formattedChat = this._compressChatHistory(history.recent_chat);

            // B. 格式化为独立的数据块
            const block = `
=== 待总结频道: ${channelName} (ID: ${sourceId}) ===
[宏观背景]:
${grandSummary}

[阶段回顾]:
${recentSummaries}

[近期对话]:
${formattedChat}
=============================================
`;
            contextBlocks.push(block);
        });

        if (contextBlocks.length === 0) {
            return null;
        }

        // 格式化字数要求字符串 (例如 "100-300")
        // 如果传入的格式不对，兜底为 "100-300"
        const sumNumberStr = (Array.isArray(wordCount) && wordCount.length === 2) 
            ? `${wordCount[0]}-${wordCount[1]}` 
            : "100-300";

        // 3. 构建 Payload
        return {
            command: 'SUMMARY',
            expectedTags: [Tag_Summary],
            params: {
                // 核心参数：告诉 LLM 总结结果发给谁 (Array)
                target_ids: targets,
                
                // 核心素材：拼接后的所有源频道内容
                summary_context: contextBlocks.join("\n\n"),

                // 传递字数参数
                sum_number: sumNumberStr
            }
        };
    },

    /**
     * 内部方法：将近期对话记录压缩为纯文本
     * (逻辑保持不变，依然负责 Token 压缩与格式清洗)
     */
    _compressChatHistory(recentChatArray) {
        if (!recentChatArray || recentChatArray.length === 0) {
            return "暂无近期对话";
        }

        return recentChatArray.map(entry => {
            let lines = [];

            // 1. 玩家部分
            if (entry.user && entry.userText) {
                lines.push(`${entry.user}: ${entry.userText}`);
            }

            // 2. 回复部分
            if (entry.reply && entry.reply.content) {
                const content = entry.reply.content;

                // 数组模式
                if (Array.isArray(content)) {
                    content.forEach(item => {
                        const role = item.role || item.name || 'Unknown';
                        const text = item.text || item.value || '';
                        if (role === 'system') lines.push(`(System: ${text})`);
                        else lines.push(`${role}: ${text}`);
                    });
                }
                // 对象模式
                else if (typeof content === 'object') {
                    for (const [key, val] of Object.entries(content)) {
                        if (key === 'system') lines.push(`(System: ${val})`);
                        else lines.push(`${key}: ${val}`);
                    }
                }
            }
            return lines.join("\n");
        }).join("\n\n");
    }
};