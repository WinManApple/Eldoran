/*
* Project: Eldoran
 * Copyright (C) 2026 WinAppleMan
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

// src/ui/SnapshotOverlay.js

import { useSnapshot } from './modules/useSnapshot.js';

export default {
    name: 'SnapshotOverlay',
    setup() {
        const { state, capture, restore, remove, toggleUI } = useSnapshot();

        const formatTime = (ts) => {
            return new Date(ts).toLocaleTimeString();
        };

        const handleRestore = async (index) => {
            const snap = state.snapshots[index];
            if (!snap) return;

            const confirmed = window.confirm(
                `【时空回溯确认】\n\n目标时间: ${formatTime(snap.timestamp)}\n快照标签: ${snap.label}\n\n警告：回溯后，当前未保存的进度将完全丢失！\n是否确定执行？`
            );

            if (confirmed) {
                await restore(index);
            }
        };

        // 删除处理函数
        const handleDelete = (index) => {
            const snap = state.snapshots[index];
            if (!snap) return;

            // 简单的确认弹窗
            if (window.confirm(`确定要删除存档点 "${snap.label}" 吗？`)) {
                remove(index);
            }
        };

        // 手动快照处理函数 (实现默认命名逻辑)
        const handleManualCapture = () => {
            // 1. 计算默认名称: "快照" + (当前数量 + 1)
            const nextIndex = state.snapshots.length + 1;
            const defaultName = `快照${nextIndex}`;

            // 2. 弹窗询问，并将 defaultName 设为输入框默认值
            const note = window.prompt("【创建快照】\n请为当前时刻添加备注:", defaultName);
            
            // 3. 只有点击确定(非null)才保存
            if (note !== null) {
                // 如果用户清空了输入，使用默认名
                capture(note.trim() || defaultName);
            }
        };

        // 返回 handleDelet
        return { state, toggleUI, formatTime, handleRestore, handleManualCapture, handleDelete };
    },
    template: `
    <div class="rpg-time-wrapper">
        <button class="rpg-time-trigger" @click="toggleUI" title="打开时空回溯面板">
            ⏳
        </button>

        <transition name="fade">
            <div v-if="state.isVisible" class="rpg-time-panel">
                <div class="rpg-time-header">
                    <h3>⏳ 时空节点</h3>
                    <div class="header-actions">
                        <button class="rpg-time-add" @click="handleManualCapture" title="新建快照">＋</button>
                        <button class="rpg-time-close" @click="toggleUI">×</button>
                    </div>
                </div>
                
                <div class="rpg-time-list">
                    <div v-if="state.snapshots.length === 0" class="rpg-time-empty">
                        暂无回溯点...
                    </div>
                    
                    <div v-for="(snap, index) in state.snapshots" :key="snap.timestamp" class="rpg-time-item">
                        <div class="rpg-time-info">
                            <span class="rpg-time-clock">{{ formatTime(snap.timestamp) }}</span>
                            <span class="rpg-time-tag">{{ snap.label }}</span>
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <button class="rpg-time-btn" @click="handleRestore(index)">
                                回溯
                            </button>
                            <button class="rpg-time-btn" style="background: #e74c3c; width: 30px; padding: 0;" @click="handleDelete(index)" title="删除">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </transition>
    </div>
    `
};