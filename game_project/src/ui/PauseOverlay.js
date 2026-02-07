/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/ui/PauseOverlay.js
import { store } from './modules/store.js';

export default {
    name: 'PauseOverlay',
    template: `
    <transition name="fade">
        <div class="pause-menu-overlay">
            <div class="pause-panel">
                <h2 class="pause-title">PAUSE</h2>
                <div class="pause-buttons">
                    <button class="rpg-btn primary" @click="$emit('resume')">
                        ↩️ 继续游戏
                    </button>
                    <button class="rpg-btn" @click="$emit('open-settings')">
                        ⚙️ 系统设置
                    </button>
                    <button class="rpg-btn" @click="$emit('open-saves')">
                        💾 存档管理
                    </button>
                    <button class="rpg-btn danger" @click="$emit('quit')">
                        🏠 返回标题
                    </button>
                </div>
            </div>
        </div>
    </transition>
    `,
    setup() {
        return {};
    }
};