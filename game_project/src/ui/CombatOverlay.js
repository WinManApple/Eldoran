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

// src/ui/CombatOverlay.js
import { CombatManager } from '../battle/CombatManager.js';
import { toRaw } from '../../lib/vue.esm-browser.js';

export default {
    name: 'CombatOverlay',
    props: ['playerData', 'enemyData'], 
    emits: ['battle-end', 'open-saves'],
    
    data() {
        return {
            showSettlement: false, // 控制按钮组的显示
            battleResult: null     // 存储战斗结果
        };
    },

    methods: {
        // 🟢 玩家点击 "确认离开" (Vue 直接接管)
        onConfirm() {
            console.log("👆 [CombatOverlay] 玩家点击确认，调用 manager.finishBattle()");
            
            // 1. 先让管理器完成数据回写 (它会同步 HP/MP 并准备好 resultData)
            if (this.manager) {
                // finishBattle 会触发下面的 callback
                this.manager.finishBattle();
            } else {
                // 兜底
                this.$emit('battle-end', { outcome: 'victory', items: [] });
            }
        },
        
        onRestart() {
            this.showSettlement = false;
            this.manager.resetAndRestart();
        },
        
        onLoad() {
            this.$emit('open-saves');
        },
        
        onMainMenu() {
            this.manager.finishBattle('defeat_main_menu');
        }
    },

    // 🟢 模板：使用 fixed 定位与 v-if 按钮，确保绝对安全
    template: `
    <div class="combat-overlay-root" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999; background-color: #0a0a12; pointer-events: auto;">
        
        <div class="container">
            <div class="battle-header">
                <div class="turn-counter">回合：<span id="turn-count">1</span></div>
                <div class="battle-info">
                    状态：<span id="phase-indicator">等待指令</span> 
                    <span style="font-size: 0.8em; color: #66ccff;">(<span id="current-actor">...</span>)</span>
                </div>
                <div class="timeline-container">
                    <div class="timeline-label">本回合行动顺序预测</div>
                    <div class="timeline" id="timeline-bar"></div>
                </div>
            </div>
            
            <div class="player-team">
                <div class="team-header">玩家队伍</div>
                <div id="player-container"></div>
            </div>
            
            <div class="battle-area">
                <div class="enemy-team">
                    <div id="enemy-container" style="display: flex; flex-wrap: wrap; justify-content: space-around; gap: 15px; width: 100%;"></div>
                </div>
                <div class="battle-log" id="battle-log"></div>
            </div>
            
            <div class="action-panel">
                <div class="action-section">
                    <div class="section-title">基本行动</div>
                    <div class="action-grid">
                        <button class="action-button attack-btn" id="attack-btn">攻击</button>
                        <button class="action-button defend-btn" id="defend-btn">防御</button>
                        <button class="action-button skill-btn" id="skill-btn">技能</button>
                        <button class="action-button item-btn" id="item-btn">道具</button>
                        <button class="action-button flee-btn" id="flee-btn">逃跑</button>
                    </div>
                </div>
                
                <div class="action-section">
                    <div class="section-title">指令面板</div>
                    <div class="current-actor-info">
                        <div id="current-player-info" style="text-align: center;">等待回合开始...</div>
                        <div class="command-btn-group" style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
                            <button id="replan-btn" class="action-button" 
                                style="display: none; background-color: #553333; border-color: #884444; width: 100%; text-align: center;">
                                重新规划
                            </button>
                            <button id="start-turn-btn" class="start-turn-btn" style="width: 100%;">开始回合战斗</button>
                        </div>
                    </div>
                </div>
                
                <div class="action-section">
                    <div class="section-title">道具库存</div>
                    <div class="item-inventory" id="inventory-list-container"></div>
                </div>
            </div>
        </div>
        
        <div class="skill-panel" id="skill-panel">
            <button class="close-panel" id="close-skill-panel">×</button>
            <h3>选择技能</h3>
            <div class="skill-list" id="skill-list-container"></div>
        </div>
        
        <div class="item-panel" id="item-panel">
            <button class="close-panel" id="close-item-panel">×</button>
            <h3>选择道具</h3>
            <div class="item-list" id="item-list-container"></div>
        </div>
        
        <div class="battle-end" id="battle-end" :class="{ active: showSettlement }">
            <h2 id="battle-result">战斗结算</h2>
            <p id="result-message">...</p>
            
            <div class="battle-stats" id="battle-stats">
                <p>总回合数：<span id="total-turns">0</span></p>
                <p>造成总伤害：<span id="total-damage">0</span></p>
                <p>受到总伤害：<span id="damage-taken">0</span></p>
                <p>使用道具数：<span id="items-used">0</span></p>
            </div>

            <div class="loot-section" id="loot-section" style="display: none;">
                <h3>获得战利品</h3>
                <div class="loot-grid" id="loot-list"></div>
            </div>

            <div class="safe-btn-group" 
                 v-if="showSettlement" 
                 style="margin-top: 20px; display: flex; justify-content: center; gap: 20px; width: 100%;">
                
                <button v-if="battleResult === 'victory' || battleResult === 'escaped' || (typeof battleResult === 'object' && battleResult.outcome === 'escaped')"
                        class="action-button confirm-btn" 
                        style="background-color: #2e7d32; display: inline-block; padding: 12px 40px; font-size: 1.2em; border: 2px solid #4caf50; box-shadow: 0 4px 15px rgba(0,0,0,0.8); cursor: pointer;" 
                        @click="onConfirm">
                    确认离开
                </button>
                
                <button class="action-button restart-btn" v-if="battleResult === 'defeat'" @click="onRestart">重新挑战</button>
                <button class="action-button" v-if="battleResult === 'defeat'" @click="onLoad">读取存档</button>
                <button class="action-button" v-if="battleResult === 'defeat'" @click="onMainMenu">回到主界面</button>
            </div>
        </div>

    </div>
    `,
    
    mounted() {
        console.log("⚔️ CombatOverlay (Final Fix) 已挂载");
        this.manager = new CombatManager();
        
        // 🟢 注册钩子：当 BattleState.endBattle 执行时，通知 Vue 显示按钮
        this.manager.onBattleOver = (result) => {
            console.log("[CombatOverlay] 收到 onBattleOver 信号:", result);
            this.battleResult = result;
            this.showSettlement = true; // 触发 v-if 渲染按钮
        };

        this.$nextTick(() => {
            // 启动战斗
            // 这里的 callback 是 finishBattle 执行后的最终回调
            this.manager.startBattle(this.playerData, this.enemyData, (finalData) => {
                console.log("[CombatOverlay] 收到最终数据 (finishBattle完成):", finalData);
                // 🟢 只有这一步会触发 App.js 的 handleBattleEnd
                this.$emit('battle-end', toRaw(finalData));
            });
        });
    },
    
    beforeUnmount() {
        if (this.manager) {
            this.manager.cleanup();
        }
    }
};