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