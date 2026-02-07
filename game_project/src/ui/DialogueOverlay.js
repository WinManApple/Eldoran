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

// src/ui/DialogueOverlay.js
import { addLog, store } from './modules/store.js';
import { ChatData } from './modules/ChatData.js'; 
import { computed, ref, nextTick, onMounted, onUnmounted, watch } from '../../lib/vue.esm-browser.js';
import { useChat } from './modules/useChat.js';
import { Game_Manager } from '../LLM/Game_Manager.js';

export default {
    name: 'DialogueOverlay',
    emits: ['close'],
    
    // 🟢 模板重构：
    // 1. 类名全面替换为 void- 前缀，适配新的虚空奇幻 CSS
    // 2. 添加 @click.stop 防止点击穿透到地图
    // 3. 文本和图标样式更新
    template: `
    <div class="dialogue-backdrop" @click.self="close">
        <div class="void-chat-window" @click.stop>
            
            <div class="void-sidebar">
                <div class="sidebar-header">
                    <span class="rune-text">SOUL_LINK</span>
                    <div class="soul-gem"></div>
                </div>
                
                <div class="channel-list">
                    <div v-for="channel in sortedChannels" 
                         :key="channel.id"
                         class="channel-item"
                         :class="{ active: channel.id === activeChannelId }"
                         @click="switchChannel(channel.id)">
                        
                        <div class="channel-icon">{{ channel.icon }}</div>
                        <div class="channel-info">
                            <div class="channel-name">{{ channel.name }}</div>
                            <div class="channel-status">{{ channel.type }}</div>
                        </div>
                        <div v-if="channel.unread > 0" class="unread-badge">{{ channel.unread }}</div>
                    </div>
                </div>
            </div>

            <div class="chat-main">
                <div class="chat-header">
                    <div class="current-channel-title">
                        <span class="void-icon">✦</span> {{ currentChannelInfo?.name }}
                    </div>

                    <div class="header-info">
                        <div class="info-item">
                            <span class="void-icon small">📍</span> 
                            {{ currentLocation }}
                        </div>
                        <div class="info-divider"></div>
                        <div class="info-item">
                            <span class="void-icon small">⏳</span> 
                            {{ currentTime }}
                        </div>
                    </div>

                    <button class="void-close-btn" @click="close" v-if="!isOpeningSequence">×</button>
                </div>

                <div class="message-container" 
                    ref="msgContainer" 
                    @click="advanceDialogue"
                    :class="{ 'interactive': hasHiddenMessages || isWaiting }">
                    
                    <div v-if="hasMoreHistory" class="history-loader" @click.stop="loadHistory">
                        <span class="void-icon">↺</span> 浏览从前消息
                    </div>

                    <div v-for="(msg, index) in currentMessages" 
                         :key="index" 
                         class="msg-row" 
                        :class="msg.role === 'user' ? 'player' : msg.role">
                        
                        <div class="msg-avatar" v-if="msg.role !== 'system'">
                            {{ msg.role === 'user' ? 'YOU' : (msg.name || 'AI') }}
                        </div>

                        <div class="msg-bubble">
                            <div v-if="msg.role === 'ai' && msg.name" class="name-tag">{{ msg.name }}</div>
                            <div class="msg-text">{{ msg.text }}</div>
                            <div v-if="msg.role !== 'system'" class="msg-time">
                                {{ formatTime(msg.timestamp) }}
                            </div>
                        </div>
                    </div>

                    <div v-if="isThinking" class="msg-row ai loading">
                        <div class="msg-avatar">AI</div>
                        <div class="msg-bubble thinking-bubble">
                            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
                            <span class="thinking-text">COMMUNING...</span>
                        </div>
                    </div>

                    <div v-if="hasHiddenMessages || isWaiting" class="continue-indicator">
                        <span class="blink-arrow">▼</span> 点击推进剧情
                    </div>
                </div>

                <div class="input-area">
                    
                    <div v-if="isOpeningSequence && !hasHiddenMessages" class="adventure-start-container" style="width: 100%; text-align: center;">
                        <button class="void-btn" @click="startAdventure" style="width: 80%; background: #800000; border-color: #a00000; color: #fff; padding: 12px; font-size: 1.1em;">
                            ⚔️ 踏上旅途 (Start Adventure)
                        </button>
                    </div>

                    <div v-else class="input-wrapper-container" style="width: 100%; display: flex; flex-direction: column;">
                        
                        <div class="control-bar" v-if="isThinking">
                            <button class="void-btn danger small" @click="cancelGeneration">
                                ■ 中断共鸣
                            </button>
                        </div>

                        <div class="input-wrapper">
                            <textarea 
                                v-model="inputText" 
                                placeholder="回应低语... (Enter 发送, Shift+Enter 换行)" 
                                @keydown="handleKeydown"
                                :disabled="isThinking"
                            ></textarea>
                            
                            <button class="send-btn" @click="send" :disabled="isThinking || !inputText.trim()">
                                <span class="send-icon">➤</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `,
    
    setup(props, { emit }) {
        const inputText = ref("");
        const msgContainer = ref(null);

        const { handleUserChat } = useChat();
        
        // [新增] 从 Store 获取剧情锁状态
        const isOpeningSequence = computed(() => store.isOpeningSequence);

        // [新增] 开始冒险 (解锁逻辑)
        const startAdventure = () => {
            addLog("⚔️ 剧情结束，解除锁定");
            store.isOpeningSequence = false; // 解锁
            store.isDialogueActive = false;  // 关闭窗口
            
            // 可选：在这里触发一些新手引导或保存
        };

        // 数据绑定
        const sortedChannels = computed(() => ChatData.sortedChannelList);
        const activeChannelId = computed(() => ChatData.activeChannelId);
        const currentMessages = computed(() => ChatData.currentMessages);
        const currentChannelInfo = computed(() => ChatData.currentChannelInfo);
        const isThinking = computed(() => store.aiStatus.isThinking);
        const isWaiting = computed(() => ChatData.isWaiting);

        // [新增] 计算属性：是否还有更多历史记录可加载
        const hasMoreHistory = computed(() => {
            const channel = ChatData.currentChannelInfo;
            // 如果 currentHistoryDepth 小于当前频道消息总长度，说明还有旧消息
            if (!channel || !channel.messages) return false;
            return ChatData.currentHistoryDepth < channel.messages.length;
        });

        // [新增] 方法：加载历史并修正滚动条
        const loadHistory = async () => {
            if (!msgContainer.value) return;

            // 1. 记录当前的滚动位置和内容高度 (Scroll Restoration 关键步骤)
            const oldScrollHeight = msgContainer.value.scrollHeight;
            const oldScrollTop = msgContainer.value.scrollTop;

            // 2. 调用数据层加载更多 (增加 depth)
            const success = ChatData.loadMoreHistory();

            if (success) {
                // 3. 等待 Vue 完成 DOM 更新 (旧消息插入到顶部)
                await nextTick();

                // 4. 计算新高度，并将滚动条向下推，保持视口停留在"原来的第一条消息"上
                const newScrollHeight = msgContainer.value.scrollHeight;
                const heightDifference = newScrollHeight - oldScrollHeight;
                
                // 修正位置
                msgContainer.value.scrollTop = oldScrollTop + heightDifference;
            }
        };

        // 计算是否有隐藏消息（用于控制点击推进）
        const hasHiddenMessages = computed(() => {
            // 安全访问内部方法，防止 ChatData 未完全初始化报错
            const fullList = (ChatData._getFlatList && typeof ChatData._getFlatList === 'function') 
                ? ChatData._getFlatList() 
                : [];
            return ChatData.visibleBubbleCount < fullList.length;
        });

        // 滚动逻辑
        const scrollToBottom = async () => {
            await nextTick();
            if (msgContainer.value) {
                msgContainer.value.scrollTop = msgContainer.value.scrollHeight;
            }
        };

        // 监听当前可见消息变化，自动滚动
        watch(currentMessages, () => scrollToBottom(), { deep: true });
        
        onMounted(() => {
            // 🛑 打开对话框时，禁用 Phaser 游戏层的输入，防止点穿到地图
            if (window.game && window.game.input) {
                window.game.input.enabled = false;
            }
            scrollToBottom();
        });

        // ✅ 关闭对话框时，恢复 Phaser 游戏层的输入
        onUnmounted(() => {
            if (window.game && window.game.input) {
                window.game.input.enabled = true;
            }
        });

        // 剧情推进逻辑 (点击空白处)
        const advanceDialogue = () => {
            // 只有当有隐藏消息，或者处于脚本等待状态时，点击才有效
            if (hasHiddenMessages.value || isWaiting.value) {
                const didAdvance = ChatData.nextBubble();
                if (didAdvance) {
                    scrollToBottom();
                }
            }
        };

        const switchChannel = (id) => {
            ChatData.switchChannel(id);
        };

        const close = () => {
            emit('close');
        };

        // 🟢 [关键修改] send 方法
        const send = () => {
            let text = inputText.value.trim();
            if (!text) return;

            // 1. 检测是否为 JSON 格式 (以 { 开头)
            // 如果是 JSON 指令，直接跳过标点替换，防止破坏 key 及其引号
            if (!text.startsWith('{')) {
                
                // 🟢 智能替换逻辑 (Smart Quotes) - 仅针对普通文本
                
                // A. 处理双引号 " -> “”
                // [优化] 从匹配前缀中移除了 {，防止误伤普通文本中的代码片段
                text = text.replace(/(^|[\s\(\[<（【《])"/g, '$1“');
                // 剩下的所有 " 必定是右引号
                text = text.replace(/"/g, '”');

                // B. 处理单引号 ' -> ‘’
                text = text.replace(/(^|[\s\(\[<（【《])'/g, '$1‘');
                text = text.replace(/'/g, '’');
            }

            inputText.value = "";
            handleUserChat(text);
        };

        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) return;
                e.preventDefault();
                send();
            }
        };

        const cancelGeneration = () => {
            // [修改] 1. 委托给 Manager 进行深度中断 (清除定时器、重置内部锁)
            // 注意：请确保 Game_Manager 中实现了 cancelRequest 方法，
            // 或者暂时使用: Game_Manager.isGenerating = false; store.aiStatus.isThinking = false;
            if (Game_Manager.cancelRequest) {
                Game_Manager.cancelRequest(); 
            } else {
                // 降级处理：如果 Manager 还没实现 cancelRequest，至少手动重置状态
                console.warn("Game_Manager.cancelRequest 未实现，执行强制重置");
                store.aiStatus.isThinking = false;
                store.aiResult = 'error';
                // 尝试清理定时器 (如果能访问到的话，否则只能由下一次请求覆盖)
                if (Game_Manager._logInterval) clearInterval(Game_Manager._logInterval);
            }

            // [修改] 2. 使用 fillAiReply 构建更美观的系统提示
            // 这种方式能让提示像正常对话一样显示，而不是单纯的日志
            ChatData.fillAiReply([
                { role: "system", text: "⚠ 链接已由用户强制切断 (Signal Lost)" }
            ], null, true);
        };

        const formatTime = (ts) => {
            if (!ts) return '';
            const date = new Date(ts);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        };

        // 🟢 [新增] 获取世界状态 (地点与时间)
        // 依赖全局 store.worldState，使用可选链防止初始化时报错
        // 🟢 [修改] 获取世界状态 (拼接 地图 + 节点)
        const currentLocation = computed(() => {
            const ws = store.worldState;
            if (!ws) return "未知领域";
            
            const map = ws.mapName || "未知地图";
            const node = ws.nodeName || "未知区域"; // 读取我们在上面存入的 nodeName
            
            return `${map} · ${node}`; // 格式：黑森林 · 废弃营地
        });
        
        const currentTime = computed(() => store.worldState?.timeDisplay || "--:--");

        return {
            inputText,
            sortedChannels,
            activeChannelId,
            currentMessages,
            currentChannelInfo,
            isThinking,
            msgContainer,
            hasHiddenMessages,
            isWaiting,
            hasMoreHistory,
            currentLocation,
            currentTime,
            isOpeningSequence, // [新增]

            startAdventure,    // [新增]
            loadHistory,
            switchChannel,
            close,
            send,
            handleKeydown,
            cancelGeneration,
            formatTime,
            advanceDialogue 
        };
    }
};