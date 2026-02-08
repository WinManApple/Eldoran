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

// src/ui/HInteractionOverlay.js
import { HInteractionSystem } from '../systems/HInteractionSystem/HInteractionSystem.js';
import { H_Data } from './modules/H_Data.js'; // 引入数据层
import { store, addLog } from './modules/store.js';
import { ref, computed, nextTick, watch } from '../../lib/vue.esm-browser.js';
import { Call_H_Interaction } from '../../src/LLM/calls/Call_H_Interaction.js';
import { H_State_Memory } from '../../src/LLM/memory/H_State_Memory.js';


export const HInteractionOverlay = {
    name: 'HInteractionOverlay',
    template: `
    <div class="h-backdrop" v-if="isActive" @click.stop>
        <div class="h-container" @click.stop>

            <div class="h-header-bar">
                <div class="info-item">
                    <span class="icon">📍</span>
                    <span class="text">{{ context.location }}</span>
                </div>
                <div class="info-divider"></div>
                <div class="info-item">
                    <span class="icon">🕒</span>
                    <span class="text">{{ context.time }}</span>
                </div>
            </div>    

            <div class="h-monitor-panel">
                
                <div class="char-info-group">
                    <div class="char-box-simple" 
                         :class="{ 'interactive': isMultiplayer }"
                         @click="toggleNextChar"
                         :title="isMultiplayer ? '点击切换角色' : ''">
                        
                        <div class="char-name-text">
                            {{ targetName }}
                            <span v-if="isMultiplayer" style="font-size: 0.7em; opacity: 0.6; margin-left: 5px;">
                                {{ charCounterText }}
                            </span>
                        </div>
                    </div>

                    <div class="h-stat-tooltip">
                        <div class="tooltip-header">◇ 深度情报 ◇</div>
                        
                        <div class="tooltip-row">
                            <span>好感度 (Affection)</span>
                            <span class="val">{{ longTermStats.affection || 0 }}</span>
                        </div>
                        <div class="tooltip-row">
                            <span>堕落度 (Depravity)</span>
                            <span class="val">{{ longTermStats.depravity || 0 }}</span>
                        </div>
                        <div class="tooltip-row">
                            <span>性经验 (Count)</span>
                            <span class="val">{{ longTermStats.sexCount || 0 }}</span>
                        </div>

                        <div class="tooltip-divider"></div>

                        <div class="tooltip-grid">
                            <div v-for="(label, key) in partMap" :key="key" class="part-item">
                                <span class="part-name">{{ label }}</span>
                                <span class="part-val" :class="getDevColor(longTermStats.parts ? longTermStats.parts[key] : 0)">
                                    {{ longTermStats.parts ? (longTermStats.parts[key] || 0) : 0 }}
                                </span>
                            </div>
                            <div v-if="currentSexuality && currentSexuality.length > 0">
                            <div class="tooltip-divider"></div>
                            <div class="tooltip-header">◇ 潜在性癖 ◇</div>
                            <div class="sexuality-tags-container">
                                <span v-for="(tag, index) in currentSexuality" :key="index" class="sexuality-tag">
                                    {{ tag }}
                                </span>
                            </div>
                        </div>
                        </div>
                    </div>
                </div>

                <div class="stats-grid">
                    <div class="stat-row">
                        <span class="stat-label">体力</span>
                        <div class="stat-track">
                            <div class="stat-fill stamina" :style="{ width: stats.stamina + '%' }"></div>
                        </div>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">理智</span>
                        <div class="stat-track">
                            <div class="stat-fill sanity" :style="{ width: stats.sanity + '%' }"></div>
                        </div>
                    </div>
                    <div class="stat-row large">
                        <span class="stat-label icon">♥</span>
                        <div class="stat-track">
                            <div class="stat-fill pleasure" :style="{ width: stats.pleasure + '%' }"></div>
                        </div>
                        <span class="stat-val">{{ Math.floor(stats.pleasure) }}%</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">兴奋</span>
                        <div class="stat-track">
                            <div class="stat-fill excitement" :style="{ width: stats.excitement + '%' }"></div>
                        </div>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">羞耻</span>
                        <div class="stat-track">
                            <div class="stat-fill shame" :style="{ width: stats.shame + '%' }"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="h-stage-panel" ref="logContainer" @click="handlePanelClick">
                <div class="log-wrapper">
                    <div v-for="(log, index) in logs" :key="index" 
                         class="h-log-item" 
                         :class="log.role">
                        
                        <div class="log-content-box">
                            <div class="log-name" v-if="log.role === 'ai'">{{ log.name || targetName }}</div>
                            <div class="log-name" v-if="log.role === 'user'">YOU</div>
                            <div class="log-text">{{ log.text }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="h-console-panel">
                
                <div class="h-input-area" v-if="status === 'WAITING_FOR_USER' && isAllRevealed">
                    <textarea 
                        v-model="inputMessage" 
                        placeholder="输入你的行动或言语..."
                        @keydown.enter.exact.prevent="sendMessage"
                    ></textarea>
                    <button class="h-send-btn" @click="sendMessage">
                        <span>➤</span>
                    </button>
                </div>

                <div class="choice-area" v-else-if="status === 'WAITING_FOR_CHOICE' && isAllRevealed">
                    <div class="h-choice-grid">
                        <button 
                            v-for="(choice, idx) in currentChoices" 
                            :key="idx"
                            class="h-choice-btn"
                            @click="handleChoiceClick(choice)"
                        >
                            {{ choice.label }}
                        </button>
                    </div>
                </div>

                <div class="continue-hint" v-else-if="!isAllRevealed" @click="handlePanelClick">
                    <div class="blink-text">▶ 点击屏幕继续...</div>
                </div>

                <div class="loading-area" v-else>
                    <div class="loading-bar-container">
                        <div class="loading-text">{{ isWaitingSettlement ? '正在结算...' : '少女反应中...' }}</div>
                        <div class="loading-bar-indeterminate"></div>
                    </div>
                </div>

                <div class="action-bar">
                    <div class="spacer"></div>
                    <button class="ctrl-btn leave" @click="handleLeave" title="结束互动">
                        🚪 离开
                    </button>
                </div>
            </div>
            
            <transition name="fade">
                <div class="h-settlement-modal" v-if="status === 'SETTLEMENT' && settlementResult">
                    
                    <div class="settlement-header">
                        <div class="settlement-title">✦ 互动结契 ✦</div>
                        <div class="settlement-score">{{ settlementResult.evaluation.score }}</div>
                        <div class="settlement-rank">SCORE</div>
                    </div>

                    <div class="settlement-body">
                        <div class="ai-comment-box">
                            <div class="label">◇ 恶魔的评价 ◇</div>
                            <div class="text">"{{ settlementResult.evaluation.comment }}"</div>
                        </div>

                        <div class="rewards-box" v-if="settlementResult.evaluation.rewards">
                            <div class="label">◇ 获得馈赠 ◇</div>
                            <div class="reward-list">
                                <div class="reward-item exp" v-if="settlementResult.evaluation.rewards.exp">
                                    <span class="icon">✨</span>
                                    <span>经验值 +{{ settlementResult.evaluation.rewards.exp }}</span>
                                </div>
                                <div class="reward-item item" v-for="(item, idx) in settlementResult.evaluation.rewards.items" :key="idx">
                                    <span class="icon">🎁</span>
                                    <span>{{ item.name }} x{{ item.count || 1 }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="settlement-footer">
                        <button class="finish-btn" @click="handleLeave">
                            结束回忆
                        </button>
                    </div>
                </div>
            </transition>

        </div>
    </div>
    `,
    setup() {
        // --- 1. 核心状态绑定 ---
        const isActive = computed(() => HInteractionSystem.isActive);
        const context = computed(() => HInteractionSystem.context);
        const status = computed(() => HInteractionSystem.status);
        const settlementResult = computed(() => HInteractionSystem.settlementResult); // 补充
        const currentChoices = computed(() => HInteractionSystem.currentChoices);     // 补充
        
        // --- 2. 多人相关状态 (新逻辑) ---
        const allCharIds = computed(() => HInteractionSystem.targetCharIds || []);
        const activeCharId = computed(() => HInteractionSystem.activeCharId);
        const isMultiplayer = computed(() => allCharIds.value.length > 1);

        // --- 3. 动态获取当前聚焦角色的短期属性 ---
        const stats = computed(() => {
            const currentId = activeCharId.value;
            // 从 Map 中获取，带兜底
            if (currentId && HInteractionSystem.statsMap && HInteractionSystem.statsMap[currentId]) {
                return HInteractionSystem.statsMap[currentId];
            }
            // 默认兜底
            return { stamina: 100, sanity: 100, pleasure: 0, excitement: 0, shame: 0 };
        });
        
        // --- 4. 动态获取当前聚焦角色的长期属性 ---
        const longTermStats = computed(() => {
            const currentId = activeCharId.value;
            if (currentId && store.hData && store.hData[currentId]) {
                return store.hData[currentId]; 
            }
            return { affection: 0, depravity: 0, sexCount: 0, parts: {} };
        });

        // 🟢 [新增] 动态获取当前聚焦角色的性癖标签
        const currentSexuality = computed(() => {
            const id = activeCharId.value;
            if (!id) return [];
            // 调用 Memory 模块获取数据
            return H_State_Memory.getSexuality(id) || [];
        });

        // --- 5. 动态获取当前聚焦角色的名字 ---
        const targetName = computed(() => {
            const id = activeCharId.value;
            if (!id) return '???';
            
            // 优先查 store.party
            if (store.party && Array.isArray(store.party)) {
                const char = store.party.find(c => c.id === id);
                if (char) return char.name;
            }
            // 查不到就查 store.hData
            if (store.hData && store.hData[id] && store.hData[id].name) {
                return store.hData[id].name;
            }
            return id; 
        });

        // --- 6. 切换下一个角色 (Action) ---
        const toggleNextChar = () => {
            if (!isMultiplayer.value) return;
            
            const ids = allCharIds.value;
            const currentIdx = ids.indexOf(activeCharId.value);
            const nextIdx = (currentIdx + 1) % ids.length;
            
            HInteractionSystem.activeCharId = ids[nextIdx];
        };

        const charCounterText = computed(() => {
            if (!isMultiplayer.value) return "";
            const ids = allCharIds.value;
            const idx = ids.indexOf(activeCharId.value);
            return `(${idx + 1}/${ids.length})`;
        });

        // --- 7. 日志与滚动逻辑 (修复部分) ---
        const logContainer = ref(null); // 定义 ref
        const inputMessage = ref("");   // 定义输入框 ref
        
        // 🟢 [新增] 本地状态：是否正在等待结算
        const isWaitingSettlement = ref(false);

        // 🟢 [新增] 监听状态变化：如果系统成功进入结算界面，重置等待标记
        watch(status, (newVal) => {
            if (newVal === 'SETTLEMENT') {
                isWaitingSettlement.value = false;
            }
        });

        // 获取完整日志源
        const fullLogs = computed(() => H_Data.getCurrentLogs());

        // 根据 visibleCount 切片，实现逐行显示
        const displayLogs = computed(() => {
            const session = H_Data.currentSession;
            if (!session) return [];
            return fullLogs.value.slice(0, session.visibleCount);
        });

        // 判断是否所有文本都已显示
        const isAllRevealed = computed(() => {
            const session = H_Data.currentSession;
            if (!session) return true;
            return session.visibleCount >= fullLogs.value.length;
        });

        // 自动滚动监听
        watch(displayLogs, () => {
             nextTick(() => {
                if (logContainer.value) {
                    logContainer.value.scrollTop = logContainer.value.scrollHeight;
                }
            });
        }, { deep: true });

        // 点击面板触发“下一条”
        const handlePanelClick = () => {
            H_Data.revealLog(); // 假设 H_Data 中实现了 revealLog，如果没有，请确保加上
        };

        // --- 8. 交互 Action (补充缺失的方法) ---
        const sendMessage = () => {
            const text = inputMessage.value.trim();
            if (!text) return;

            // 调用 LLM 接口
            // 注意：多P模式下，默认只发文本，System 会在 requestInteraction 时收集所有角色状态
            Call_H_Interaction.requestInteraction(text, 'NORMAL'); // 需导入 Call_H_Interaction

            // 本地先上屏 (可选，或者等 LLM 返回)
            H_Data.addMessage('user', text);
            
            inputMessage.value = "";
            
            // 切换状态为 PROCESSING (防止重复提交)
            HInteractionSystem.status = 'PROCESSING';
        };

        const handleChoiceClick = (choice) => {
            HInteractionSystem.handleChoice(choice);
        };

        const handleLeave = () => {
            // 🟢 [新增] 拦截重复点击
            if (isWaitingSettlement.value) {
                addLog("结算正在进行，请耐心等待...");
                return;
            }

            if (status.value === 'SETTLEMENT') {
                // 结算界面点击结束：直接关闭
                // (注意：Call END 在此处通常不需要再次发送，除非是为了彻底断开连接，保持原逻辑或简化均可)
                HInteractionSystem.endInteraction();
            } else {
                // 游戏中途离开
                if (confirm("确定要中断当前的互动吗？")) {
                    Call_H_Interaction.requestInteraction(null, 'END');
                    
                    // 🟢 [新增] 锁定 UI 并显示结算提示
                    HInteractionSystem.status = 'PROCESSING'; // 强制切到 Loading 视图
                    isWaitingSettlement.value = true;         // 切换文案为"正在结算..."
                }
            }
        };

        // --- 9. 辅助逻辑 ---
        const partMap = {
            clitoris: '阴蒂', vagina: '阴道', uterus: '子宫',
            anus: '菊穴', mouth: '口腔', nipples: '乳头', breasts: '乳房'
        };

        const getDevColor = (val) => {
            if (val >= 100) return 'dev-high';
            if (val >= 50) return 'dev-mid';
            return 'dev-low';
        };


        // --- 10. 导出 ---
        return {
            // 状态
            isActive,
            status,
            context,
            isMultiplayer,
            
            // 角色数据
            stats,
            longTermStats,
            currentSexuality,
            targetName,
            charCounterText,
            
            // 日志与交互
            logs: displayLogs, // 修正导出名
            logContainer,
            isAllRevealed,
            currentChoices,
            inputMessage,
            settlementResult,
            isWaitingSettlement,

            // 方法
            toggleNextChar,
            handlePanelClick,
            sendMessage,
            handleChoiceClick,
            handleLeave,
            getDevColor,

            // 常量
            partMap
        };
    }
};