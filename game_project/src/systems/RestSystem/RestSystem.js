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

// src/systems/RestSystem/RestSystem.js
import { reactive } from '../../../lib/vue.esm-browser.js';
import { store, addLog } from '../../ui/modules/store.js';
import { HInteractionSystem } from '../HInteractionSystem/HInteractionSystem.js';

/**
 * ==========================================
 * 休息处系统核心 (RestSystem) - 修正版
 * ==========================================
 */
export const RestSystem = reactive({
    isOpen: false,
    currentNode: null, // 存储当前 REST 节点的原始数据
    restCost: 50,      // 基础休息费用

    /**
     * === [NEW] 外部启动入口 ===
     * 1. 初始化数据
     * 2. 隐藏地图层
     * 3. 打开 UI
     */
    open(nodeData) {
        console.log("[RestSystem] 💤 进入休息点");
        this.init(nodeData);

        // 隐藏 Phaser 地图 (提升 UI 沉浸感)
        if (window.uiStore) {
            window.uiStore.gameCanvasVisible = false;
        }
    },

    /**
     * 初始化数据
     */
    init(nodeData) {
        this.currentNode = nodeData;
        this.isOpen = true;
        addLog(`📍 抵达安宁之所：${nodeData.name}`);
    },

    /**
     * 执行整备恢复逻辑
     */
    executeRest() {
        if (store.playerState.gold < this.restCost) {
            addLog("❌ 金币不足，无法进行系统整备。");
            return false;
        }

        store.playerState.gold -= this.restCost;

        store.party.forEach(member => {
            member.recalculateStats();
            member.hp = member.maxHp;
            member.mp = member.maxMp;
        });

        addLog(`✨ 休息完成。消耗了 ${this.restCost} 金币，全员状态已完全恢复。`);
        return true;
    },

    /**
     * 🟢 [修复] 在休息处发起主动 H 互动
     * 修正了调用参数，适配 HInteractionSystem.startInteraction(ids, name, opts)
     */
    triggerHInteraction(charId) {
        // 1. 获取地点名称
        const currentLocation = this.currentNode?.name || "休息处";
        
        // 2. 构造事件名称 (按照你的要求)
        const eventName = `${currentLocation}温情互动`;

        // 3. 检查数据有效性
        if (!store.hData || !store.hData[charId]) {
            addLog("❌ 无法发起互动：该角色数据尚未初始化。");
            return;
        }

        // 4. 关闭休息界面 (但不恢复 Canvas，因为 H 系统会接管)
        this.isOpen = false;

        // 5. 正确调用 H 系统启动函数
        HInteractionSystem.startInteraction(
            [charId],      // 参数1: 角色ID数组
            eventName,     // 参数2: 事件名称
            {              // 参数3: 额外上下文
                context: {
                    source: 'rest_node',
                    nodeId: this.currentNode?.id,
                    locationOverride: currentLocation // 可选：传递明确的地点
                }
            }
        );
    },

    /**
     * 关闭休息界面
     */
    close() {
        this.isOpen = false;
        this.currentNode = null;
        addLog('你整备完毕，再次踏上旅途。');

        // 恢复地图显示
        if (window.uiStore) {
            window.uiStore.gameCanvasVisible = true;
        }
    }
});