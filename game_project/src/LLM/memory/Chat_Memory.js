/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/LLM/memory/Chat_Memory.js
import { getOpeningConfig } from '../../config/Opening.js';

/**
 * 对话记忆管理器 (Chat Memory)
 * 职责：
 * 1. 管理多频道 (Main/Sub) 的对话历史
 * 2. 实现 "宏观综述 -> 阶段回顾 -> 近期对话" 的三级记忆结构
 * 3. 提供上下文构建接口 (为 LLM 组装 Prompt)
 */
export const Chat_Memory = {
    
    // 核心数据存储
    // 结构: { [channelId]: { type, id, history: { grand_summary, summary:[], recent_chat:[] } } }
    channels: {},

    // ==========================================
    // 1. 频道管理
    // ==========================================

    /**
     * 获取或初始化频道
     * @param {string} channelId - 频道ID (如 'main', 'sub_123')
     * @param {string} type - 频道类型 ('MAIN' | 'QUEST')
     */
    _getChannel(channelId, type = 'MAIN') {
        if (!this.channels[channelId]) {
            
            // 初始化基础结构
            const newChannel = {
                type: type,
                ID: channelId,
                history: {
                    grand_summary: [], // [修改] 默认为空数组
                    summary: [], 
                    recent_chat: [] 
                }
            };

            this.channels[channelId] = newChannel;
            console.log(`[Chat_Memory] 新频道已建立: ${channelId}`);
        }
        return this.channels[channelId];
    },

    // ==========================================
    // 2. 写入方法 (Writing)
    // ==========================================

    /**
     * 🟢 [修改] 写入方法：支持动态内容对象
     * @param {string} channelId 
     * @param {string} playerName 
     * @param {string} userText 
     * @param {Object} replyContent - 动态对象，例如 { "system": "...", "莉莉丝": "..." }
     * @param {number|string} timeCount 
     */
    addRecentChat(channelId, playerName, userText, replyContent, timeCount) {
        const channel = this._getChannel(channelId);
        
        const entry = {
            timestamp: Date.now(),
            user: playerName,
            userText: userText || "",
            reply: {
                time_count: timeCount,
                // 直接存储整个动态对象
                content: replyContent || {} 
            }
        };

        channel.history.recent_chat.push(entry);
    },

    /**
     * 🟢 [新增] 从配置导入开场剧情到记忆库
     * @param {string} openingId - 剧本 ID
     */
    importOpening(openingId) {
        const config = getOpeningConfig(openingId);
        if (!config) return;

        const channel = this._getChannel('main');

        // 构造记忆条目
        const entry = {
            timestamp: Date.now(),
            user: null,
            userText: null,
            reply: {
                time_count: "序章",
                content: config.scripts // 注入配置脚本
            }
        };

        // 确保开场剧情在最前面（如果已有数据则清空重置，或者 push 进去，视需求而定）
        // 这里采用重置策略，保证“新游戏”是干净的
        channel.history.recent_chat = [entry];

        // 同时初始化 grand_summary
        this.addGrandSummary('main', config.description || "冒险开始了。");

        console.log(`[Chat_Memory] 🧠 已记忆开场剧本: ${config.title}`);
    },

    /**
     * 🟢 [新增] 导入动态生成的开局数据 (For CustomOpeningOverlay)
     * 供 useNavigation.js 的 startGame 调用
     * @param {Object} dynamicData - 包含 openingData(scripts), meta(description)
     */
    importDynamicData(dynamicData) {
        if (!dynamicData || !dynamicData.openingData) return;

        const channel = this._getChannel('main');
        
        // 1. 获取动态生成的脚本与描述
        const scripts = dynamicData.openingData.scripts || [];
        const description = dynamicData.meta?.description || "一段未知的旅程开始了。";
        const title = dynamicData.meta?.title || "自定义世界";

        // 2. 构造记忆条目
        // 这里的结构必须与 ChatData.js 解析的结构一致
        const entry = {
            timestamp: Date.now(),
            user: null,
            userText: null,
            reply: {
                time_count: "序章",
                content: scripts // 直接注入 LLM 生成的剧本数组
            }
        };

        // 3. 重置近期对话 (保证新游戏是干净的)
        channel.history.recent_chat = [entry];

        // 4. 同时初始化宏观综述 (Grand Summary)
        // 使用 LLM 生成的世界观/剧情描述作为第一条长期记忆
        this.addGrandSummary('main', `[${title}] ${description}`);

        console.log(`[Chat_Memory] 🧠 已记忆动态开局: ${title}`);
    },

    addSummary(channelId, summaryContent, timeCount) {
        const channel = this._getChannel(channelId);
        channel.history.summary.push({
            time_count: timeCount,
            content: summaryContent
        });
    },

    /**
     * 🟢 [修改] 新增宏观综述 (追加模式，兼容旧存档)
     */
    addGrandSummary(channelId, grandContent) {
        const channel = this._getChannel(channelId);
        
        // 兼容性检查：如果存在 grand_summary 且不是数组（旧版对象结构）
        if (channel.history.grand_summary && !Array.isArray(channel.history.grand_summary)) {
            const oldData = channel.history.grand_summary;
            // 重置为数组
            channel.history.grand_summary = [];
            // 如果旧数据里有实质内容，将其作为第一条历史放入数组
            if (oldData.content) {
                channel.history.grand_summary.push({
                    content: oldData.content,
                    timestamp: oldData.last_updated || Date.now()
                });
            }
        }

        // 确保它是数组（防止初始化异常）
        if (!Array.isArray(channel.history.grand_summary)) {
            channel.history.grand_summary = [];
        }

        // 追加新的综述
        channel.history.grand_summary.push({
            content: grandContent,
            timestamp: Date.now()
        });
    },

    /**
     * 🟢 [新增] 向最新互动追加系统环境描述
     * 场景：玩家移动时，将"你们来到了..."追加到当前对话流末尾
     */
    appendSystemLog(channelId, text) {
        // 1. 获取或初始化频道 (默认主线)
        const channel = this._getChannel(channelId || 'main');
        const h = channel.history;

        // 2. 如果没有任何记录，新建一条
        if (h.recent_chat.length === 0) {
            this.addRecentChat(channelId, null, null, [{ role: 'system', text: text }], "Auto");
            return;
        }

        // 3. 获取最后一条记录
        const lastEntry = h.recent_chat[h.recent_chat.length - 1];

        // 4. 确保 reply.content 是数组结构 (数据清洗/迁移)
        if (!lastEntry.reply) lastEntry.reply = { content: [] };
        
        let content = lastEntry.reply.content;
        
        // 如果是旧版对象结构，尝试转换为数组，或者直接覆盖
        if (!Array.isArray(content)) {
            // 如果 content 存在且是对象，保留旧数据转为数组
            if (content && typeof content === 'object') {
                const newArr = [];
                for (const [k, v] of Object.entries(content)) {
                    newArr.push({ role: k, text: v });
                }
                lastEntry.reply.content = newArr;
            } else {
                // 否则重置为空数组
                lastEntry.reply.content = [];
            }
        }

        // 5. 追加 System 节点
        lastEntry.reply.content.push({
            role: 'system',
            text: text
        });

        console.log(`[Chat_Memory] 追加系统记忆: "${text}"`);
    },

    // ==========================================
    // 3. 读取方法 (Reading / Context Building)
    // ==========================================

    /**
     * 🟢 [修改] 上下文构建：动态遍历键值对
     */
    getFormattedContext(channelId) {
        const channel = this.channels[channelId];
        if (!channel) return "";

        const h = channel.history;
        let contextParts = [];

        // 1. 宏观综述 (兼容数组和旧版对象)
        let grandStr = "";
        
        if (Array.isArray(h.grand_summary)) {
            // 新版：数组结构 -> 拼接所有历史篇章
            // 这里可以加一个长度限制，比如只取最近的 10 条，防止无限膨胀
            if (h.grand_summary.length > 0) {
                grandStr = h.grand_summary.map(g => `- ${g.content}`).join("\n");
            }
        } else if (h.grand_summary && h.grand_summary.content) {
            // 旧版：对象结构 (回退支持)
            grandStr = h.grand_summary.content;
        }

        if (grandStr) {
            contextParts.push(`[过往篇章记录]\n${grandStr}`);
        }

        // 2. 阶段回顾 (不变)
        if (h.summary.length > 0) {
            const recentSummaries = h.summary.slice(-5); 
            const summaryText = recentSummaries.map(s => `- ${s.content}`).join("\n");
            contextParts.push(`[前情提要]\n${summaryText}`);
        }

        // 3. 近期对话 (核心修改：遍历 content 的所有 Key)
        if (h.recent_chat.length > 0) {
            const chatText = h.recent_chat.map(entry => {
                let text = "";
                
                // A. 玩家发言
                if (entry.user && entry.userText) {
                    text += `\n${entry.user}: ${entry.userText}`; 
                }
                
                // B. AI/系统回复 (动态遍历)
                if (entry.reply && entry.reply.content) {
                    const content = entry.reply.content;

                    // 🟢 新增：支持数组结构 (线性剧本模式)
                    if (Array.isArray(content)) {
                        content.forEach(item => {
                            // 兼容 item.role 或 item.name
                            const role = item.role || item.name;
                            const val = item.text || item.value;

                            if (role === 'system') {
                                text += `\n(System: ${val})`;
                            } else {
                                text += `\n${role}: ${val}`;
                            }
                        });
                    }
                    // 🟡 兼容：旧版对象结构 (Object.entries)
                    else {
                        for (const [key, value] of Object.entries(content)) {
                            if (key === 'system') {
                                text += `\n(System: ${value})`;
                            } else {
                                text += `\n${key}: ${value}`;
                            }
                        }
                    }
                }
                
                return text;
            }).join("\n");
            
            contextParts.push(`[近期发生] ${chatText}`);
        }

        return contextParts.join("\n\n");
    },


    /**
     * 🟢 [新增] 仅获取近期对话记录 (纯文本，无标记头)
     * 专供 <Summary> 任务使用
     */
    getRecentChatOnly(channelId) {
        const channel = this.channels[channelId];
        if (!channel) return "";
        
        const h = channel.history;
        if (!h.recent_chat || h.recent_chat.length === 0) return "暂无近期对话";

        return h.recent_chat.map(entry => {
            let parts = [];
            
            // A. 玩家发言
            if (entry.user && entry.userText) {
                parts.push(`${entry.user}: ${entry.userText}`); 
            }
            
            // B. AI/系统回复
            if (entry.reply && entry.reply.content) {
                const content = entry.reply.content;

                // 数组模式
                if (Array.isArray(content)) {
                    content.forEach(item => {
                        const role = item.role || item.name || 'Unknown';
                        const val = item.text || item.value;
                        
                        if (role === 'system') {
                            parts.push(`(System: ${val})`);
                        } else {
                            parts.push(`${role}: ${val}`);
                        }
                    });
                }
                // 对象模式 (兼容)
                else {
                    for (const [key, value] of Object.entries(content)) {
                        if (key === 'system') {
                            parts.push(`(System: ${value})`);
                        } else {
                            parts.push(`${key}: ${value}`);
                        }
                    }
                }
            }
            return parts.join("\n");
        }).join("\n\n"); // 条目之间空一行，区分更明显
    },

    /**
     * 🟢 [新增] 仅获取阶段总结历史 (纯文本列表)
     * 专供 <Grand_Summary> 任务使用
     */
    getSummaryHistoryOnly(channelId) {
        const channel = this.channels[channelId];
        if (!channel) return "";
        
        const h = channel.history;
        if (!h.summary || h.summary.length === 0) return "暂无前情提要";

        // 返回格式化列表:
        // - 总结内容1
        // - 总结内容2
        return h.summary.map(s => `- ${s.content}`).join("\n");
    },

    getChannelData(channelId) {
        return this.channels[channelId];
    },

    serialize() { return this.channels; },
    deserialize(data) { this.channels = data || {}; }
    

};


window.Chat_Memory = Chat_Memory;