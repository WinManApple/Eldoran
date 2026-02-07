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

// src/ui/QuestBoard.js
import { store } from './modules/store.js';
import { computed, ref, reactive, onMounted, nextTick } from '../../lib/vue.esm-browser.js';
import { useQuest } from './modules/useQuest.js';
import { Plot_Memory } from '../LLM/memory/Plot_Memory.js';

export default {
    name: 'QuestBoard',
    emits: ['close'],
    template: `
    <div class="quest-board-overlay">
        <div class="board-backdrop" @click="close"></div>
        
        <div class="quest-board-paper" :class="{ 'design-mode-active': isDesignMode }">
            <button class="board-close-btn" @click="close" title="关闭面板">×</button>
            
            <div class="board-header">
                <div class="header-top">
                    <h2>冒险者委托板</h2>

                    <div class="god-mode-controls">
                        <button class="quest-design-btn" 
                                :class="{ 'active': isDesignMode }" 
                                @click="toggleDesignMode"
                                title="切换暴露/设计模式 (Expose Design Mode)">
                            {{ isDesignMode ? '👁️ 观测者模式 ON' : '🕶️ 沉浸模式' }}
                        </button>
                    </div>

                    <div class="tab-switcher">
                        <button class="tab-btn" 
                                :class="{ active: currentTab === 'active' }" 
                                @click="currentTab = 'active'">
                            ⚔️ 当前目标
                        </button>
                        <button class="tab-btn" 
                                :class="{ active: currentTab === 'history' }" 
                                @click="currentTab = 'history'">
                            📜 冒险回忆
                        </button>
                    </div>
                </div>
                <p class="header-subtitle" v-if="currentTab === 'active'">Current Objectives & Anomalies</p>
                <p class="header-subtitle" v-else>Chronicles of the Past</p>
            </div>

            <div class="board-content" v-if="currentTab === 'active'">
                
                <div class="board-section main-section">
                    <div class="section-badge">👑 核心目标 (Main Story)</div>
                    
                    <div class="quest-timeline">
                        <div v-if="questSystem.mainLine.length === 0" class="empty-hint">
                            暂无主线记录...
                        </div>

                        <div v-for="(task, index) in questSystem.mainLine" :key="task.layer" 
                             class="timeline-item"
                             :class="{ 'current': task.status === 'active', 'completed': task.status === 'completed' }">
                            
                            <div class="timeline-marker">
                                <div class="marker-dot">
                                    <span v-if="task.status === 'completed'">✔</span>
                                    <span v-else-if="task.status === 'active'">⚔️</span>
                                    <span v-else>🔒</span>
                                </div>
                                <div class="marker-line" v-if="index !== questSystem.mainLine.length - 1"></div>
                            </div>

                            <div class="timeline-content" :class="{ 'quest-editing-mode': isEditing(null, task.layer) }">
                                <div class="task-header">
                                    <span class="layer-tag">Layer {{ task.layer }}</span>
                                    
                                    <input v-if="isEditing(null, task.layer)" 
                                           v-model="editForm.title" 
                                           class="quest-edit-input title-input" 
                                           placeholder="输入新的标题...">
                                    
                                    <h3 v-else class="task-title" :class="{ 'quest-redacted-blur': isTaskRedacted(task) }">
                                        {{ isTaskRedacted(task) ? '████████' : task.title }}
                                    </h3>

                                    <button v-if="isDesignMode && !isEditing(null, task.layer)" 
                                            class="quest-edit-icon-btn" 
                                            @click="startEdit(null, task)">
                                        📝
                                    </button>
                                </div>

                                <textarea v-if="isEditing(null, task.layer)" 
                                          v-model="editForm.description" 
                                          class="quest-edit-textarea" 
                                          placeholder="输入剧情描述..."></textarea>
                                
                                <p v-else class="task-desc" 
                                   :class="{ 'quest-redacted-block': isTaskRedacted(task) }">
                                    {{ isTaskRedacted(task) ? generateRedactedText(task.description ? task.description.length : 10) : task.description }}
                                </p>

                                <div v-if="isEditing(null, task.layer)" class="quest-edit-actions">
                                    <button class="quest-action-btn confirm" @click="confirmEdit">💾 确认生效</button>
                                    <button class="quest-action-btn reset" @click="cancelEdit">↩️ 重置返回</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="board-section side-section">
                    <div class="section-badge">✨ 时空裂缝 (Sub Quests)</div>
                    
                    <div class="side-quest-list">
                        <div v-if="questSystem.sideLine.length === 0" class="empty-quests">
                            <div class="empty-icon">🍃</div>
                            <p>附近暂无异常波动...</p>
                        </div>

                        <div v-for="quest in questSystem.sideLine" :key="quest.id" 
                                class="quest-card"
                                :class="{ 'pinned': quest.isPinned, 'expanded': expandedIds.includes(quest.id) }"
                                @click="toggleExpand(quest.id)">
                            
                            <div class="quest-card-main">
                                <div class="quest-card-left">
                                    <div class="quest-name">
                                        <span class="expand-arrow">{{ expandedIds.includes(quest.id) ? '▼' : '▶' }}</span>
                                        {{ quest.name }}
                                    </div>
                                    <div class="quest-meta">
                                        <span class="meta-item location">📍 第 {{ quest.layerIndex }} 层入口</span>
                                        <span class="meta-item life" :class="{ 'danger': !quest.isPinned && quest.life <= 5 }">
                                            ⏳ {{ quest.isPinned ? '稳定 (Stable)' : quest.life + ' 步剩余' }}
                                        </span>
                                    </div>
                                </div>

                                <div class="quest-card-actions" @click.stop>
                                    <button class="action-btn pin-btn" 
                                            :class="{ active: quest.isPinned }"
                                            @click="togglePin(quest)"
                                            :title="quest.isPinned ? '取消固定' : '固定此任务 (寿命不减)'">
                                        📌
                                    </button>

                                    <button class="action-btn trash-btn" 
                                            @click="abandon(quest.id)"
                                            title="切断连接 (删除任务)">
                                        🗑️
                                    </button>
                                </div>
                            </div>

                            <div class="quest-card-details" v-if="expandedIds.includes(quest.id)" @click.stop>
                                <div class="sub-task-list">
                                    <div v-for="(subTask, sIdx) in quest.tasks" :key="sIdx" class="sub-task-item">
                                        <div class="sub-task-dot"></div>
                                        
                                        <div style="flex: 1;">
                                            <div class="sub-task-header" style="display: flex; justify-content: space-between; align-items: center;">
                                                <input v-if="isEditing(quest.id, subTask.layer)" 
                                                       v-model="editForm.title" 
                                                       class="quest-edit-input small">
                                                
                                                <div v-else class="sub-task-title" :class="{ 'quest-redacted-blur': isTaskRedacted(subTask) }">
                                                    {{ isTaskRedacted(subTask) ? '████' : subTask.title }}
                                                </div>

                                                <button v-if="isDesignMode && !isEditing(quest.id, subTask.layer)" 
                                                        class="quest-edit-icon-btn small" 
                                                        @click.stop="startEdit(quest.id, subTask)">
                                                    📝
                                                </button>
                                            </div>

                                            <textarea v-if="isEditing(quest.id, subTask.layer)" 
                                                      v-model="editForm.description" 
                                                      class="quest-edit-textarea small"></textarea>
                                                      
                                            <div v-else class="sub-task-desc" :class="{ 'quest-redacted-block': isTaskRedacted(subTask) }">
                                                {{ isTaskRedacted(subTask) ? '--- 信号丢失 ---' : subTask.description }}
                                            </div>

                                            <div v-if="isEditing(quest.id, subTask.layer)" class="quest-edit-actions small">
                                                <button class="quest-action-btn confirm" @click.stop="confirmEdit">✔</button>
                                                <button class="quest-action-btn reset" @click.stop="cancelEdit">✘</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="pin-mark" v-if="quest.isPinned"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="board-content history-view" v-else>
                <div v-if="questSystem.history.length === 0" class="empty-history">
                    <div class="empty-icon">📖</div>
                    <p>暂无过往章节的记录，传说才刚刚开始...</p>
                </div>

                <div class="history-list">
                    <div v-for="chap in questSystem.history" :key="chap.id" class="history-card">
                        <div class="history-header">
                            <span class="history-title">{{ chap.title }}</span>
                            <span class="history-progress">探索度: {{ chap.progress || '100%' }}</span>
                        </div>
                        <div class="history-body">
                            {{ chap.summary }}
                        </div>
                    </div>
                </div>
            </div>

        </div>
    </div>
    `,
    setup(props, { emit }) {
        const { syncQuestData } = useQuest();
        
        // 界面状态
        const currentTab = ref('active'); // 'active' | 'history'
        const expandedIds = ref([]); // 存储展开的支线 ID

        // 数据源 (需在 store.js 中定义 questSystem)
        const questSystem = computed(() => store.questSystem || { mainLine: [], sideLine: [], history: [] });

        // 生命周期：打开时立即同步数据
        onMounted(() => {
            syncQuestData();
        });

        // 关闭
        const close = () => {
            emit('close');
        };

        // 展开/收起支线详情
        const toggleExpand = (id) => {
            const idx = expandedIds.value.indexOf(id);
            if (idx === -1) {
                expandedIds.value.push(id);
            } else {
                expandedIds.value.splice(idx, 1);
            }
        };

        // 📌 固定/取消固定 (逻辑不变)
        const togglePin = (quest) => {
            if (!window.mapManager) return;
            window.mapManager.togglePinSubMap(quest.id);
            // 本地状态立即反转，提升响应速度
            quest.isPinned = !quest.isPinned;
        };

        // 🗑️ 放弃任务 (逻辑不变)
        const abandon = (questId) => {
            const manager = window.mapManager;
            if (!manager) return;

            // 级联依赖检查
            let pointer = manager.currentMap;
            const dependencyChain = [];
            let isDependent = false;

            while (pointer) {
                dependencyChain.unshift(pointer.name);
                if (pointer.mapId === questId) {
                    isDependent = true;
                    break;
                }
                if (pointer.parentMapId) {
                    pointer = manager.maps[pointer.parentMapId];
                } else {
                    break;
                }
            }

            if (isDependent) {
                const chainStr = dependencyChain.join(" -> ");
                alert(`🚫 无法删除节点！\n\n检测到存在的时空依赖关系：\n${chainStr}\n\n您当前所在的区域（或其上游）依附于该节点。请先通过传送门返回更上层的区域，然后再断开连接。`);
                return; 
            }

            if (!confirm("确定要切断与此时空裂缝的连接吗？此操作不可逆。")) return;
            
            manager.pruneSubMap(questId);
            
            // 重新同步一次数据，确保 UI 刷新
            syncQuestData();
        };

        // --- 🟢 上帝模式与编辑逻辑 ---

        // 1. 映射 store 中的设计模式开关
        const isDesignMode = computed(() => store.questSystem.isDesignMode);

        const toggleDesignMode = () => {
            store.questSystem.isDesignMode = !store.questSystem.isDesignMode;
            // 关闭设计模式时，强制退出所有编辑状态
            if (!store.questSystem.isDesignMode) {
                cancelEdit();
            }
        };

        // 2. 遮蔽判断逻辑
        // 如果不在设计模式下，且任务被标记为 redacted，则显示遮蔽样式
        const isTaskRedacted = (task) => {
            return !isDesignMode.value && task.isRedacted;
        };

        // 生成乱码占位符
        const generateRedactedText = (len) => {
            // 简单生成一段长度相近的乱码，或者固定字符串
            return "█".repeat(Math.min(len || 10, 50)); 
        };

        // 3. 编辑状态管理
        // currentEditTarget: { mapId: string|null, layer: number } | null
        // mapId 为 null 代表主线(当前地图)，否则为支线 Map ID
        const currentEditTarget = ref(null);
        
        // 临时表单数据
        const editForm = reactive({
            title: '',
            description: ''
        });

        // 判断当前任务是否正在被编辑
        const isEditing = (mapId, layer) => {
            if (!currentEditTarget.value) return false;
            return currentEditTarget.value.mapId === mapId && currentEditTarget.value.layer === layer;
        };

        // 开始编辑
        const startEdit = (mapId, task) => {
            // 如果已经在编辑别的，先重置
            if (currentEditTarget.value) cancelEdit();

            currentEditTarget.value = { mapId, layer: task.layer };
            // 深拷贝数据到临时表单，防止直接修改 UI
            editForm.title = task.title;
            editForm.description = task.description;
        };

        // 重置/取消
        const cancelEdit = () => {
            currentEditTarget.value = null;
            editForm.title = '';
            editForm.description = '';
        };

        // 确认保存 (回写 Plot_Memory)
        const confirmEdit = () => {
            if (!currentEditTarget.value) return;

            const { mapId, layer } = currentEditTarget.value;
            const targetMapId = mapId || (window.mapManager?.currentMap?.mapId);

            if (!targetMapId) {
                alert("无法定位目标章节 ID");
                return;
            }

            // 构造符合 Plot_Memory 结构的数据
            // key 格式: "task3" (标题) 和 "stage3" (描述)
            const updatePayload = {
                [`task${layer}`]: editForm.title,
                [`stage${layer}`]: editForm.description
            };

            console.log(`[QuestBoard] 保存编辑: Chapter=${targetMapId}, Layer=${layer}`, updatePayload);

            // 1. 回写记忆库
            Plot_Memory.updateChapterStages(targetMapId, updatePayload);

            // 2. 重新同步 UI 数据
            syncQuestData();

            // 3. 退出编辑态
            cancelEdit();
        };

        // --- Return 补充 ---
        return {
            // 原有基础功能
            currentTab,
            questSystem,
            expandedIds,
            close,
            toggleExpand,
            togglePin,
            abandon,

            // 新增：上帝模式与编辑功能
            isDesignMode,
            toggleDesignMode,
            isTaskRedacted,
            generateRedactedText,
            isEditing,
            editForm,
            startEdit,
            cancelEdit,
            confirmEdit
        };
    }
};