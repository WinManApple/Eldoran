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