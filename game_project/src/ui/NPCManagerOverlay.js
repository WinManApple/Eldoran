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

// src/ui/NPCManagerOverlay.js

import { ref, computed, onMounted } from '../../lib/vue.esm-browser.js';

export default {
    template: `
    <div class="npc-manager-overlay" @click.self="$emit('close')">
        <div class="npc-container void-panel">
            
            <div class="npc-header">
                <h2>🌌 虚空观测记录 (NPC Archives)</h2>
                <button class="close-btn" @click="$emit('close')">×</button>
            </div>

            <div class="npc-content">
                <div class="npc-sidebar custom-scroll">
                    <div v-if="npcList.length === 0" class="empty-hint">
                        暂无观测记录...
                    </div>
                    <div 
                        v-for="npc in npcList" 
                        :key="npc.base_information.NPC_ID"
                        class="npc-list-item"
                        :class="{ active: selectedId === npc.base_information.NPC_ID }"
                        @click="selectNPC(npc.base_information.NPC_ID)"
                    >
                        <span class="npc-list-name">{{ npc.base_information.name }}</span>
                        <span class="npc-list-role">{{ npc.base_information.identity }}</span>
                    </div>
                </div>

                <div class="npc-details custom-scroll" v-if="selectedNPC">
                    <div class="detail-card profile-card">
                        <div class="avatar-placeholder">
                            {{ selectedNPC.base_information.name[0] }}
                        </div>
                        <div class="profile-info">
                            <h3 class="full-name">{{ selectedNPC.base_information.name }}</h3>
                            <div class="tags-row">
                                <span class="tag identity">{{ selectedNPC.base_information.identity }}</span>
                                <span class="tag lineup" :data-lineup="selectedNPC.lineup">{{ selectedNPC.lineup }}</span>
                                <span class="tag state" :class="selectedNPC.state.toLowerCase()">{{ selectedNPC.state === 'Live' ? '存活' : '已死亡' }}</span>
                            </div>
                        </div>
                        <div class="combat-rating">
                            <label>威胁等级</label>
                            <span :class="ratingClass(selectedNPC.combat_effectiveness)">
                                {{ selectedNPC.combat_effectiveness.toUpperCase() }}
                            </span>
                        </div>
                    </div>

                    <div class="divider-line"></div>

                    <div class="detail-section">
                        <h4>📝 观测特征</h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="label">性别:</span>
                                <span class="value">{{ selectedNPC.base_information.sex }}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">态度:</span>
                                <span class="value">{{ formatAttitude(selectedNPC.attitude_to_player) }}</span>
                            </div>
                            <div class="info-item full-width">
                                <span class="label">性格:</span>
                                <span class="value">{{ selectedNPC.base_information.character }}</span>
                            </div>
                            <div class="info-item full-width">
                                <span class="label">外貌:</span>
                                <span class="value">{{ selectedNPC.base_information.appearance }}</span>
                            </div>
                            <div class="info-item full-width">
                                <span class="label">核心目标:</span>
                                <span class="value">{{ selectedNPC.base_information.core_objective }}</span>
                            </div>
                        </div>
                    </div>

                    <div class="detail-section history-section">
                        <h4>📜 命运交集</h4>
                        <ul class="history-list" v-if="selectedNPC.interaction_history.length > 0">
                            <li v-for="(record, index) in reversedHistory" :key="index">
                                {{ record }}
                            </li>
                        </ul>
                        <p v-else class="no-history">尚未记录重大交互事件。</p>
                    </div>

                    <div class="action-footer">
                        <button class="delete-btn" @click="handleDelete">
                            🗑️ 抹除存在 (Delete)
                        </button>
                    </div>
                </div>

                <div class="npc-details empty-state" v-else>
                    <div class="void-icon">👁️</div>
                    <p>请从左侧选择一个观测对象...</p>
                </div>
            </div>
        </div>
    </div>
    `,
    
    setup(props, { emit }) {
        const npcList = ref([]);
        const selectedId = ref(null);

        // 初始化：从 window.Npc_Memory 读取数据并转换为数组
        const refreshList = () => {
            if (window.Npc_Memory && window.Npc_Memory.npcs) {
                npcList.value = Object.values(window.Npc_Memory.npcs);
            } else {
                npcList.value = [];
            }
        };

        onMounted(() => {
            refreshList();
        });

        const selectedNPC = computed(() => {
            if (!selectedId.value) return null;
            return window.Npc_Memory.getNPC(selectedId.value);
        });

        // 历史记录倒序显示（最新的在上面）
        const reversedHistory = computed(() => {
            if (!selectedNPC.value) return [];
            return [...selectedNPC.value.interaction_history].reverse();
        });

        const selectNPC = (id) => {
            selectedId.value = id;
        };

        const handleDelete = () => {
            if (!selectedId.value) return;
            
            const name = selectedNPC.value.base_information.name;
            if (confirm(`⚠️ 警告：正在修改世界因果律\n\n确定要永久抹除 [${name}] 的所有档案吗？\n此操作不可逆，且可能导致关联记忆断层。`)) {
                
                const success = window.Npc_Memory.deleteNPC(selectedId.value);
                if (success) {
                    selectedId.value = null; // 清空选中
                    refreshList(); // 刷新列表
                } else {
                    alert("删除失败，档案可能已被系统锁定。");
                }
            }
        };

        // 工具函数：态度数值转文本
        const formatAttitude = (val) => {
            const num = Number(val);
            if (num > 50) return `崇拜 (${num})`;
            if (num > 20) return `友善 (${num})`;
            if (num >= -10) return `中立 (${num})`;
            if (num > -50) return `厌恶 (${num})`;
            return `仇恨 (${num})`;
        };

        // 工具函数：战力样式
        const ratingClass = (rating) => {
            switch(rating.toLowerCase()) {
                case 'high': return 'rating-high';
                case 'medium': return 'rating-medium';
                case 'low': return 'rating-low';
                default: return '';
            }
        };

        return {
            npcList,
            selectedId,
            selectedNPC,
            reversedHistory,
            selectNPC,
            handleDelete,
            formatAttitude,
            ratingClass
        };
    }
};