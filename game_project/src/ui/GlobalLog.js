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

// src/ui/GlobalLog.js
import { store } from './modules/store.js';

export const GlobalLog = {
    name: 'GlobalLog',
    data() {
        return {
            store,
            logVisible: false,
            logTimer: null,
            isForceHidden: false // 🔴 新增：标记是否被玩家手动点击关闭
        };
    },
    methods: {
        showLog() {
            // 如果被强制隐藏，则不自动弹出（除非是新日志触发，此处逻辑可根据偏好调整）
            if (this.isForceHidden) return; 

            this.logVisible = true;
            this.resetLogTimer();
            this.$nextTick(() => {
                const el = this.$refs.logBox;
                if (el) el.scrollTop = el.scrollHeight;
            });
        },
        resetLogTimer() {
            if (this.logTimer) clearTimeout(this.logTimer);
            this.logTimer = setTimeout(() => {
                this.logVisible = false;
            }, 2000); 
        },
        // 🟢 鼠标进入：若非强制隐藏则保持常亮
        onMouseEnter() {
            if (this.isForceHidden) return; 
            this.logVisible = true;
            if (this.logTimer) clearTimeout(this.logTimer);
        },
        // 🟢 鼠标离开：重置所有状态
        onMouseLeave() {
            this.isForceHidden = false; // 🔴 离开区域后，恢复“可显示”状态
            this.resetLogTimer();
        },
        // 🔴 新增：处理点击关闭
        handleClose() {
            this.logVisible = false;
            this.isForceHidden = true; // 标记为强制隐藏，直到鼠标离开
            if (this.logTimer) clearTimeout(this.logTimer);
        }
    },
    watch: {
        'store.systemLogs': {
            handler() {
                // 当有新日志产生时，通常建议打破“强制隐藏”，让玩家看到新信息
                this.isForceHidden = false; 
                this.showLog();
            },
            deep: true
        }
    },
    template: `
    <div class="global-log-wrapper" @mouseleave="onMouseLeave">
        
        <div class="log-container" 
             ref="logBox"
             :class="{ active: logVisible }"
             @mouseenter="onMouseEnter"
             @click="handleClose" 
             style="cursor: pointer;"
             title="点击关闭日志">
            <div v-for="(log, index) in store.systemLogs" :key="index" class="log-item">
                {{ log }}
            </div>
        </div>

        <div class="log-anchor" 
             @mouseenter="onMouseEnter"
             title="查看系统日志">
            📜
        </div>
        
    </div>
    `
};