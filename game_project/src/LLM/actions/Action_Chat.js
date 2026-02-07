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

// src/LLM/actions/Action_Chat.js

import { ChatData } from '../../ui/modules/ChatData.js';
import { Chat_Memory } from '../memory/Chat_Memory.js';
import { Call_Chat } from '../calls/Call_Chat.js';
import { addLog } from '../../ui/modules/store.js';
// 🟢 [新增] 引入指令执行器
import { Action_LLM } from './Action_LLM.js';

// 👇 新增：引入清洗工具
import { JSON_Repair } from '../filters/JSON_Repair.js';

// 定义标签名
export const TAG = "Task_Interaction_With_Player";

/**
 * 聊天交互处理器 (Action Chat)
 * 职责：
 * 1. 解析 <Chat_Content> -> 注入 UI 和 Memory (补全 Reply)
 * 2. 解析 <Summary> -> 存入 Memory 并清理近期对话
 * 3. 解析 <Grand_Summary> -> 存入 Memory 并清理阶段总结
 * 4. 解析 <LLM_System_Instruction> -> 转发给 Action_LLM 执行系统指令
 */
export const Action_Chat = {

    /**
     * 执行 Action
     * @param {string} content - 标签内部的 XML/文本内容
     */
    async execute(content) {
        console.log("[Action_Chat] 开始处理交互响应...");

        // 1. 获取当前频道上下文
        // (通常 LLM 回复的是当前激活的频道，或者我们可以从 content 里分析，但这里暂取 Active)
        const channelId = ChatData.activeChannelId || 'main';
        const memChannel = Chat_Memory.getChannelData(channelId);

        // ============================================
        // A. 处理对话内容 <Chat_Content> (必选)
        // ============================================
        const chatMatch = content.match(/<Chat_Content>([\s\S]*?)<\/Chat_Content>/);
        if (chatMatch) {
            try {
                const rawContent = chatMatch[1];
                
                // 🟢 [修改] 使用专门针对 Chat (流式文本) 的清洗器
                // 它不会强制截断大括号外的内容，也不会暴力转义单引号
                // 原代码: const cleanedContent = JSON_Repair.repair(rawContent);
                const cleanedContent = JSON_Repair.cleanForChat(rawContent);

                // 🟢 传入清洗后的文本给正则解析器
                const chatArray = this._parseLinearChat(cleanedContent);

                if (chatArray.length > 0) {
                    
                    console.log(`[Action_Chat] 准备调用 fillAiReply，策略: 'start'`);
                    console.log(`[Action_Chat] 数据预览:`, chatArray);
                    // 🟢 2. UI 上屏 (传入数组)
                    ChatData.fillAiReply(chatArray, null, 'start');

                    // 🟢 3. 记忆补全 (Memory Injection) - 增强版修复
                    if (memChannel) {
                        const history = memChannel.history.recent_chat;
                        
                        // 情况 A: 记忆库里有等待回复的条目 (通常是玩家刚发完言)
                        // 判断标准：最后一条记录存在，且它的 reply 还是空的或者占位符
                        const lastEntry = history.length > 0 ? history[history.length - 1] : null;
                        
                        let shouldAppendNew = true;

                        // [修复] 增强型判空逻辑：同时识别 undefined, null, 空数组 [], 和 空对象 {}
                        const isContentEmpty = !lastEntry.reply || 
                                             !lastEntry.reply.content || 
                                             (Array.isArray(lastEntry.reply.content) && lastEntry.reply.content.length === 0) ||
                                             (typeof lastEntry.reply.content === 'object' && Object.keys(lastEntry.reply.content).length === 0);

                        // 只有当最后一条是玩家发言，且回复内容确实为空时，才执行合并
                        if (lastEntry && lastEntry.user && isContentEmpty) {
                             shouldAppendNew = false;
                        }

                        // 🟢 [Fix] 创建深拷贝，切断与 UI 数据的引用关联
                        // 防止 ChoiceSystem 后续追加日志时出现“双倍插入”的 BUG
                        const chatArrayForMemory = JSON.parse(JSON.stringify(chatArray));

                        if (!shouldAppendNew) {
                            // 填坑模式
                            if (!lastEntry.reply) lastEntry.reply = { content: [] };
                            // 这里也建议使用副本，虽然填坑模式下通常不会立即触发追加日志
                            lastEntry.reply.content = chatArrayForMemory; 
                            console.log(`[Action_Chat] 记忆补全: 更新了上一条记录`);
                        } else {
                            // 追加模式 (修复支线开场不记录的问题)
                            // 调用 Chat_Memory 的写入接口
                            Chat_Memory.addRecentChat(
                                channelId, 
                                null, // user (null 表示 AI/System)
                                null, // userText
                                chatArrayForMemory, // <--- ✅ 传入独立的副本
                                "Auto"    // timeCount
                            );
                            console.log(`[Action_Chat] 记忆追加: 新增了一条记录 (因为没有待填补的空位)`);
                        }
                    }

                } else {
                    console.warn("[Action_Chat] <Chat_Content> 解析结果为空");
                    // 调试日志：打印清洗后的文本，方便排查
                    console.log("Cleaned Text Debug:", cleanedContent);
                }

            } catch (e) {
                console.error("[Action_Chat] Chat_Content 解析失败:", e);
                // 容错：构建一个标准的数组报错信息
                ChatData.fillAiReply([{ role: "system", text: "（数据解析异常，通讯受损）" }]);
            }
        } else {
            console.warn("[Action_Chat] 未找到 <Chat_Content> 标签");
        }

        // ============================================
        // B. 处理阶段总结 <Summary> (兼容纯文本)
        // ============================================
        const summaryMatch = content.match(/<Summary>([\s\S]*?)<\/Summary>/);
        if (summaryMatch) {
            let rawContent = summaryMatch[1].trim();
            let summaryText = "";

            // 🟢 [强健性修复] 检测是否为 JSON 格式
            if (rawContent.startsWith('{')) {
                // 是 JSON，尝试解析
                const summaryData = JSON_Repair.safeParse(rawContent);
                if (summaryData) {
                    summaryText = summaryData.Summary || summaryData.summary;
                }
            } else {
                // 🟢 不是 JSON，直接作为纯文本处理
                // 过滤掉可能存在的 markdown 符号
                summaryText = rawContent.replace(/```/g, '').trim();
                console.log("[Action_Chat] Summary 识别为纯文本模式");
            }

            if (summaryText && memChannel) {
                // 🟢 [核心修正] 明确向当前频道 (channelId) 写入总结
                Chat_Memory.addSummary(channelId, summaryText, "N/A");
                
                addLog("📝 历史记录已归档 (小结)");
                
                // 🟢 [强健性修复] 安全读取配置
                // 即使 Call_Chat.CONFIG 暂时无法访问，也使用默认值 5，防止崩溃
                const safeConfig = Call_Chat.CONFIG || {};
                const keepCount = safeConfig.RETENTION_RECENT_CHAT || 5;

                const history = memChannel.history.recent_chat;
                if (history.length > keepCount) {
                    const removedCount = history.length - keepCount;
                    history.splice(0, removedCount); 
                    console.log(`[Action_Chat] 频道 ${channelId} 清理了 ${removedCount} 条旧消息`);
                }
            }
        }

        // ============================================
        // C. 处理宏观综述 <Grand_Summary> (兼容纯文本)
        // ============================================
        const grandMatch = content.match(/<Grand_Summary>([\s\S]*?)<\/Grand_Summary>/);
        if (grandMatch) {
            let rawContent = grandMatch[1].trim();
            let grandText = "";

            // 🟢 [强健性修复] 检测是否为 JSON
            if (rawContent.startsWith('{')) {
                const grandData = JSON_Repair.safeParse(rawContent);
                if (grandData) {
                    grandText = grandData.Grand_Summary || grandData.grand_summary;
                }
            } else {
                // 🟢 纯文本模式
                grandText = rawContent.replace(/```/g, '').trim();
                console.log("[Action_Chat] Grand_Summary 识别为纯文本模式");
            }

            if (grandText && memChannel) {
                // 🟢 [核心修正] 明确向当前频道 (channelId) 更新宏观综述
                Chat_Memory.addGrandSummary(channelId, grandText);
                
                addLog("📚 篇章宏观叙事已更新");
                
                // 🟢 [强健性修复] 安全读取配置
                const safeConfig = Call_Chat.CONFIG || {};
                const keepCount = safeConfig.RETENTION_SUMMARY || 3;

                const summaries = memChannel.history.summary;
                if (summaries.length > keepCount) {
                    const removedCount = summaries.length - keepCount;
                    summaries.splice(0, removedCount);
                    console.log(`[Action_Chat] 频道 ${channelId} 清理了 ${removedCount} 条旧小结`);
                }
            }
        }

        // ============================================
        // D. 处理系统指令 <LLM_System_Instruction> (可选)
        // ============================================
        const sysInstMatch = content.match(/<LLM_System_Instruction>([\s\S]*?)<\/LLM_System_Instruction>/);
        if (sysInstMatch) {
            const rawInstruction = sysInstMatch[1];
            
            if (rawInstruction && rawInstruction.trim()) {
                console.log("[Action_Chat] 检测到系统指令，正在清洗...");
                
                // 使用专用的脚本清洗器
                // 仅移除 Markdown、HTML实体和注释，不修改引号
                const scriptContent = JSON_Repair.cleanForScript(rawInstruction);

                // 转发给 Action_LLM
                await Action_LLM.execute(scriptContent);
            }
        }
    },

    /**
     * 线性对话解析器 (升级版)
     * 🟢 修复：现在同时支持双引号 "value" 和单引号 'value'
     */
    _parseLinearChat(rawString) {
        const list = [];
        
        // 正则升级说明：
        // 1. "([^"]+)"       -> 捕获 Key (双引号包裹)
        // 2. \s*:\s* -> 冒号
        // 3. ( ... )         -> 值的分组
        //    "((?:[^"\\]|\\.)*)"  -> 方案A: 双引号包裹的内容
        //    |                    -> 或
        //    '((?:[^'\\]|\\.)*)'  -> 方案B: 单引号包裹的内容 (关键修复!)
        const regex = /"([^"]+)"\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
        
        let match;
        while ((match = regex.exec(rawString)) !== null) {
            try {
                const role = match[1];
                // match[2] 是双引号匹配的内容，match[3] 是单引号匹配的内容
                // 取其中非 undefined 的那个
                let valueRaw = match[2] !== undefined ? match[2] : match[3];

                // 处理转义字符：
                // 如果是单引号包裹的，我们需要把内容里的 \" 变成 "，把 \' 变成 ' 
                // 最简单的办法是构造一个对应的 JSON 字符串来利用 JSON.parse 解转义
                // 但为了容错，直接由 JSON.parse 处理双引号版本；单引号版本手动处理简单转义
                let cleanText = "";
                
                if (match[2] !== undefined) {
                    // 双引号标准 JSON 格式
                    cleanText = JSON.parse(`"${valueRaw}"`);
                } else {
                    // 单引号格式 (LLM 常用)，手动处理换行和转义
                    cleanText = valueRaw
                        .replace(/\\'/g, "'")   // 还原单引号
                        .replace(/\\"/g, '"')   // 还原双引号
                        .replace(/\\\\/g, "\\"); // 还原反斜杠
                }
                
                list.push({
                    role: role,
                    text: cleanText
                });
            } catch (e) {
                // 兜底
                list.push({
                    role: match[1],
                    text: match[2] || match[3]
                });
            }
        }
        return list;
    }
};