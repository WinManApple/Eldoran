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

// src/map/mapmanager_modules/MapEventProcessor.js

import { NodeState } from '../MapData.js';
import { store, addLog } from '../../ui/modules/store.js';

/**
 * 子模块：事件处理器 (MapEventProcessor)
 * 职责：处理战斗结算、H事件回调等外部系统的反馈，并更新地图状态与记忆
 */
export class MapEventProcessor {

    constructor(manager) {
        this.manager = manager;
    }

    // ==========================================
    // 1. 战斗结算 (Combat Resolution)
    // ==========================================

    /**
     * 处理战斗结果
     * @param {string} nodeId - 触发战斗的节点ID
     * @param {string} outcome - 'victory' | 'escaped'
     */
    resolveCombat(nodeId, outcome) {
        const map = this.manager.registry.currentMap;
        if (!map) return;

        const node = map.nodes.find(n => n.id === nodeId);
        if (!node) {
            console.warn(`[MapEventProcessor] 结算异常：找不到节点 ${nodeId}`);
            return;
        }

        console.log(`[MapEventProcessor] 结算战斗: ${nodeId} -> ${outcome}`);

        if (outcome === 'victory') {
            this._handleVictory(map, node);
        } else if (outcome === 'escaped') {
            console.log("[MapEventProcessor] 玩家逃跑，位置不变");
            addLog("🏃‍♂️ 你逃离了战场...");
        }
    }

    _handleVictory(map, node) {
        // 1. 手动执行"移动"逻辑 (因为之前被拦截了)
        // 把旧节点设为 VISITED
        const oldNode = map.nodes.find(n => n.id === map.currentNodeId);
        if (oldNode) oldNode.state = NodeState.VISITED;

        // 2. 玩家真正踏入该节点
        map.currentNodeId = node.id;
        node.state = NodeState.CURRENT; 
        
        // 战斗胜利后同步位置信息
        if (window.uiStore && window.uiStore.worldState) {
            window.uiStore.worldState.nodeName = node.name;
        }

        // 3. 驱散迷雾 (核心奖励：开路)
        // 调用 Navigation 模块的能力
        if (this.manager.navigation) {
            this.manager.navigation.revealNeighbors(node);
        }

        // 4. 推进世界时间/寿命
        // 调用 Manager 集成的 tick 方法
        if (this.manager.tickWorldLife) {
            this.manager.tickWorldLife();
        }

        // 🟢 [已删除] 战报记录逻辑已迁移至 CombatManager/BattleState 内部统一处理
        // 此处不再重复注入，防止消息双重显示。
    }
}