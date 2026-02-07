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

// src/ui/HMemoryOverlay.js
import { ref, computed, onMounted } from '../../lib/vue.esm-browser.js';

export default {
    template: `
    <div class="h-memory-overlay" @click.self="$emit('close')">
        <div class="memory-container pink-theme">
            
            <div class="memory-header">
                <div class="header-title">
                    <span class="icon">💗</span> 
                    <h2>心灵回响 (Memories)</h2>
                </div>
                <button class="close-btn" @click="$emit('close')">×</button>
            </div>

            <div class="memory-body">
                
                <div class="memory-sidebar custom-scroll">
                    <div v-if="Object.keys(groupedHistory).length === 0" class="empty-hint">
                        暂无任何羁绊记录...
                    </div>
                    
                    <div 
                        v-for="(sessions, charId) in groupedHistory" 
                        :key="charId"
                        class="char-list-item"
                        :class="{ active: selectedCharId === charId }"
                        @click="selectCharacter(charId)"
                    >
                        <div class="char-avatar">
                            {{ getCharacterName(charId)[0] }}
                        </div>
                        <div class="char-info">
                            <div class="char-name">{{ getCharacterName(charId) }}</div>
                            <div class="memory-count">{{ sessions.length }} 段回忆</div>
                        </div>
                    </div>
                </div>

                <div class="memory-content">
                    
                    <div v-if="!selectedCharId" class="placeholder-state">
                        <div class="heart-icon">💖</div>
                        <p>请选择一位与之有着深刻羁绊的对象...</p>
                    </div>

                    <div v-else-if="!selectedSession" class="event-list-view custom-scroll">
                        <div class="content-header">
                            <h3>{{ getCharacterName(selectedCharId) }} 的回忆录</h3>
                            <span class="subtitle">共 {{ currentCharSessions.length }} 个篇章</span>
                        </div>
                        
                        <div class="events-grid">
                            <div 
                                v-for="session in currentCharSessions" 
                                :key="session.h_history_id"
                                class="event-card"
                                @click="openSession(session)"
                            >
                                <div class="event-title">{{ session.eventName }}</div>
                                <div class="event-meta">
                                    <span class="date">{{ formatDate(session.startTime) }}</span>
                                    <span class="msg-count">💬 {{ session.messages.length }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-else class="chat-replay-view">
                        <div class="replay-header">
                            <button class="back-btn" @click="selectedSession = null">↩ 返回列表</button>
                            <span class="replay-title">{{ selectedSession.eventName }}</span>
                            <div class="spacer"></div>
                        </div>

                        <div class="replay-body custom-scroll">
                            <div 
                                v-for="(msg, index) in selectedSession.messages" 
                                :key="index"
                                class="chat-message"
                                :class="getMessageClass(msg.role)"
                            >
                                <div v-if="msg.role === 'ai'" class="msg-avatar">
                                    {{ (msg.name || getCharacterName(selectedSession.charId))[0] }}
                                </div>

                                <div class="msg-content-wrapper">
                                    <div v-if="msg.role !== 'system' && msg.role !== 'user'" class="msg-name">
                                        {{ msg.name || getCharacterName(selectedSession.charId) }}
                                    </div>
                                    
                                    <div class="msg-bubble">
                                        {{ msg.text }}
                                    </div>
                                </div>
                            </div>
                            
                            <div class="replay-footer">
                                <span class="end-mark">—— 回忆结束 ——</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </div>
    `,
    
    setup(props) {
        const historyData = ref([]);
        const selectedCharId = ref(null);
        const selectedSession = ref(null);

        // 1. 初始化数据
        onMounted(() => {
            if (window.H_Data && window.H_Data.history) {
                // 深拷贝防止直接修改原数据
                historyData.value = JSON.parse(JSON.stringify(window.H_Data.history));
            }
        });

        // 2. 按 CharID 分组数据
        const groupedHistory = computed(() => {
            const groups = {};
            historyData.value.forEach(session => {
                const cid = session.charId;
                if (!groups[cid]) {
                    groups[cid] = [];
                }
                groups[cid].push(session);
            });
            // 每一个组内的 session 按时间倒序排列 (最新的在最前)
            Object.keys(groups).forEach(key => {
                groups[key].sort((a, b) => b.startTime - a.startTime);
            });
            return groups;
        });

        // 3. 获取当前选中角色的所有 Session
        const currentCharSessions = computed(() => {
            if (!selectedCharId.value) return [];
            return groupedHistory.value[selectedCharId.value] || [];
        });

        // 4. 核心工具：获取角色名字
        const getCharacterName = (id) => {
            // A. 尝试从队伍 (Party) 中查找 (如莉莉丝)
            if (window.store && window.store.party) {
                const member = window.store.party.find(p => p.id === id);
                if (member) return member.name;
            }

            // B. 尝试从 NPC 记忆库中查找 (如薇薇安)
            if (window.Npc_Memory) {
                const npc = window.Npc_Memory.getNPC(id);
                if (npc && npc.base_information) return npc.base_information.name;
            }

            // C. 兜底显示 ID
            return id || "未知角色";
        };

        // 交互逻辑
        const selectCharacter = (id) => {
            selectedCharId.value = id;
            selectedSession.value = null; // 切换角色时退出回放模式
        };

        const openSession = (session) => {
            selectedSession.value = session;
        };

        // 样式类辅助
        const getMessageClass = (role) => {
            if (role === 'user') return 'msg-user';
            if (role === 'system') return 'msg-system';
            return 'msg-ai';
        };

        // 时间格式化
        const formatDate = (timestamp) => {
            if (!timestamp) return '未知时间';
            const date = new Date(timestamp);
            return date.toLocaleString('zh-CN', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        };

        return {
            historyData,
            groupedHistory,
            selectedCharId,
            selectedSession,
            currentCharSessions,
            getCharacterName,
            selectCharacter,
            openSession,
            getMessageClass,
            formatDate
        };
    }
};
