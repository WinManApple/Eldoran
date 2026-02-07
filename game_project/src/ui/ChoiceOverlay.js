/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/ui/ChoiceOverlay.js
import { store } from './modules/store.js';
import { ChoiceSystem } from '../systems/ChoiceSystem/ChoiceSystem.js';
import { reactive, watch, computed } from '../../lib/vue.esm-browser.js';

export default {
    name: 'ChoiceOverlay',
    setup() {

        /// 直接使用导入的 reactive，不再使用 Vue.reactive
        const state = reactive({
            visibleLineCount: 1 
        });

        // 直接使用导入的 watch
        watch(() => store.choice.isActive, (active) => {
            if (active) {
                state.visibleLineCount = 1;
            }
        });

        // 点击屏幕推进文本
        const handleScreenClick = () => {
            if (state.visibleLineCount < store.choice.currentLines.length) {
                state.visibleLineCount++;
            }
        };

        // 处理选项点击
        const onOptionClick = (index) => {

            if (store.choice.isProcessing) return;
            ChoiceSystem.handleDecision(index);
        };

        // 直接使用导入的 computed
        const showChoices = computed(() => {
            return state.visibleLineCount >= store.choice.currentLines.length && !store.choice.isProcessing;
        });

        return { store, state, handleScreenClick, onOptionClick, showChoices };
    },
    template: `
    <div v-if="store.choice.isActive" class="choice-overlay" @click="handleScreenClick">
        <div class="choice-backdrop"></div>
        
        <div class="choice-container">
            <div class="choice-header">
                <span class="mana-symbol">◈</span>
                <h2 class="choice-title">{{ store.choice.title }}</h2>
                <span class="mana-symbol">◈</span>
            </div>

            <div class="choice-stats" v-if="store.playerState">
                <div class="stat-item stat-hp">
                    <span class="stat-label">HP</span>
                    {{ Math.floor(store.playerState.hp) }} / {{ store.playerStats.maxHp || store.playerState.stats.maxHp }}
                </div>
                <div class="stat-item stat-mp">
                    <span class="stat-label">MP</span>
                    {{ Math.floor(store.playerState.mp) }} / {{ store.playerStats.maxMp || store.playerState.stats.maxMp }}
                </div>
            </div>

            <div class="choice-content">
                <div v-for="(line, index) in store.choice.currentLines.slice(0, state.visibleLineCount)" 
                     :key="index" 
                     class="choice-line">
                    {{ line }}
                </div>
                
                <div v-if="state.visibleLineCount < store.choice.currentLines.length" class="tap-hint">
                    点击继续...
                </div>
            </div>

            <transition name="fade-in">
                <div v-if="showChoices" class="options-group" @click.stop>
                    <button v-for="opt in store.choice.choices" 
                            :key="opt.index"
                            class="rpg-choice-btn"
                            :class="{ 'processing': store.choice.isProcessing }"
                            :disabled="store.choice.isProcessing"
                            @click.stop.prevent="onOptionClick(opt.index)">
                        <span class="btn-decoration">✦</span>
                        {{ opt.label }}
                    </button>
                </div>
            </transition>
        </div>
    </div>
    `
};