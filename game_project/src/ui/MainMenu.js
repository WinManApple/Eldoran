/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/ui/MainMenu.js
import { store } from './modules/store.js';

export default {
    name: 'MainMenu',
    template: `
    <transition name="fade">
        <div class="main-menu">
            <div class="game-title">
                <h1 class="main-title">永恒混沌的恩赐</h1>
                <h2 class="sub-title">埃尔多兰</h2>
            </div>
            <div class="menu-buttons">
                <button class="rpg-btn primary" @click="$emit('start-game')">
                    <span>⚔️ 开始新征程</span>
                </button>
                <button class="rpg-btn" @click="$emit('open-saves')">
                    <span>📜 继续冒险</span>
                </button>
                <button class="rpg-btn" @click="$emit('open-settings')">
                    <span>⚙️ 系统设置</span>
                </button>
            </div>
        </div>
    </transition>
    `,
    setup(props, { emit }) {
        return {
            store
        };
    }
};