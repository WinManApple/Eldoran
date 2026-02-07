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

// src/ui/modules/ChatData.js
import { reactive } from '../../../lib/vue.esm-browser.js';
import { store, addLog } from './store.js';
import { getOpeningConfig } from '../../config/Opening.js';

// [新增] 全局配置：每次加载互动的数量
export const HISTORY_BATCH_SIZE = 10;

/**
 * 对话数据库 (Chat Database) - v2.1 修复版
 */
export const ChatData = reactive({
    
    // ==========================================
    // 1. 数据存储 (Schema)
    // ==========================================
    channels: {
        'main': {
            id: 'main',
            name: '主线通讯',
            type: 'MAIN',
            icon: '◈',
            messages: [],
            lastActive: Date.now(),
            unread: 0
        }
    },

    activeChannelId: 'main',

    // 当前历史消息加载深度 (默认为常量值)
    currentHistoryDepth: HISTORY_BATCH_SIZE,

    // 视图控制状态
    visibleBubbleCount: 0,
    _resolveChatEnd: null,

    // ==========================================
    // 2. 核心操作 (Actions)
    // ==========================================


    // Getter: 暴露当前是否处于“脚本挂起等待点击”的状态
    get isWaiting() {
        return !!this._resolveChatEnd;
    },

    /**
     * 🟢 [新增] 加载指定 ID 的开场剧情到 UI
     */
    loadOpening(openingId) {
        const config = getOpeningConfig(openingId);
        if (!config) return;

        const channel = this.channels['main'];
        channel.messages = [];

        channel.messages.push({
            timestamp: Date.now(),
            user: null,
            userText: null,
            reply: { content: config.scripts }
        });

        this._updateChannelStatus(channel, 'main');
        
        // 🟢 [核心修正] 同样重置为 0
        this.visibleBubbleCount = 0; 
        console.log(`[ChatData] 已加载静态剧本: ${config.title}`);
    },

    /**
     * 🟢 [新增] 直接加载动态剧本数组 (用于 LLM 生成的开局)
     * @param {Array} scripts - 剧本对象数组
     */
    loadScripts(scripts) {
        if (!Array.isArray(scripts) || scripts.length === 0) {
            console.warn("[ChatData] 尝试加载空剧本");
            return;
        }

        const channel = this.channels['main'];
        channel.messages = []; // 清空

        // 注入完整剧本
        channel.messages.push({
            timestamp: Date.now(),
            user: null,
            userText: null,
            reply: { content: scripts }
        });

        this._updateChannelStatus(channel, 'main');
        
        // 🟢 [核心修正] 强制重置游标为 0 (什么都不显示) 或 1 (显示第一句)
        // 建议设为 0，配合 DialogueOverlay 的点击逻辑让玩家点第一下
        this.visibleBubbleCount = 0; 
        
        // 标记状态，防止后续逻辑意外将其撑开
        console.log(`[ChatData] 动态剧本已装载，长度: ${scripts.length}, 初始游标: ${this.visibleBubbleCount}`);
    },

    pushUserMessage(text, targetChannelId = null) {
        const id = targetChannelId || this.activeChannelId;
        const channel = this.channels[id];
        if (!channel) return;

        const interaction = {
            timestamp: Date.now(),
            user: store.playerStats ? store.playerStats.name : "User",
            userText: text,
            reply: null 
        };

        channel.messages.push(interaction);
        this._updateChannelStatus(channel, id);

        // 自动增加可见计数
        this.visibleBubbleCount++;
    },

    /**
     * 🟢 [修改] 填充 AI 回复
     * @param {Object|Array} contentObj - 回复内容
     * @param {string} targetChannelId - 目标频道 (null 为当前)
     * @param {boolean|string} autoReveal - 揭示策略: 
     * true (全部展开), 
     * false (全部隐藏), 
     * 'start' (仅展开第一句 - 推荐用于互动)
     */
    fillAiReply(contentObj, targetChannelId = null, autoReveal = false) {
        const id = targetChannelId || this.activeChannelId;
        const channel = this.channels[id];
        if (!channel) return;

        // =================================================
        // 🛡️ 第一道防线：现实校准 (Reality Check)
        // =================================================
        const isCurrentChannel = (id === this.activeChannelId);
        let currentRealLength = 0;

        if (isCurrentChannel) {
            currentRealLength = this._getFlatList().length;
            
            // [方案B治本] 静默同步：如果计数器 > 实际长度，说明发生了切片(Slice)。
            // 这不是错误，而是正常的滑动窗口表现。直接静默拉平即可，无需警告。
            if (this.visibleBubbleCount > currentRealLength) {
                this.visibleBubbleCount = currentRealLength;
            }
        }

        // =================================================
        // 📝 数据注入 (保持不变)
        // =================================================
        const msgs = channel.messages;
        const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        const isEmpty = (c) => !c || (Array.isArray(c) ? c.length === 0 : Object.keys(c).length === 0);

        if (lastMsg && lastMsg.user && (!lastMsg.reply || !lastMsg.reply.content || isEmpty(lastMsg.reply.content))) {
            lastMsg.reply = { content: contentObj || [] };
        } else {
            channel.messages.push({
                timestamp: Date.now(),
                user: null,
                userText: null,
                reply: { content: contentObj || [] }
            });
        }
        
        this._updateChannelStatus(channel, id);

        // =================================================
        // 👁️ 可见性控制 (基于校准后的基准)
        // =================================================
        if (isCurrentChannel) {
            // 重新计算注入后的长度
            const newFlatLen = this._getFlatList().length;
            const addedCount = newFlatLen - currentRealLength; // 现在的基准是 reliable 的

            if (addedCount > 0) {
                if (autoReveal === true) {
                    // 策略 A: 全部展开
                    this.visibleBubbleCount = newFlatLen;
                } 
                else if (autoReveal === 'start') {
                    // 策略 B: 仅展开首句
                    // 🟢 关键：基于"校准后"的 currentRealLength + 1
                    // 无论之前发生了什么，用户现在只看到 [旧内容] + [1条新内容]
                    this.visibleBubbleCount = currentRealLength + 1;
                } 
                // 策略 C: 不展开 (保持 currentRealLength 不变)
            }
        }
    },

    /**
     *  加载更多历史消息
     * 返回 boolean 表示是否成功加载了数据
     */
    loadMoreHistory() {
        const channel = this.channels[this.activeChannelId];
        if (!channel || !channel.messages) return false;

        // 如果当前显示的少于总数，说明还有历史可挖
        if (this.currentHistoryDepth < channel.messages.length) {
            
            // 1. 记录加载前的气泡总数 (用于修正打字机游标)
            const oldFlatLength = this._getFlatList().length;
            
            // 2. 增加深度
            this.currentHistoryDepth += HISTORY_BATCH_SIZE;
            
            // 3. 计算加载后的气泡总数
            const newFlatLength = this._getFlatList().length;
            
            // 4. 关键修正：保持"可视窗口"的相对位置
            // 因为我们在头部插入了旧消息，为了不让正在阅读/生成的底部消息被顶走或隐藏，
            // 需要把 visibleBubbleCount 加上新增的气泡数量。
            this.visibleBubbleCount += (newFlatLength - oldFlatLength);
            
            return true;
        }
        return false;
    },

    /**
     * 🟢 [重构] 向指定频道追加系统旁白
     * 策略升级：优先追加到最新一条消息的 reply 数组中；如果最新消息不存在或不合适，则新建一条。
     * 效果：确保 System 消息在 UI 上以现代化结构渲染。
     * @param {string} text - 系统提示文本
     * @param {string} targetChannelId - 目标频道 ID (null 为当前)
     */
    appendSystemLog(text, targetChannelId = null) {
        const id = targetChannelId || this.activeChannelId;
        const channel = this.channels[id];
        
        // 1. 频道不存在则忽略
        if (!channel) return;

        // 2. 尝试获取最后一条消息
        const msgs = channel.messages;
        const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

        let appended = false;

        // 3. 尝试追加逻辑 (类似于 appendSystemToLatest)
        if (lastMsg) {
            // 初始化 reply 容器
            if (!lastMsg.reply) lastMsg.reply = { content: [] };
            
            // 确保是数组结构 (现代化)
            if (Array.isArray(lastMsg.reply.content)) {
                lastMsg.reply.content.push({
                    role: 'system',
                    text: text
                });
                appended = true;
            }
            // 如果是旧对象结构，不做破坏性追加，转而新建一条
        }

        // 4. 如果没能追加 (是空频道 或 旧结构)，则新建一条独立消息
        if (!appended) {
            channel.messages.push({
                timestamp: Date.now(),
                user: null, 
                userText: null,
                reply: {
                    content: [ // 🟢 使用数组结构新建
                        { role: 'system', text: text }
                    ]
                }
            });
        }

        // 5. 更新状态与红点
        this._updateChannelStatus(channel, id);

        // 6. 如果是当前频道，刷新可见性
        if (id === this.activeChannelId) {
            // 重新计算长度，确保新加的系统消息可见
            this.visibleBubbleCount = this._getFlatList().length;
        }
    },

    /**
     * 向最新互动追加系统环境描述
     * 场景：移动到新节点时，将 "你们来到了..." 追加到当前气泡流末尾，而不是新开一个互动
     * @param {string} text - 系统提示文本
     */
    appendSystemToLatest(text) {
        const channel = this.channels[this.activeChannelId];
        
        // 1. 边界检查：如果没有消息，回退到新建独立消息
        if (!channel || !channel.messages || channel.messages.length === 0) {
            this.appendSystemLog(text);
            return;
        }

        const lastMsg = channel.messages[channel.messages.length - 1];

        // 2. 初始化 reply 容器 (如果是 User 刚发完言还没 reply 的情况)
        if (!lastMsg.reply) {
            lastMsg.reply = { content: [] };
        }

        // 3. 类型兼容处理
        // 如果是旧存档的 Object 结构 (非数组)，为了数据安全，回退到新建一条系统消息
        if (lastMsg.reply.content && !Array.isArray(lastMsg.reply.content)) {
            this.appendSystemLog(text);
            return;
        }
        
        // 4. 确保是数组
        if (!lastMsg.reply.content) {
            lastMsg.reply.content = [];
        }

        // 5. 追加 System 节点 (符合线性剧本结构)
        lastMsg.reply.content.push({
            role: 'system',
            text: text
        });

        this._updateChannelStatus(channel, this.activeChannelId);

        // 6. 即时显示
        this.visibleBubbleCount = this._getFlatList().length;
    },

    // nextBubble: 分离“显示气泡”与“触发放行”的逻辑
    nextBubble() {
        const fullList = this._getFlatList();
        
        // 情况 A: 还有隐藏的气泡 -> 显示下一个
        if (this.visibleBubbleCount < fullList.length) {
            this.visibleBubbleCount++;
            
            // 注意：这里删除了原有的 _checkWaiters() 调用
            // 即使显示了最后一个气泡，也不自动放行，必须等玩家再点一次
            return true;
        } 
        // 情况 B: 气泡已全部显示 -> 玩家再次点击 -> 解除脚本挂起
        else {
            this._checkWaiters();
            return false;
        }
    },
    
    /**
     * 🟢 [新增] 获取最近的上下文用于 LLM 背景 (纯数据，无 UI 状态)
     * @param {number} limit - 需要获取的条数 (从最新往回数)
     * @returns {Array} - [{ role: "...", text: "..." }, ...]
     */
    getRecentContext(limit = 5) {
        const channel = this.channels[this.activeChannelId];
        if (!channel || !channel.messages) return [];

        const contextList = [];
        // 从尾部截取原始消息对象
        const rawMessages = channel.messages.slice(-limit);

        rawMessages.forEach(msg => {
            // 1. 处理玩家发言
            if (msg.user && msg.userText) {
                contextList.push({ role: 'user', text: msg.userText });
            }

            // 2. 处理 AI/系统 回复
            if (msg.reply && msg.reply.content) {
                const content = msg.reply.content;

                // 数组模式 (标准)
                if (Array.isArray(content)) {
                    content.forEach(item => {
                        // 提取 role: 优先取 name (如"莉莉丝")，其次取 role (如"ai")
                        // 注意：对于 System 消息，通常保留 'system' 以便区分
                        const r = item.name || item.role || 'unknown';
                        const t = item.text || item.value || '';
                        contextList.push({ role: r, text: t });
                    });
                }
                // 对象模式 (兼容旧存档)
                else if (typeof content === 'object') {
                    for (const [key, val] of Object.entries(content)) {
                        contextList.push({ role: key, text: val });
                    }
                }
            }
        });

        // 再次截取，因为一条 msg 可能拆出多条 context (比如 1个User + 3个AI回复)
        // 我们只返回最后 limit 条扁平化后的记录，避免上下文过长
        return contextList.slice(-limit);
    },

    //  waitForAllMessages: 强制进入等待模式
    async waitForAllMessages() {
        // 删除旧逻辑：if (this.visibleBubbleCount >= fullList.length) return Promise.resolve();
        // 现在的逻辑：无论消息是否已显示完，必须等待玩家确认一次
        
        return new Promise(resolve => {
            this._resolveChatEnd = resolve;
            console.log("[ChatData] 脚本挂起，等待玩家阅读完毕并点击...");
        });
    },

    registerChannel(id, name, type = 'QUEST') {
        if (!this.channels[id]) {
            this.channels[id] = {
                id, name, type,
                icon: type === 'MAIN' ? '◈' : '✧',
                messages: [],
                lastActive: Date.now(),
                unread: 1
            };
            this.fillAiReply({ "system": `已接入频段：${name}` }, id, true);
        }
    },

    switchChannel(channelId) {
        // 🟢 [新增] 安全锁：如果 AI 正在生成，禁止切换频道，防止记忆错乱
        if (store.aiStatus.isThinking) {
            console.warn("[ChatData] AI 生成中，禁止切换频道");
            addLog("⏳ 命运正在编织，请稍候...");
            return;
        }
        if (this.channels[channelId]) {
            this.activeChannelId = channelId;
            // 切换频道时重置历史深度
            this.currentHistoryDepth = HISTORY_BATCH_SIZE;
            this.channels[channelId].unread = 0;
            this.channels[channelId].lastActive = Date.now();
            
            // 切换到历史频道时，默认显示所有历史消息
            // 只有在【非开场剧情】状态下，才自动展开所有消息。
            // 如果是开场剧情 (isOpeningSequence 为 true)，则保持原有的游标位置 (由 loadScripts 设定的 0)
            if (!store.isOpeningSequence) {
                this.visibleBubbleCount = this._getFlatList().length; 
            } else {
                console.log(`[ChatData] 处于剧情锁模式，保持游标位置: ${this.visibleBubbleCount}`);
            }
        }
    },

    /**
     * 🟢 [新增] 删除指定频道
     * 配合 SubMapService.pruneSubMap 使用，确保数据彻底清理
     */
    deleteChannel(channelId) {
        // 1. 存在性检查
        if (!this.channels[channelId]) return;

        // 2. 安全检查：如果玩家正盯着这个频道，先强制切回主线
        // 否则 UI 会因为读取被删除的数据而报错
        if (this.activeChannelId === channelId) {
            console.warn(`[ChatData] ⚠️ 检测到当前活跃频道 [${channelId}] 即将销毁，强制切回主线`);
            this.switchChannel('main');
        }

        // 3. 物理删除
        delete this.channels[channelId];
        console.log(`[ChatData] 🗑️ 频道数据已销毁: ${channelId}`);
    },

    // ==========================================
    // 3. 内部辅助函数 (Internal Helpers)
    // ==========================================

    /**
     * 🟢 [新增] 修复报错：更新频道状态
     */
    _updateChannelStatus(channel, id) {
        channel.lastActive = Date.now();
        // 如果不是当前频道，则增加未读数
        if (id !== this.activeChannelId) {
            channel.unread = (channel.unread || 0) + 1;
        }
    },

    _checkWaiters() {
        if (this._resolveChatEnd) {
            console.log("[ChatData] 剧情阅读完毕，脚本恢复");
            this._resolveChatEnd();
            this._resolveChatEnd = null;
        }
    },

    // ==========================================
    // 4. 数据获取 (Getters)
    // ==========================================

    /**
     * 获取可见范围内的消息 (结合了扁平化和切片)
     */
    get currentMessages() {
        const flatList = this._getFlatList();
        // 核心切片逻辑
        return flatList.slice(0, this.visibleBubbleCount);
    },

    /**
     * 获取完整的扁平化消息列表
     */
    _getFlatList() {
        const channel = this.channels[this.activeChannelId];
        if (!channel || !channel.messages) return [];

        const flatList = [];

        // [修改] 仅获取最近的 N 次互动 (Slice)
        // 使用 slice(-depth) 从尾部截取；如果 depth 超过长度，slice 会返回整个数组，很安全
        const visibleInteractions = channel.messages.slice(-this.currentHistoryDepth);

        visibleInteractions.forEach(interaction => {
            const ts = interaction.timestamp;
            // User Msg
            if (interaction.user && interaction.userText) {
                flatList.push({ role: 'user', name: interaction.user, text: interaction.userText, timestamp: ts });
            }
            // AI/System Msg (拆解 key-value)
            if (interaction.reply && interaction.reply.content) {
                const content = interaction.reply.content;

                // 🟢 新增：支持数组结构 (线性剧本模式，支持重复角色与严格顺序)
                // 预期数据结构: [ { role: "莉莉丝", text: "..." }, { role: "system", text: "..." } ]
                if (Array.isArray(content)) {
                    content.forEach(item => {
                        const roleKey = item.role || item.name;
                        const textVal = item.text || item.value;

                        if (roleKey === 'system') {
                            flatList.push({ role: 'system', text: textVal, timestamp: ts });
                        } 
                        // 🟢 新增：如果角色标签是 'user'，将其归类为玩家发言
                        else if (roleKey === 'user') {
                            flatList.push({ 
                                role: 'user', // 这里的 role 设为 'user'，DialogueOverlay 就会将其右对齐
                                name: store.playerStats ? store.playerStats.name : 'You', // 可选：带上玩家真名
                                text: textVal, 
                                timestamp: ts 
                            });
                        }
                        else {
                            // 其他情况才归为 NPC (AI)
                            flatList.push({ role: 'ai', name: roleKey, text: textVal, timestamp: ts });
                        }
                    });
                }
                // 🟡 兼容：旧版对象结构 (无序 Key-Value 模式)
                else {
                    for (const [key, value] of Object.entries(content)) {
                        if (key === 'system') flatList.push({ role: 'system', text: value, timestamp: ts });
                        else flatList.push({ role: 'ai', name: key, text: value, timestamp: ts });
                    }
                }
            }
        });
        return flatList;
    },

    get currentChannelInfo() {
        return this.channels[this.activeChannelId];
    },

    get sortedChannelList() {
        return Object.values(this.channels).sort((a, b) => {
            if (a.id === 'main') return -1;
            if (b.id === 'main') return 1;
            return b.lastActive - a.lastActive;
        });
    }
});



window.ChatData = ChatData;
store.chatData = ChatData;
