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

// src/ui/CharacterCreationOverlay.js
import { ref, computed, watch } from '../../lib/vue.esm-browser.js';
import { store, DIFFICULTY_PRESETS } from './modules/store.js';
import { OPENINGS, DEFAULT_OPENING_ID } from '../config/Opening.js';
import { FemaleConfig } from '../config/FemaleConfig.js';
import { GameDatabase } from '../config/GameDatabase.js';

export default {
    name: 'CharacterCreationOverlay',
    emits: ['start-game', 'back-to-title', 'open-custom-creator'],
    setup(props, { emit }) {
        // ==========================================
        // 1. 状态管理
        // ==========================================
        
        // 玩家自定义输入
        const playerName = ref("洛塔斯");
        
        // 当前选中的开局 ID (默认选中第一个或者配置的默认值)
        const selectedOpeningId = ref(DEFAULT_OPENING_ID);

        // --- 难度选择逻辑 ---
        const selectedDiffIndex = ref(2); // 默认 2 (普通)
        
        // --- 角色人设自定义 (外貌与性格) ---
        // 定义响应式变量
        const customCharacter = ref("");
        const customAppearance = ref("");
        const customObjective = ref("");

        // 🟢 [新增] 文本清洗函数：强制将双引号转换为单引号
        const sanitizeInput = (text) => {
            if (!text) return "";
            return text.replace(/"/g, "'");
        };

        const currentDiffInfo = computed(() => {
            return DIFFICULTY_PRESETS[selectedDiffIndex.value];
        });

        const cycleDiff = (delta) => {
            const newIdx = selectedDiffIndex.value + delta;
            // 确保在 1 (简单) ~ 5 (地狱) 之间
            if (newIdx >= 1 && newIdx < DIFFICULTY_PRESETS.length) {
                selectedDiffIndex.value = newIdx;
            }
        };

        // ==========================================
        // 2. 数据源聚合 (核心：静态 + 动态)
        // ==========================================
        const availableOpenings = computed(() => {
            // 确保 store 中有动态容器 (预留给 LLM 生成的临时开局)
            const dynamic = store.dynamicOpenings || {};
            // 合并对象：静态配置在前，动态生成的在后
            return { ...OPENINGS, ...dynamic };
        });

        // 排序后的开局列表 (用于 v-for)
        const sortedOpeningsList = computed(() => {
            return Object.values(availableOpenings.value);
        });

        // ==========================================
        // 3. 计算属性：当前选中开局的详细预览
        // ==========================================
        
        // 获取当前选中的配置对象
        const currentOpening = computed(() => {
            return availableOpenings.value[selectedOpeningId.value] || availableOpenings.value[DEFAULT_OPENING_ID];
        });

        // 监听开局选择的变化，自动填入该剧本的默认人设
        watch(selectedOpeningId, (newId) => {
            const op = availableOpenings.value[newId] || availableOpenings.value[DEFAULT_OPENING_ID];
            if (op && op.playerConfig) {
                customCharacter.value = op.playerConfig.character || "";
                customAppearance.value = op.playerConfig.appearance || "";
                customObjective.value = op.playerConfig.core_objective || "";
            }
        }, { immediate: true });

        // 状态：当前鼠标悬停的队友对象
        const hoveredCompanion = ref(null);

        // 新增：Tooltip 的屏幕坐标
        const tooltipPos = ref({ x: 0, y: 0 });
        
        let hideTimer = null; // 定时器句柄

        // 新增：显示逻辑 (计算坐标)
        const showTooltip = (event, comp) => {
            // 如果有待执行的关闭操作，立刻取消 (鼠标快速从标签移到了 tooltip 上)
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
            
            hoveredCompanion.value = comp;
            
            // 获取目标元素的位置信息
            const rect = event.target.getBoundingClientRect();
            // 策略：显示在标签的右侧 (避免遮挡下方列表)，并稍微向下错开一点
            tooltipPos.value = {
                x: rect.right + 10, // 标签右侧 + 10px 间距
                y: rect.top         // 与标签顶部对齐
            };
        };

        // 新增：隐藏逻辑 (带 200ms 延迟)
        const hideTooltip = () => {
            hideTimer = setTimeout(() => {
                hoveredCompanion.value = null;
            }, 200); // 给玩家 200ms 的时间移动鼠标进入 Tooltip
        };

        // 新增：保持显示 (当鼠标进入 Tooltip 自身时调用)
        const keepTooltip = () => {
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
        };

        // 计算属性：返回完整的队友配置对象数组
        const detailedCompanions = computed(() => {
            const ids = currentOpening.value.companionIds || [];
            return ids.map(id => {
                const config = FemaleConfig[id];
                // 将 ID 混入返回，方便 key 绑定
                return config ? { id, ...config } : null;
            }).filter(Boolean); // 过滤掉无效 ID
        });

        // 辅助函数：格式化 H 部位开发度 (用于 Tooltip 展示)
        const formatBodyParts = (parts) => {
            if (!parts) return [];
            // 将 { mouth: 0, breast: 5 } 转换为 [{label: 'Mouth', val: 0}, ...]
            // 这里简单映射几个关键部位，你可以根据需要扩展中文映射
            const map = { mouth: '口', breast: '胸', pussy: '穴', anal: '后' };
            return Object.keys(parts).map(key => ({
                label: map[key] || key,
                val: parts[key]
            }));
        };

        // 新增：弹窗控制状态
        const showItemDetails = ref(false);

        // 统一获取物品列表（兼容旧代码，优先使用新 items 字段）
        const rawItemsList = computed(() => {
             return currentOpening.value.items || currentOpening.value.playerConfig?.extraItems || [];
        });

        // 核心：处理混合数据源 (Static ID + Dynamic Object)
        const detailedItems = computed(() => {
            return rawItemsList.value.map(entry => {
                // 情况 A: 静态物品引用
                if (entry.staticId || (!entry.name && entry.id)) {
                    const id = entry.staticId || entry.id;
                    const dbItem = GameDatabase.Items[id] || GameDatabase.Equipment[id];
                    return {
                        name: dbItem ? dbItem.name : "未知物品",
                        count: entry.count || 1,
                        quality: dbItem ? dbItem.quality : 'GRAY', // 默认破败
                        description: dbItem ? dbItem.description : "无描述",
                        isDynamic: false
                    };
                }
                // 情况 B: 动态物品对象
                else {
                    return {
                        name: entry.name,
                        count: entry.count || 1,
                        quality: entry.quality || 'GRAY',
                        description: entry.description || "无描述",
                        isDynamic: true
                    };
                }
            });
        });

        // 预览文本 (仅显示名称 x数量，用逗号分隔)
        const itemPreview = computed(() => {
            if (detailedItems.value.length === 0) return "无";
            // 截取前3个，避免太长
            const summary = detailedItems.value.slice(0, 3).map(i => `${i.name} x${i.count}`).join(", ");
            return detailedItems.value.length > 3 ? `${summary}...` : summary;
        });

        // 预览：初始金币
        const goldPreview = computed(() => {
            return currentOpening.value.playerConfig?.extraGold || 0;
        });

        // 预览：身份文本
        const identityPreview = computed(() => {
            return currentOpening.value.playerConfig?.identity || "冒险者";
        });

        // ==========================================
        // 4. 交互逻辑
        // ==========================================

        const selectOpening = (id) => {
            selectedOpeningId.value = id;
        };

        // 🟢 [新增] 处理点击“自定义开局”
        const handleOpenCustom = () => {
            // 通知父组件切换到 CustomOpeningOverlay
            emit('open-custom-creator');
        };

        const handleStartGame = () => {
            if (!playerName.value.trim()) {
                alert("请输入角色名称");
                return;
            }

            // 🟢 [修改] 准备开局数据，并注入玩家修改后的 人设/外貌
            const finalOpeningData = JSON.parse(JSON.stringify(currentOpening.value));
            
            // 确保 playerConfig 存在
            if (!finalOpeningData.playerConfig) finalOpeningData.playerConfig = {};

            // 覆盖为玩家输入的内容 (同时执行双引号清洗)
            finalOpeningData.playerConfig.character = sanitizeInput(customCharacter.value);
            finalOpeningData.playerConfig.appearance = sanitizeInput(customAppearance.value);
            finalOpeningData.playerConfig.core_objective = sanitizeInput(customObjective.value);

            // 打包完整 Payload
            const payload = {
                playerName: sanitizeInput(playerName.value), // 名字也顺便清洗一下
                openingId: selectedOpeningId.value,
                difficultyParams: currentDiffInfo.value.params,
                openingData: finalOpeningData, // 使用修改后的数据
                timestamp: Date.now()
            };

            // 发送事件给 App.js
            emit('start-game', payload);
        };

        const handleBack = () => {
            emit('back-to-title');
        };

        return {
            playerName,
            selectedOpeningId,
            sortedOpeningsList,
            currentOpening,
            
            // 预览数据
            detailedCompanions, 
            hoveredCompanion, 
            tooltipPos,      
            itemPreview,
            detailedItems,
            showItemDetails,
            goldPreview,
            identityPreview,
            selectedDiffIndex,
            currentDiffInfo,
            customCharacter,
            customAppearance,
            customObjective,
            
            // 方法
            cycleDiff,
            showTooltip,     
            hideTooltip,     
            keepTooltip,    
            handleOpenCustom,
            formatBodyParts, 
            selectOpening,
            handleStartGame,
            handleBack
        };
    },
    // 🟢 [Template 更新] 类名已全部替换为 cc- 前缀
    template: `
    <div class="cc-overlay">
        <div class="cc-header">
            <h2>灵魂契约</h2>
            <div class="cc-subtitle">选择你的命运轨迹，缔结轮回契约</div>
        </div>

        <div class="cc-body">
            <div class="cc-panel-left">
                <div class="cc-panel-title">✦ 灵魂容器</div>
                
                <div class="cc-form-group">
                    <label>契约者真名</label>
                    <input type="text" v-model="playerName" maxlength="12" class="cc-soul-input" placeholder="输入名字..." />
                </div>

                <div class="cc-form-group">
                    <label>外貌描述 (可修改)</label>
                    <textarea 
                        v-model="customAppearance" 
                        class="cc-soul-textarea" 
                        rows="3"
                        placeholder="描述角色的外貌...">
                    </textarea>
                </div>

                <div class="cc-form-group">
                    <label>性格特征 (可修改)</label>
                    <textarea 
                        v-model="customCharacter" 
                        class="cc-soul-textarea" 
                        rows="3"
                        placeholder="描述角色的性格...">
                    </textarea>
                </div>

                <div class="cc-form-group">
                    <label>核心驱动 (Core Objective)</label>
                    <textarea 
                        v-model="customObjective" 
                        class="cc-soul-textarea" 
                        rows="2" 
                        style="border-color: #d4af37;"
                        placeholder="你此行的终极目的是什么？">
                    </textarea>
                </div>

                <div class="cc-form-group">
                    <label>世界法则 (难度)</label>
                    <div class="cc-diff-selector">
                        <button class="cc-arrow-btn" @click="cycleDiff(-1)" :class="{ disabled: selectedDiffIndex <= 1 }">◀</button>
                        <div class="cc-diff-display">
                            <span class="cc-diff-name" :class="'diff-color-' + selectedDiffIndex">{{ currentDiffInfo.label }}</span>
                        </div>
                        <button class="cc-arrow-btn" @click="cycleDiff(1)" :class="{ disabled: selectedDiffIndex >= 5 }">▶</button>
                    </div>
                    <div class="cc-diff-desc">{{ currentDiffInfo.desc }}</div>
                </div>

                <div class="cc-info-card">
                    <div class="cc-info-row">
                        <span class="cc-label">当前身份</span>
                        <span class="cc-value highlight">{{ identityPreview }}</span>
                    </div>
                    <div class="cc-info-row" style="align-items: flex-start;">
                        <span class="cc-label" style="margin-top: 4px;">同行伙伴</span>
                        
                        <div class="cc-companion-list">
                            <span v-if="detailedCompanions.length === 0" class="cc-value">无 (单人行动)</span>

                            <div 
                                v-else
                                v-for="comp in detailedCompanions" 
                                :key="comp.id"
                                class="cc-companion-wrapper"
                            >
                                <span 
                                    class="cc-companion-tag"
                                    @mouseenter="showTooltip($event, comp)"
                                    @mouseleave="hideTooltip"
                                >
                                    {{ comp.base_info.name }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="cc-info-card cc-perks-card">
                    <div class="cc-card-header">初始物资</div>
                    <div class="cc-perk-row">
                        <span class="icon">💰</span>
                        <span>{{ goldPreview }} 金币</span>
                    </div>
                    <div class="cc-perk-row" v-if="itemPreview !== '无'">
                        <span class="icon">🎒</span>
                        <span style="flex:1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 5px;">
                            {{ itemPreview }}
                        </span>
                        <button class="cc-btn-tiny" @click="showItemDetails = true">详情</button>
                    </div>
                </div>
                
                <div class="cc-lore-text">
                    "在无尽的轮回中，每一个选择都通向不同的终焉。准备好了吗，{{ playerName }}？"
                </div>
            </div>

            <div class="cc-panel-right">
                <div class="cc-panel-title">
                    <span>✦ 命运轨迹</span>
                    <span class="cc-dynamic-badge" v-if="sortedOpeningsList.length > 6">Detected Dynamic Fates</span>
                </div>

                <div class="cc-opening-list">
                    <div 
                        v-for="op in sortedOpeningsList" 
                        :key="op.id"
                        class="cc-opening-card"
                        :class="{ 'active': selectedOpeningId === op.id }"
                        @click="selectOpening(op.id)"
                    >
                        <div class="cc-card-header-row">
                            <span class="cc-card-title">{{ op.title }}</span>
                            <div class="cc-tags">
                                <span v-for="tag in op.tags" :key="tag" class="cc-tag">{{ tag }}</span>
                            </div>
                        </div>

                        <div class="cc-card-details" v-if="selectedOpeningId === op.id">
                            <div class="cc-divider"></div>
                            <div class="cc-description">{{ op.description }}</div>
                            <div class="cc-meta-info">
                                <span class="map-hint">📍 {{ op.mapThemeId }}</span>
                            </div>
                        </div>
                    </div>

                    <div 
                        class="cc-opening-card"
                        style="border: 1px dashed #00d2ff; background: rgba(0, 210, 255, 0.05);"
                        @click="handleOpenCustom"
                    >
                        <div class="cc-card-header-row">
                            <span class="cc-card-title" style="color: #00d2ff;">[自选] 虚空投影</span>
                            <div class="cc-tags">
                                <span class="cc-tag" style="color: #00d2ff; border-color: #00d2ff;">Custom</span>
                                <span class="cc-tag">LLM</span>
                            </div>
                        </div>
                        
                        <div class="cc-card-details" style="display: block; animation: none;">
                            <div class="cc-divider" style="background: rgba(0, 210, 255, 0.2);"></div>
                            <div class="cc-description" style="color: #aaccff;">
                                自定义主角身世、能力与随从，请求虚空重构世界线。
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>

        <div class="cc-action-bar">
            <button class="cc-btn cc-btn-cancel" @click="handleBack">放弃轮回</button>
            <button class="cc-btn cc-btn-start" @click="handleStartGame">
                <span>缔结契约</span>
                <div class="cc-btn-glow"></div>
            </button>
        </div>

        <transition name="fade">
            <div class="cc-modal-overlay" v-if="showItemDetails" @click.self="showItemDetails = false">
                <div class="cc-modal">
                    <div class="cc-modal-header">
                        <h3>物资清单</h3>
                        <button class="cc-modal-close" @click="showItemDetails = false">×</button>
                    </div>
                    <div class="cc-modal-list">
                        <div 
                            v-for="(item, idx) in detailedItems" 
                            :key="idx" 
                            class="cc-item-entry"
                            :class="'q-' + item.quality"
                        >
                            <div class="cc-item-top">
                                <span class="cc-item-name">{{ item.name }}</span>
                                <span class="cc-item-count">x{{ item.count }}</span>
                            </div>
                            <div class="cc-item-desc">{{ item.description }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </transition>

        <transition name="fade">
            <div 
                v-if="hoveredCompanion" 
                class="cc-companion-tooltip"
                :style="{ top: tooltipPos.y + 'px', left: tooltipPos.x + 'px' }"
                @mouseenter="keepTooltip"
                @mouseleave="hideTooltip"
            >
                <div class="tooltip-header">
                    <span class="t-name">{{ hoveredCompanion.base_info.name }}</span>
                    <span class="t-identity">{{ hoveredCompanion.base_info.identity }}</span>
                </div>
                
                <div class="tooltip-section">
                    <div class="t-label">外貌</div>
                    <div class="t-text">{{ hoveredCompanion.base_info.appearance }}</div>
                </div>

                <div class="tooltip-section">
                    <div class="t-label">性格与目的</div>
                    <div class="t-text" style="color: #ffd700;">{{ hoveredCompanion.base_info.character }}</div>
                    <div class="t-subtext">"{{ hoveredCompanion.base_info.core_objective }}"</div>
                </div>

                <div class="tooltip-divider"></div>

                <div class="tooltip-h-stats">
                    <div class="h-row">
                        <span>好感度: <b style="color:#ff69b4">{{ hoveredCompanion.h_state_init.affection }}</b></span>
                        <span>堕落度: <b style="color:#a855f7">{{ hoveredCompanion.h_state_init.depravity }}</b></span>
                    </div>
                    <div class="h-row">
                        <span>处女: {{ hoveredCompanion.h_state_init.isVirgin ? '是' : '否' }}</span>
                        <span>次数: {{ hoveredCompanion.h_state_init.sexCount }}</span>
                    </div>
                    <div class="h-parts-grid">
                        <div v-for="part in formatBodyParts(hoveredCompanion.h_state_init.parts)" :key="part.label" class="h-part-item">
                            <span class="hp-label">{{ part.label }}</span>
                            <div class="hp-bar-bg">
                                <div class="hp-bar-fill" :style="{width: Math.min(part.val, 100) + '%'}"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </transition>
    </div>
    `
};