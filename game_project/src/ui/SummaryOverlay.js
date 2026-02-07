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

// src/ui/SummaryOverlay.js
import { ref, computed } from '../../lib/vue.esm-browser.js';
import { store } from './modules/store.js';
import { ChatData } from './modules/ChatData.js';
import { Call_Summary } from '../LLM/calls/Call_Summary.js';
import { Game_Manager } from '../LLM/Game_Manager.js';

export default {
    name: 'SummaryOverlay',
    template: `
    <div class="sum-overlay">
        <div class="sum-window" @click.stop>
            <div class="sum-header">
                <div class="sum-title">
                    <span>剧情铭刻台</span>
                    <span style="font-size: 0.6em; color: #666; font-weight: normal;">/ Narrative Weaver</span>
                </div>
                <button class="sum-close-btn" @click="close">×</button>
            </div>

            <div class="sum-body">
                
                <div class="sum-col-source">
                    <div class="sum-col-title">活跃频道源</div>
                    
                    <div 
                        v-for="channel in availableChannels" 
                        :key="channel.id"
                        class="sum-card-draggable"
                        draggable="true"
                        @dragstart="onDragStart($event, channel)"
                    >
                        <span class="sum-icon">{{ channel.icon || '#' }}</span>
                        <span>{{ channel.name }}</span>
                    </div>

                    <div v-if="availableChannels.length === 0" class="sum-placeholder" style="padding:10px;">
                        暂无活跃频道
                    </div>
                </div>

                <div class="sum-col-process">
                    
                    <div class="sum-slot-container" style="flex: 1;">
                        <div class="sum-slot-title">① 萃取源 (Extraction Source)</div>
                        <div 
                            class="sum-drop-zone"
                            :class="{ 'sum-drag-over': isDragOverSource, 'has-item': sourceSlots.length > 0 }"
                            @dragover.prevent="isDragOverSource = true"
                            @dragleave="isDragOverSource = false"
                            @drop="onDropSource"
                        >
                            <div 
                                v-for="(item, index) in sourceSlots" 
                                :key="'src-' + item.id" 
                                class="sum-token"
                            >
                                <span>{{ item.name }}</span>
                                <span class="sum-token-remove" @click="removeSource(index)">×</span>
                            </div>

                            <div v-if="sourceSlots.length === 0" class="sum-placeholder">
                                将需要总结的频道拖拽至此<br>(支持多个视角融合)
                            </div>
                        </div>
                    </div>

                    <div class="sum-process-arrow">⬇</div>

                    <div class="sum-slot-container" style="flex: 1;">
                        <div class="sum-slot-title">② 注入目标 (Injection Target)</div>
                        <div 
                            class="sum-drop-zone"
                            :class="{ 'sum-drag-over': isDragOverTarget, 'has-item': targetSlots.length > 0 }"
                            style="height: 100%; align-content: flex-start;"
                            @dragover.prevent="isDragOverTarget = true"
                            @dragleave="isDragOverTarget = false"
                            @drop="onDropTarget"
                        >
                            <div 
                                v-for="(item, index) in targetSlots" 
                                :key="'tgt-' + item.id" 
                                class="sum-token"
                            >
                                <span>{{ item.name }}</span>
                                <span class="sum-token-remove" @click="removeTarget(index)">×</span>
                            </div>

                            <div v-if="targetSlots.length === 0" class="sum-placeholder">
                                将接收总结的目标频道拖拽至此<br>(支持广播至多处)
                            </div>
                        </div>
                    </div>

                </div>

                <div class="sum-col-actions">
                    <div>
                        <div class="sum-col-title">操作预览</div>
                        <div class="sum-preview-box">
                            <div v-if="sourceSlots.length === 0">等待选择源频道...</div>
                            <div v-else>
                                <p>正在融合以下 <span class="sum-preview-highlight">{{ sourceSlots.length }}</span> 个视角的经历：</p>
                                <ul style="padding-left: 15px; margin: 5px 0; font-size: 0.9em; color: #888;">
                                    <li v-for="s in sourceSlots" :key="s.id">{{ s.name }}</li>
                                </ul>
                                <br>
                                <div v-if="targetSlots.length === 0">等待选择注入目标...</div>
                                <div v-else>
                                    <p>生成的总结将广播至：</p>
                                    <ul style="padding-left: 20px; margin-top: 5px;">
                                        <li v-for="t in targetSlots" :key="t.id" class="sum-preview-highlight">
                                            {{ t.name }}
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: 20px;">
                        <div class="sum-col-title">篇幅限制 (字数)</div>
                        <div style="display: flex; gap: 10px; align-items: center; margin-top: 5px;">
                            <input 
                                type="number" 
                                v-model.number="minWords" 
                                class="sum-input-num" 
                                placeholder="Min"
                                title="最小字数"
                            >
                            <span style="color: #666;">-</span>
                            <input 
                                type="number" 
                                v-model.number="maxWords" 
                                class="sum-input-num" 
                                placeholder="Max"
                                title="最大字数"
                            >
                        </div>
                        <div style="font-size: 11px; color: #555; margin-top: 4px;">建议范围: 100 - 500</div>
                    </div>

                    <button 
                        class="sum-btn-execute" 
                        :disabled="!canExecute || isExecuting"
                        @click="executeSummary"
                    >
                        {{ isExecuting ? '正在铭刻...' : '开始总结注入' }}
                    </button>
                </div>

            </div>
        </div>
    </div>
    `,
    setup() {
        // --- 状态定义 ---
        const sourceSlots = ref([]); // 🟢 改为数组，支持多选
        const targetSlots = ref([]);
        const isExecuting = ref(false);

        // 🟢 字数控制
        const minWords = ref(100);
        const maxWords = ref(300);

        // 拖拽状态
        const isDragOverSource = ref(false);
        const isDragOverTarget = ref(false);
        let draggedItemTemp = null; // 临时存储拖拽项

        // --- 计算属性 ---
        const availableChannels = computed(() => {
            return Object.values(ChatData.channels).map(ch => ({
                id: ch.id,
                name: ch.name || ch.id,
                icon: ch.icon || '📝'
            }));
        });

        const canExecute = computed(() => {
            // 只有当源和目标都不为空时才允许执行
            return sourceSlots.value.length > 0 && targetSlots.value.length > 0;
        });

        // --- 拖拽处理 ---
        const onDragStart = (event, item) => {
            draggedItemTemp = item;
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData('text/plain', JSON.stringify(item));
        };

        // 🟢 源槽位放置处理 (支持多选去重)
        const onDropSource = (event) => {
            isDragOverSource.value = false;
            if (draggedItemTemp) {
                const exists = sourceSlots.value.find(s => s.id === draggedItemTemp.id);
                if (!exists) {
                    sourceSlots.value.push(draggedItemTemp);
                }
                draggedItemTemp = null;
            }
        };

        const onDropTarget = (event) => {
            isDragOverTarget.value = false;
            if (draggedItemTemp) {
                const exists = targetSlots.value.find(t => t.id === draggedItemTemp.id);
                if (!exists) {
                    targetSlots.value.push(draggedItemTemp);
                }
                draggedItemTemp = null;
            }
        };

        const removeSource = (index) => {
            sourceSlots.value.splice(index, 1);
        };

        const removeTarget = (index) => {
            targetSlots.value.splice(index, 1);
        };

        // --- 核心执行逻辑 (多对多) ---
        const executeSummary = async () => {
            if (!canExecute.value) return;
            
            isExecuting.value = true;
            
            // 1. 提取 ID 列表
            const sourceIds = sourceSlots.value.map(s => s.id);
            const targetIds = targetSlots.value.map(t => t.id);

            // 2. 调用 Call 模块构建 Payload (传入字数参数)
            const req = Call_Summary.constructRequest(
                sourceIds, 
                targetIds, 
                [minWords.value, maxWords.value]
            );

            if (!req) {
                alert("请求构建失败：无法获取源频道数据。");
                isExecuting.value = false;
                return;
            }

            // 3. 发送请求
            const success = await Game_Manager.sendRequest(req);

            isExecuting.value = false;

            if (success) {
                close();
            }
        };

        const close = () => {
            store.currentMenu = 'none';
        };

        return {
            availableChannels,
            sourceSlots,
            targetSlots,
            minWords,
            maxWords,
            
            isExecuting,
            canExecute,
            isDragOverSource,
            isDragOverTarget,
            
            onDragStart,
            onDropSource,
            onDropTarget,
            removeSource,
            removeTarget,
            executeSummary,
            close
        };
    }
};