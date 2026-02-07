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

// src/ui/HistoryManagerOverlay.js
import { ref, computed, onMounted, reactive, watch, toRaw } from '../../lib/vue.esm-browser.js';
import { store } from './modules/store.js';
import { ChatData } from './modules/ChatData.js'; // 导入响应式的 UI 数据
import { Chat_Memory } from '../LLM/memory/Chat_Memory.js'; // 导入非响应式的 记忆单例
import { Party_Memory } from '../LLM/memory/Party_Memory.js';
import { Npc_Memory } from '../LLM/memory/Npc_Memory.js';

export default {
    name: 'HistoryManagerOverlay',
    template: `
    <div class="hm-overlay">
        <div class="hm-window" @click.stop>
            
            <div class="hm-sidebar">
                <div class="hm-sidebar-header">
                    <h3>📚 历史档案</h3>
                    <div class="hm-subtitle">频道列表</div>
                </div>
                <div class="hm-channel-list">
                    <div 
                        v-for="id in allChannelIds" 
                        :key="id"
                        class="hm-channel-item"
                        :class="{ active: currentChannelId === id }"
                        @click="switchChannel(id)"
                    >
                        <span class="hm-channel-icon">{{ getChannelIcon(id) }}</span>
                        <span class="hm-channel-name">{{ getChannelName(id) }}</span>
                        <span class="hm-badge" v-if="id === 'main'">MAIN</span>
                    </div>
                </div>
                <div class="hm-sidebar-footer">
                    <button class="hm-btn hm-btn-close" @click="closeOverlay">关闭面板</button>
                </div>
            </div>

            <div class="hm-content">
                
                <div class="hm-tabs">
                    <button 
                        class="hm-tab-btn" 
                        :class="{ active: activeTab === 'visual' }"
                        @click="activeTab = 'visual'"
                    >
                        📺 剧本层 (ChatData)
                        <span class="hm-tooltip">玩家在屏幕上看到的内容</span>
                    </button>
                    <button 
                        class="hm-tab-btn" 
                        :class="{ active: activeTab === 'memory' }"
                        @click="activeTab = 'memory'"
                    >
                        🧠 记忆层 (LLM Memory)
                        <span class="hm-tooltip">发送给 AI 的实际提示词上下文</span>
                    </button>

                    <button class="hm-tab-btn hm-ext-tab" :class="{ active: activeTab === 'teammate' }" @click="activeTab = 'teammate'; selectedCharId = null;">👥 队友记忆</button>
                    <button class="hm-tab-btn hm-ext-tab" :class="{ active: activeTab === 'npc' }" @click="activeTab = 'npc'; selectedCharId = null;">🎭 NPC 档案</button>

                </div>

                <div v-if="activeTab === 'visual'" class="hm-panel-scroll">
                    <div class="hm-toolbar">
                        <span class="hm-info">修改将实时反映在游戏界面中。</span>
                    </div>

                    <div v-if="currentChatDataMessages.length === 0" class="hm-empty-state">
                        此频道暂无显示内容
                    </div>

                    <div 
                        v-for="(msg, index) in currentChatDataMessages" 
                        :key="index" 
                        class="hm-card hm-card-visual"
                    >
                        <div class="hm-card-header">
                            <span class="hm-index">#{{ index }}</span>
                            <span class="hm-time">{{ formatTime(msg.timestamp) }}</span>
                            <button class="hm-btn-icon delete" @click="deleteVisualItem(index)" title="删除此条">🗑️</button>
                        </div>

                        <div v-if="msg.user" class="hm-row">
                            <label>玩家:</label>
                            <input type="text" v-model="msg.userText" class="hm-input">
                        </div>

                        <div v-if="msg.reply && Array.isArray(msg.reply.content)" class="hm-reply-list">
                            <div v-for="(item, rIndex) in msg.reply.content" :key="rIndex" class="hm-reply-item">
                                <input type="text" v-model="item.role" class="hm-input-xs" placeholder="角色/name">
                                <textarea v-model="item.text" class="hm-textarea-sm" placeholder="内容..."></textarea>
                                <button class="hm-btn-mini delete" @click="msg.reply.content.splice(rIndex, 1)">x</button>
                            </div>
                            <button class="hm-btn-dashed" @click="addVisualReplyItem(msg)">+ 追加回复段落</button>
                        </div>

                        <div v-else-if="msg.reply && msg.reply.content" class="hm-raw-json">
                            <em>(检测到旧版对象结构，仅支持只读查看)</em>
                            <pre>{{ msg.reply.content }}</pre>
                        </div>
                    </div>
                </div>

                <div v-if="activeTab === 'memory'" class="hm-panel-scroll">
                    <div class="hm-toolbar sticky">
                        <span class="hm-info">此处修改的是 AI 的认知。</span>
                        <div class="hm-actions">
                            <button class="hm-btn hm-btn-save" @click="saveMemoryChanges">💾 保存记忆修改</button>
                            <button class="hm-btn hm-btn-reload" @click="refreshLocalMemory">🔄 重置</button>
                        </div>
                    </div>

                    <div class="hm-section">
                        <h4 class="hm-section-title">🌍 宏观总结 (Grand Summary)</h4>
                        <div class="hm-info-box" v-if="localMemory.grand_summary.length === 0">
                            暂无历史篇章记录。
                        </div>
                        
                        <div 
                            v-for="(grand, index) in localMemory.grand_summary" 
                            :key="'grand-'+index" 
                            class="hm-card"
                        >
                            <div class="hm-card-header">
                                <span class="hm-index">总结: {{ index + 1 }}</span>
                                <span class="hm-time">{{ formatTime(grand.timestamp || grand.last_updated) }}</span>
                                <button class="hm-btn-icon delete" @click="localMemory.grand_summary.splice(index, 1)">🗑️</button>
                            </div>
                            
                            <textarea 
                                v-model="grand.content" 
                                class="hm-textarea-lg" 
                                placeholder="篇章内容..."
                            ></textarea>
                        </div>
                        <button class="hm-btn-dashed" @click="addGrandSummaryItem">+ 添加历史篇章</button>
                    </div>

                    <div class="hm-section">
                        <h4 class="hm-section-title">📑 阶段总结 (Summary List)</h4>
                        <div 
                            v-for="(sum, index) in localMemory.summary" 
                            :key="'sum-'+index" 
                            class="hm-card hm-flex-row"
                        >
                            <span class="hm-tag">{{ sum.time_count }}</span>
                            <textarea v-model="sum.content" class="hm-textarea-md"></textarea>
                            <button class="hm-btn-icon delete" @click="localMemory.summary.splice(index, 1)">🗑️</button>
                        </div>
                        <button class="hm-btn-dashed" @click="addSummaryItem">+ 添加一条总结</button>
                    </div>

                    <div class="hm-section">
                        <h4 class="hm-section-title">💬 近期对话 (Recent Chat)</h4>
                        <div class="hm-info-box">这是发送给 LLM 的实际 Context，请确保准确。</div>
                        
                        <div 
                            v-for="(entry, index) in localMemory.recent_chat" 
                            :key="'chat-'+index" 
                            class="hm-card hm-card-memory"
                        >
                            <div class="hm-card-header">
                                <span class="hm-index">Seq: {{ index }}</span>
                                <button class="hm-btn-icon delete" @click="localMemory.recent_chat.splice(index, 1)">🗑️</button>
                            </div>

                            <div class="hm-row" v-if="entry.user">
                                <div class="hm-col-label">User:</div>
                                <div class="hm-col-content">
                                    <input v-model="entry.user" class="hm-input-sm" placeholder="Name">
                                    <input v-model="entry.userText" class="hm-input" placeholder="Text">
                                </div>
                            </div>

                            <div class="hm-reply-container">
                                <div v-if="Array.isArray(entry.reply.content)">
                                    <div 
                                        v-for="(item, rIndex) in entry.reply.content" 
                                        :key="rIndex" 
                                        class="hm-reply-row"
                                    >
                                        <input v-model="item.role" class="hm-input-xs" placeholder="Role">
                                        <textarea v-model="item.text" class="hm-textarea-sm"></textarea>
                                        <button class="hm-btn-mini delete" @click="entry.reply.content.splice(rIndex, 1)">x</button>
                                    </div>
                                    <button class="hm-btn-text" @click="addMemoryReplyRow(entry)">+ Role</button>
                                </div>
                                <div v-else>
                                    <pre>{{ entry.reply.content }}</pre>
                                    <button class="hm-btn-mini" @click="convertMemoryToArr(entry)">转为数组结构</button>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                <div v-if="activeTab === 'teammate'" class="hm-panel-scroll">
                    <div class="hm-ext-layout">
                        <div class="hm-ext-list-side">
                            <div class="hm-subtitle">队友列表</div>
                            <div v-for="tm in allTeammates" :key="tm.id" 
                                class="hm-ext-item-card" :class="{ active: selectedCharId === tm.id }"
                                @click="selectCharacter(tm.id, 'teammate')">
                                <span class="hm-ext-id-tag">{{ tm.id }}</span> 
                                {{ getTeammateName(tm.id) }}
                            </div>
                            <div v-if="allTeammates.length === 0" class="hm-empty-state">暂无队友</div>
                        </div>

                        <div class="hm-ext-editor-main" v-if="selectedCharId && activeTab === 'teammate'">
                            <div class="hm-toolbar sticky">
                                <span class="hm-info">正在编辑队友 [{{ selectedCharId }}] 的交互记忆</span>
                                <button class="hm-btn hm-btn-save" @click="saveTeammateMemory">💾 提交修改</button>
                            </div>
                            <div class="hm-ext-log-container">
                                <div v-for="(line, idx) in localTeammateData" :key="idx" class="hm-ext-log-row">
                                    <textarea v-model="localTeammateData[idx]" class="hm-textarea-sm"></textarea>
                                    <button class="hm-btn-icon delete" @click="localTeammateData.splice(idx, 1)">🗑️</button>
                                </div>
                            </div>
                            <button class="hm-btn-dashed" @click="localTeammateData.push('')">+ 插入新记忆条目</button>
                        </div>
                        <div class="hm-empty-state" v-else-if="allTeammates.length > 0">请从左侧选择一名队友</div>
                    </div>
                </div>

                <div v-if="activeTab === 'npc'" class="hm-panel-scroll">
                    <div class="hm-ext-layout">
                        <div class="hm-ext-list-side">
                            <div class="hm-subtitle">NPC 列表</div>
                            <div v-for="npc in allNpcs" :key="npc.base_information.NPC_ID" 
                                class="hm-ext-item-card" :class="{ active: selectedCharId === npc.base_information.NPC_ID }"
                                @click="selectCharacter(npc.base_information.NPC_ID, 'npc')">
                                {{ npc.base_information.name }}
                            </div>
                        </div>

                        <div class="hm-ext-editor-main" v-if="selectedCharId && activeTab === 'npc'">
                            <div class="hm-toolbar sticky">
                                <span class="hm-info">正在编辑 NPC [{{ localNpcData.base.name }}] 的档案</span>
                                <button class="hm-btn hm-btn-save" @click="saveNpcArchive">💾 提交修改</button>
                            </div>
                            
                            <div class="hm-section">
                                <h4 class="hm-section-title">🆔 基础信息</h4>
                                <div class="hm-card hm-ext-npc-card">
                                    <div class="hm-row"><label>姓名:</label><input v-model="localNpcData.base.name" class="hm-input"></div>
                                    <div class="hm-row"><label>身份:</label><input v-model="localNpcData.base.identity" class="hm-input"></div>
                                    <div class="hm-row"><label>外貌:</label><textarea v-model="localNpcData.base.appearance" class="hm-textarea-sm"></textarea></div>
                                    <div class="hm-row"><label>性格:</label><textarea v-model="localNpcData.base.character" class="hm-textarea-sm"></textarea></div>
                                </div>
                            </div>

                            <div class="hm-section">
                                <h4 class="hm-section-title">📊 状态属性</h4>
                                <div class="hm-card hm-ext-npc-card">
                                    <div class="hm-row"><label>状态:</label><input v-model="localNpcData.meta.state" class="hm-input-sm"> (Live/Dead)</div>
                                    <div class="hm-row"><label>阵营:</label><input v-model="localNpcData.meta.lineup" class="hm-input-sm"></div>
                                    <div class="hm-row"><label>态度:</label><input type="number" v-model.number="localNpcData.meta.attitude" class="hm-input-sm"></div>
                                </div>
                            </div>

                            <div class="hm-section">
                                <h4 class="hm-section-title">📜 交互记录</h4>
                                <div v-for="(h, idx) in localNpcData.history" :key="idx" class="hm-ext-log-row">
                                    <textarea v-model="localNpcData.history[idx]" class="hm-textarea-sm"></textarea>
                                    <button class="hm-btn-icon delete" @click="localNpcData.history.splice(idx, 1)">🗑️</button>
                                </div>
                                <button class="hm-btn-dashed" @click="localNpcData.history.push('')">+ 添加交互记录</button>
                            </div>
                        </div>
                        <div class="hm-empty-state" v-else>请从左侧选择一名 NPC</div>
                    </div>
                </div>

            </div>

        </div>
    </div>
    `,
    setup() {
        const activeTab = ref('visual'); // 'visual' | 'memory'
        const currentChannelId = ref('main');
        
        // --- 响应式本地副本 (用于编辑 Chat_Memory) ---
        const localMemory = reactive({
            grand_summary: [],
            summary: [],
            recent_chat: []
        });

        // ==========================================
        // 1. 频道管理
        // ==========================================
        const allChannelIds = computed(() => {
            const uiIds = Object.keys(ChatData.channels || {});
            const memIds = Object.keys(Chat_Memory.channels || {});
            // 去重合并
            return [...new Set([...uiIds, ...memIds])];
        });

        const getChannelName = (id) => {
            if (ChatData.channels[id]) return ChatData.channels[id].name;
            return id;
        };

        const getChannelIcon = (id) => {
            if (ChatData.channels[id]) return ChatData.channels[id].icon || '#';
            return '?';
        };

        const switchChannel = (id) => {
            currentChannelId.value = id;
            refreshLocalMemory(); // 切换频道时重置记忆副本
        };

        // ==========================================
        // 2. ChatData (Visual Layer) 逻辑
        // ==========================================
        // 直接引用 Reactive 对象，修改会实时生效
        const currentChatDataMessages = computed(() => {
            const ch = ChatData.channels[currentChannelId.value];
            return ch ? ch.messages : [];
        });

        const deleteVisualItem = (index) => {
            if (confirm("确定从屏幕上移除这条消息吗？(不会影响记忆)")) {
                ChatData.channels[currentChannelId.value].messages.splice(index, 1);
                // 修正 visibleBubbleCount 以防报错
                if (ChatData.visibleBubbleCount > ChatData.channels[currentChannelId.value].messages.length) {
                    ChatData.visibleBubbleCount--;
                }
            }
        };

        const addVisualReplyItem = (msg) => {
            if (!msg.reply) msg.reply = { content: [] };
            if (!Array.isArray(msg.reply.content)) msg.reply.content = [];
            msg.reply.content.push({ role: 'narrator', text: '...' });
        };

        // ==========================================
        // 3. Chat_Memory (Logic Layer) 逻辑
        // ==========================================
        
        // 从单例中深拷贝数据到 localMemory
        const refreshLocalMemory = () => {
            // 获取原始数据 (可能不存在)
            const rawMem = Chat_Memory.getChannelData(currentChannelId.value);
            
            if (rawMem && rawMem.history) {
                // Deep Copy to break reference
                const copy = JSON.parse(JSON.stringify(rawMem.history));
                // 🟢 兼容性处理：确保是数组
                if (Array.isArray(copy.grand_summary)) {
                    localMemory.grand_summary = copy.grand_summary;
                } else if (copy.grand_summary && copy.grand_summary.content) {
                    // 旧存档兼容：转为单元素数组
                    localMemory.grand_summary = [{
                        content: copy.grand_summary.content,
                        timestamp: copy.grand_summary.last_updated || Date.now()
                    }];
                } else {
                    localMemory.grand_summary = [];
                }
                localMemory.summary = copy.summary || [];
                localMemory.recent_chat = copy.recent_chat || [];
            } else {
                // 初始化空状态
                localMemory.grand_summary = { content: "", last_updated: 0 };
                localMemory.summary = [];
                localMemory.recent_chat = [];
            }
            console.log(`[HistoryManager] Loaded memory for channel: ${currentChannelId.value}`);
        };

        // 保存回单例
        const saveMemoryChanges = () => {
            // 确保频道存在
            if (!Chat_Memory.channels[currentChannelId.value]) {
                Chat_Memory._getChannel(currentChannelId.value);
            }
            
            const targetHistory = Chat_Memory.channels[currentChannelId.value].history;
            
            // 将编辑后的数据写回
            targetHistory.grand_summary = JSON.parse(JSON.stringify(localMemory.grand_summary));
            targetHistory.summary = JSON.parse(JSON.stringify(localMemory.summary));
            targetHistory.recent_chat = JSON.parse(JSON.stringify(localMemory.recent_chat));
            
            alert("记忆修改已保存！\nAI 下次生成时将使用新数据。");
        };

        const addSummaryItem = () => {
            localMemory.summary.push({
                time_count: "Manual",
                content: "新的总结..."
            });
        };

        const addGrandSummaryItem = () => {
            localMemory.grand_summary.push({
                content: "新的篇章记录...",
                timestamp: Date.now()
            });
        };

        const addMemoryReplyRow = (entry) => {
            if (!entry.reply.content) entry.reply.content = [];
            entry.reply.content.push({ role: 'system', text: '' });
        };

        const convertMemoryToArr = (entry) => {
            if (typeof entry.reply.content === 'object') {
                const arr = [];
                for (const [k, v] of Object.entries(entry.reply.content)) {
                    arr.push({ role: k, text: v });
                }
                entry.reply.content = arr;
            }
        };

        // --- 队友与 NPC 选择状态 ---
        const selectedCharId = ref(null); // 当前选中的角色 ID
        const localTeammateData = ref([]); // 队友记忆本地副本 (数组字符串)
        const localNpcData = reactive({ // NPC 档案本地副本
            base: {},
            history: [],
            meta: {}
        });

        // --- 数据获取 ---
        const allTeammates = computed(() => Object.values(Party_Memory.data));
        const allNpcs = computed(() => Object.values(Npc_Memory.npcs));

        // --- 切换角色逻辑 ---
        const selectCharacter = (id, type) => {
            selectedCharId.value = id;
            if (type === 'teammate') {
                const mem = Party_Memory.getTeammateMemory(id);
                localTeammateData.value = mem ? [...mem.memory] : [];
            } else {
                const npc = Npc_Memory.getNPC(id);
                if (npc) {
                    localNpcData.base = JSON.parse(JSON.stringify(npc.base_information));
                    localNpcData.history = [...npc.interaction_history];
                    localNpcData.meta = {
                        lineup: npc.lineup,
                        attitude: npc.attitude_to_player,
                        state: npc.state,
                        effectiveness: npc.combat_effectiveness
                    };
                }
            }
        };

        // --- 保存逻辑 ---
        const saveTeammateMemory = () => {
            if (!selectedCharId.value) return;
            Party_Memory.data[selectedCharId.value].memory = [...localTeammateData.value];
            alert("队友记忆已同步至核心层！");
        };

        const saveNpcArchive = () => {
            if (!selectedCharId.value) return;
            const target = Npc_Memory.npcs[selectedCharId.value];
            target.base_information = JSON.parse(JSON.stringify(localNpcData.base));
            target.interaction_history = [...localNpcData.history];
            Object.assign(target, {
                lineup: localNpcData.meta.lineup,
                attitude_to_player: localNpcData.meta.attitude,
                state: localNpcData.meta.state,
                combat_effectiveness: localNpcData.meta.effectiveness
            });
            alert("NPC 档案已更新！");
        };

        const getTeammateName = (id) => {
            // 1. 尝试从 store.party (当前队伍) 中查找
            if (store.party && Array.isArray(store.party)) {
                const member = store.party.find(p => p.id === id);
                if (member && member.name) {
                    return member.name;
                }
            }
            // 2. 如果队伍里找不到（可能已离队），回退显示 ID，或者显示 "未知"
            return "未知队友"; 
        };

        // ==========================================
        // 生命周期
        // ==========================================
        onMounted(() => {
            // 默认选中当前激活的频道
            if (ChatData.activeChannelId) {
                currentChannelId.value = ChatData.activeChannelId;
            }
            refreshLocalMemory();
        });

        const formatTime = (ts) => {
            if (!ts) return '-';
            return new Date(ts).toLocaleTimeString();
        };

        const closeOverlay = () => {
            store.currentMenu = 'none';
        };

        return {
            activeTab,
            currentChannelId,
            allChannelIds,
            localMemory,
            currentChatDataMessages,
            
            getChannelName,
            getChannelIcon,
            switchChannel,
            formatTime,
            closeOverlay,
            
            // Visual Actions
            deleteVisualItem,
            addVisualReplyItem,

            // Memory Actions
            refreshLocalMemory,
            saveMemoryChanges,
            addSummaryItem,
            addGrandSummaryItem,
            addMemoryReplyRow,
            convertMemoryToArr,

            selectedCharId,
            localTeammateData,
            localNpcData,
            allTeammates,
            allNpcs,
            selectCharacter,
            saveTeammateMemory,
            saveNpcArchive,
            getTeammateName
        };
    }
};