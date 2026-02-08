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

// src/ui/SettingsOverlay.js
import { ref, computed, reactive } from '../../lib/vue.esm-browser.js';
import { store, RESOLUTIONS, DIFFICULTY_PRESETS } from './modules/store.js';

export default {
    name: 'SettingsOverlay',
    template: `
    <transition name="fade">
        <div class="sub-menu">
            <div class="panel settings-panel">
                <h2 class="panel-title">系统设置</h2>
                
                <div v-for="module in settingModules" :key="module.id" class="setting-block">
                    
                    <div v-if="module.type === 'resolution-selector'" class="setting-row">
                        <label>{{ module.title }}</label>
                        <div class="res-buttons">
                            <button v-for="(res, index) in module.data.options" :key="index" 
                                    class="rpg-btn small" 
                                    :class="{ active: module.data.currentIdx === index }"
                                    @click="module.actions.apply(index)">
                                {{ res.width }}x{{ res.height }}
                            </button>
                        </div>
                    </div>

                    <div v-else-if="module.type === 'difficulty-slider'" class="setting-row" style="flex-direction: column; align-items: flex-start;">
                        <label>{{ module.title }}</label>
                        <div class="setting-diff-wrapper" style="width: 100%; box-sizing: border-box;">
                            <div class="diff-slider-container">
                                <input type="range" 
                                       :min="module.data.min" :max="module.data.max" step="1" 
                                       v-model.number="module.data.value" 
                                       @input="module.actions.onChange"
                                       class="diff-slider">
                                
                                <div class="diff-current-label" :class="'diff-bg-' + module.data.value">
                                    {{ module.data.getCurrentLabel() }}
                                </div>
                            </div>
                            <div style="font-size: 12px; color: #aaa; margin-top: 5px;">
                                {{ module.data.getCurrentDesc() }}
                            </div>
                        </div>
                    </div>

                    <div v-else-if="module.type === 'dev-panel'">
                        <div class="dev-mode-toggle">
                            <label style="cursor: pointer; display: flex; align-items: center;">
                                <input type="checkbox" v-model="module.data.isEnabled" class="dev-checkbox">
                                {{ module.title }}
                            </label>
                        </div>

                        <div v-if="module.data.isEnabled" class="dev-panel-zone">
                            <span class="dev-warning">⚠️ 警告：直接修改核心参数可能导致游戏崩坏</span>
                            
                            <div v-for="(param, pKey) in module.data.params" :key="pKey" class="dev-param-row">
                                <span>{{ param.label }}</span>
                                <input type="number" 
                                    v-model.number="store.config.battle[param.category][param.key]" 
                                    :step="param.step" 
                                    class="dev-input">
                            </div>
                        </div>
                    </div>

                    <div v-if="module.hasSeparator" style="border-top: 1px solid rgba(255,255,255,0.1); margin: 15px 0;"></div>

                </div>
                
                <div class="panel-footer">
                    <button class="rpg-btn" @click="$emit('close')">确认并返回</button>
                </div>
            </div>
        </div>
    </transition>
    `,
    setup(props, { emit }) {
        // ==========================================
        // 1. 难度配置数据源 (Difficulty Logic)
        // ==========================================
        const selectedDiffLevel = ref(2); // 默认普通

        // 初始化难度反推逻辑
        const initDiffFromConfig = () => {
            if (!store.config || !store.config.battle) return;
            const currentHpMult = store.config.battle.Difficulty.enemyHpMultiplier;
            const foundIndex = DIFFICULTY_PRESETS.findIndex((p, idx) => idx > 0 && Math.abs(p.params.enemyHpMultiplier - currentHpMult) < 0.1);
            if (foundIndex !== -1) selectedDiffLevel.value = foundIndex;
        };
        initDiffFromConfig();

        // ==========================================
        // 2. 模块化配置列表 (Feature Modules)
        // ==========================================
        const settingModules = reactive([
            // --- 模块 1: 窗口分辨率 ---
            {
                id: 'resolution',
                type: 'resolution-selector',
                title: '窗口大小',
                hasSeparator: false,
                data: {
                    options: RESOLUTIONS,
                    // 使用 getter 实时获取 store 中的状态
                    get currentIdx() { return store.settings.resolutionIdx; } 
                },
                actions: {
                    apply: (index) => {
                        store.settings.resolutionIdx = index;
                        emit('resolution-change', index);
                    }
                }
            },
            
            // --- 模块 2: 战斗难度 ---
            {
                id: 'difficulty',
                type: 'difficulty-slider',
                title: '战斗难度',
                hasSeparator: false, // 是否在下方显示分隔线
                data: {
                    min: 1,
                    max: 5,
                    value: selectedDiffLevel, // 直接绑定 ref
                    getCurrentLabel: () => {
                        const p = DIFFICULTY_PRESETS[selectedDiffLevel.value];
                        return p ? p.label : "未知";
                    },
                    getCurrentDesc: () => {
                        const p = DIFFICULTY_PRESETS[selectedDiffLevel.value];
                        return p ? p.desc : "";
                    }
                },
                actions: {
                    onChange: () => {
                        const preset = DIFFICULTY_PRESETS[selectedDiffLevel.value];
                        if (preset && store.config?.battle) {
                            const diff = store.config.battle.Difficulty;
                            Object.assign(diff, preset.params);
                            console.log(`[Settings] 难度已调整为: ${preset.label}`);
                        }
                    }
                }
            },

            // --- 模块 3: 开发者模式 ---
            {
                id: 'dev_mode',
                type: 'dev-panel',
                title: '启用开发者上帝模式 (Developer Mode)',
                hasSeparator: true,
                data: {
                    isEnabled: false,
                    // 定义需要暴露给开发者修改的参数映射
                    params: [
                        // ===原有参数 (需要补充 category: 'Difficulty')===
                        { label: '玩家伤害倍率 (Player Dmg)', key: 'playerDamageMultiplier', category: 'Difficulty', step: 0.1 },
                        { label: '敌人伤害倍率 (Enemy Dmg)', key: 'enemyDamageMultiplier', category: 'Difficulty', step: 0.01 },
                        { label: '敌人血量倍率 (Enemy HP)', key: 'enemyHpMultiplier', category: 'Difficulty', step: 0.1 },
                        { label: '经验获取倍率 (XP Gain)', key: 'xpGainMultiplier', category: 'Difficulty', step: 0.1 },

                        // ===新增参数 (根据 BattleConfig.js 的结构分类)===
                        // 1. 逃跑率 (位于 Mechanics)
                        { label: '基础逃跑率 (0.0-1.0)', key: 'baseFleeChance', category: 'Mechanics', step: 0.1 },
                        
                        // 2. 属性克制 (位于 Mechanics)
                        { label: '属性克制倍率 (Element Adv)', key: 'elementalAdvantage', category: 'Mechanics', step: 0.1 },
                        
                        // 3. 暴击率 (位于 RNG)
                        { label: '基础暴击率 (Base Crit)', key: 'baseCritRate', category: 'RNG', step: 0.05 },
                        
                        // 4. 暴击伤害 (位于 RNG)
                        { label: '暴击伤害倍率 (Crit Dmg)', key: 'critDamageMultiplier', category: 'RNG', step: 0.1 }
                    ]
                }
            }
        ]);

        return {
            store,
            settingModules
        };
    }
};