/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/ui/HMemoryOverlay.js
import { ref, computed, onMounted } from '../../lib/vue.esm-browser.js';
import { H_Data, GROUP_ARCHIVE_ID } from './modules/H_Data.js';

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
                        <div class="char-avatar" :style="charId === GROUP_ARCHIVE_ID ? 'background:#9c27b0' : ''">
                            {{ charId === GROUP_ARCHIVE_ID ? '👥' : getCharacterName(charId)[0] }}
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
                                <button class="delete-card-btn" @click.stop="handleDelete(session)" title="删除这段回忆">×</button>

                                <div class="event-title">{{ session.eventName }}</div>
                                <div class="event-meta">
                                    <span class="date">{{ formatDate(session.startTime) }}</span>
                                    
                                    <span v-if="session.participants && session.participants.length > 1" class="tag-group" style="margin-left:5px; font-weight:bold; color:#e91e63;">
                                        👥 多人
                                    </span>

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
            
            if (id === GROUP_ARCHIVE_ID) return "多人羁绊";

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

        // [新增] 删除处理函数
        const handleDelete = (session) => {
            // 1. 确认提示
            if (!confirm(`确定要遗忘这段关于 "${session.eventName}" 的回忆吗？此操作不可撤销。`)) {
                return;
            }

            // 2. 调用数据层删除
            const success = H_Data.deleteSession(session.h_history_id);
            
            if (success) {
                // 3. 同步更新本地 UI 列表 (historyData 是 ref)
                const idx = historyData.value.findIndex(item => item.h_history_id === session.h_history_id);
                if (idx !== -1) {
                    historyData.value.splice(idx, 1);
                }
                
                // 4. 如果删除的是当前正选中的会话，关闭回放界面
                if (selectedSession.value && selectedSession.value.h_history_id === session.h_history_id) {
                    selectedSession.value = null;
                }
            }
        };

        return {
            GROUP_ARCHIVE_ID, // [新增]
            handleDelete,     // [新增]
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
