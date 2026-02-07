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

// src/ui/SaveLoadOverlay.js
import { store } from './modules/store.js';

export default {
    name: 'SaveLoadOverlay',
    template: `
    <transition name="fade">
        <div class="save-manager-overlay">
            <div class="save-container">
                <header class="save-header">
                    <button class="save-back-btn" @click="$emit('close')">
                        <i class="fas fa-arrow-left"></i> 返回
                    </button>
                    <div class="save-title">
                        <h1>记忆回路</h1>
                        <p>选择一个时间点重塑命运</p>
                    </div>
                </header>
                <div class="save-main-content">
                    <div class="save-list-section">
                        <div class="save-scroll-container">
                            <div v-for="save in currentList"
                                :key="save.id"
                                class="save-item"
                                :class="{ active: saveSystem.selectedId === save.slot_id, empty: !save.timestamp }"
                                @click="selectSaveSlot(save)">
                                <div>
                                    <div style="color:#E8DFCA; font-weight:bold; font-size:1.1rem;">
                                        {{ save.name || '空插槽' }}
                                    </div>
                                    <div style="color:#888; font-size:0.9rem;">
                                        {{ save.timestamp || '--/--' }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="save-actions">                      
                        <button v-if="(!previewData || !previewData.timestamp) && isIngame" 
                                class="rpg-btn primary save-action-btn"
                                @click="$emit('save')">
                            <i class="fas fa-save"></i> 新建存档
                        </button>

                        <div v-else-if="previewData && previewData.timestamp && isIngame" 
                            style="display:flex; gap:15px; width:100%;">
                            <button class="rpg-btn danger save-action-btn" @click="$emit('save')">
                                <i class="fas fa-file-export"></i> 覆盖存档
                            </button>
                            <button class="rpg-btn primary save-action-btn" @click="$emit('load')">
                                <i class="fas fa-file-import"></i> 读取记忆
                            </button>
                        </div>

                        <button v-else-if="previewData && previewData.timestamp && !isIngame" 
                                class="rpg-btn primary save-action-btn"
                                @click="$emit('load')">
                            <i class="fas fa-play"></i> 读取记忆
                        </button>

                        <button v-else 
                                class="rpg-btn save-action-btn disabled" 
                                disabled>
                            请选择存档
                        </button>

                        <button class="rpg-btn save-action-btn" 
                            :disabled="!previewData || !previewData.timestamp"
                            @click="$emit('delete')" 
                            title="永久删除该存档">
                            删除
                        </button>
                    </div>
                    
                </div>
            </div>
        </div>
    </transition>
    `,
    computed: {
        saveSystem() { return store.saveSystem; },
        isIngame() { return store.isIngame; },
        previewData() { return store.saveSystem.previewData; },
        currentList() {
            return this.saveSystem.manualList;
        }
    },
    setup() {

        const selectSaveSlot = (save) => {
            store.saveSystem.selectedId = save.slot_id;
            store.saveSystem.previewData = save;
        };

        return {
            store,
            selectSaveSlot
        };
    }
};