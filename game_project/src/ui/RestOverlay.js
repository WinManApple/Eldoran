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

// src/ui/RestOverlay.js
import { RestSystem } from '../systems/RestSystem/RestSystem.js';
import { store } from './modules/store.js';
import { computed, ref } from '../../lib/vue.esm-browser.js';
import { HInteractionSystem } from '../systems/HInteractionSystem/HInteractionSystem.js';

export const RestOverlay = {
    name: 'RestOverlay',
    template: `
    <div class="rest-backdrop" v-if="isOpen">
        <div class="rest-container">
            
            <div class="rest-header">
                <div class="location-box">
                    <span class="icon">🔥</span>
                    <span class="location-name">{{ nodeName }}</span>
                </div>
                <div class="gold-display">
                    <span class="label">持有金币:</span>
                    <span class="value">{{ gold }}</span>
                </div>
            </div>

            <div class="rest-main">
                
                <div class="rest-panel recovery-panel">
                    <h3 class="panel-title">全队整备</h3>
                    <div class="party-status-list">
                        <div v-for="member in party" :key="member.id" class="member-status-card">
                            <div class="member-info">
                                <span class="member-name">{{ member.name }}</span>
                                <span class="member-level">Lv.{{ member.level }}</span>
                            </div>
                            <div class="bar-group">
                                <div class="bar-label">HP {{ Math.floor(member.hp) }}/{{ member.maxHp }}</div>
                                <div class="bar-track hp">
                                    <div class="bar-fill" :style="{ width: (member.hp / member.maxHp * 100) + '%' }"></div>
                                </div>
                            </div>
                            <div class="bar-group">
                                <div class="bar-label">MP {{ Math.floor(member.mp) }}/{{ member.maxMp }}</div>
                                <div class="bar-track mp">
                                    <div class="bar-fill" :style="{ width: (member.mp / member.maxMp * 100) + '%' }"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <button class="ro-action-btn ro-btn-rest" @click="onRest" :disabled="gold < restCost">
                        <div class="btn-content">
                            <span class="btn-text">全队整备</span> <span class="btn-cost">💰 {{ restCost }}</span>
                        </div>
                    </button>

                </div>

                <div class="rest-panel interaction-panel">
                    <h3 class="panel-title">情感互动</h3>
                    
                    <div class="companion-list">
                        <div v-if="femaleCompanions.length === 0" class="empty-msg">
                            当前没有可以互动的伙伴
                        </div>
                        
                        <div 
                            v-for="char in femaleCompanions" 
                            :key="char.id" 
                            class="companion-card"
                            :class="{ selected: isSelected(char.id) }"
                            @click="toggleSelection(char.id)"
                        >
                            <div class="comp-detail">
                                <span class="comp-name">{{ char.name }}</span>
                            </div>
                        </div>
                    </div>

                    <button 
                        class="ro-action-btn ro-btn-interact" 
                        @click="onStartH" 
                        :disabled="selectedIds.length === 0"
                    >
                        ❤️ 亲密互动 ({{ selectedIds.length }})
                    </button>
                </div>

            </div>

            <div class="rest-footer">
                <button class="ro-action-btn ro-btn-leave" @click="onLeave">
                    离开
                </button>
            </div>

        </div>
    </div>
    `, 
    setup() {
        // --- 数据绑定 ---
        const isOpen = computed(() => RestSystem.isOpen);
        const nodeName = computed(() => RestSystem.currentNode?.name || "未知营地");
        const gold = computed(() => store.playerState.gold);
        const party = computed(() => store.party);
        const restCost = computed(() => RestSystem.restCost);

        // 筛选女性伙伴
        const femaleCompanions = computed(() => {
            return store.party.filter(m => m.sex === 'female' && m.id !== 'player_1');
        });

        // 🟢 [新增] 选中的角色 ID 列表 (响应式)
        const selectedIds = ref([]);

        // 🟢 [新增] 选中状态判断
        const isSelected = (id) => selectedIds.value.includes(id);

        // 🟢 [新增] 切换选中/取消
        const toggleSelection = (id) => {
            const index = selectedIds.value.indexOf(id);
            if (index === -1) {
                selectedIds.value.push(id);
            } else {
                selectedIds.value.splice(index, 1);
            }
        };

        // --- 交互方法 ---
        const onRest = () => {
            RestSystem.executeRest();
        };

        // 🟢 [修改] 新的 H 启动逻辑 (多人)
        const onStartH = () => {
            if (selectedIds.value.length === 0) return;

            // 调用 HSystem.startInteraction，传入数组
            // 第二个参数是事件名，第三个是上下文配置
            HInteractionSystem.startInteraction(
                selectedIds.value, // 传入 ID 数组
                "营地休憩", 
            );
            
            // 启动后建议关闭休息界面，或者保持开启取决于设计
            // 这里建议关闭 Rest 界面，让出屏幕给 H 界面
            // RestSystem.close(); 
        };

        const onLeave = () => {
            // 关闭界面时清空选择
            selectedIds.value = []; 
            RestSystem.close();
        };

        return {
            isOpen,
            nodeName,
            gold,
            party,
            restCost,
            femaleCompanions,
            // 🟢 导出新变量和方法
            selectedIds,
            isSelected,
            toggleSelection,
            onRest,
            onStartH,
            onLeave
        };
    }
};