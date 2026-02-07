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

// src/ui/modules/useLLM.js
import { Game_Manager } from '../../LLM/Game_Manager.js';
import { Call_Map_Named } from '../../LLM/calls/Call_Map_Named.js';
import { Call_Plot_Design } from '../../LLM/calls/Call_Plot_Design.js';
import { Call_Node_Generate } from '../../LLM/calls/Call_Node_Generate.js';
import { MapManager } from '../../map/MapManager.js'; // 读取静态配置
import { addLog, store } from './store.js';

/**
 * LLM 交互逻辑模块 (Refactored)
 * 职责：提供 AI 管理面板所需的高级操作接口
 */
export function useLLM() {

    /**
     * 内部辅助：将玩家强制归位到 ROOT 节点
     */
    const _forcePlayerToRoot = (manager) => {
        const currentMap = manager.currentMap;
        if (!currentMap) return false;

        // 寻找类型为 ROOT 的节点
        const rootNode = currentMap.nodes.find(n => n.type === 'ROOT');
        
        if (rootNode) {
            console.log(`[useLLM] 🔄 强制玩家归位至 ROOT: ${rootNode.id}`);
            
            // 1. 修改坐标指针
            currentMap.currentNodeId = rootNode.id;
            
            // 2. 强制刷新 UI (让棋子视觉上跳回去)
            if (window.uiStore) window.uiStore.tempMapData = Date.now();
            
            return true;
        }
        
        console.warn("[useLLM] ❌ 未找到 ROOT 节点，无法归位");
        return false;
    };

    /**
     * 功能 A: 重新初始化当前世界
     * 行为：归位 -> 清空所有动态数据 -> 重新生成 (命名+剧情+初始层节点)
     */
    const reInitializeWorld = async () => {
        const manager = window.mapManager;
        if (!manager || !manager.currentMap) {
            addLog("❌ 核心数据丢失，无法操作");
            return false;
        }

        const map = manager.currentMap;

        // 0. 状态检查
        if (map.isGenerating) {
            addLog("⏳ 创世引擎忙碌中，请稍候...");
            return false;
        }

        addLog("🌪️ 正在执行时空回溯...");

        // 1. 强制归位
        if (!_forcePlayerToRoot(manager)) {
            addLog("❌ 归位失败，操作取消");
            return false;
        }

        // 2. 数据清洗 (保留拓扑结构，清除内容)
        map.name = "未知区域 (重置中)";
        let cleanCount = 0;
        
        map.nodes.forEach(node => {
            // ROOT 节点通常保持原样，其他节点清空
            if (node.type !== 'ROOT') {
                node.name = ""; // 清空名字，让 Action_Map_Named 重新生成
                node.payload = {}; // 清空事件/描述
                node.isGenerated = false; // 标记为未生成
                cleanCount++;
            }
        });

        // 重置水位线 (读取 MapManager 的静态配置)
        // 这样可以保证后续的 LazyGen 逻辑能重新正常触发
        const initialLayerCount = store.config?.map?.initialGenLayers || 1;
        map.maxGeneratedLayer = initialLayerCount - 1;

        console.log(`[useLLM] 已重置 ${cleanCount} 个节点，水位线重置为 L${map.maxGeneratedLayer}`);

        // 3. 触发全量生成请求
        addLog("🧬 正在重新构建世界构造...");
        
        return await Game_Manager.sendRequest([
            // 重新命名地图
            Call_Map_Named.constructRequest(map),
            // 重新设计剧情大纲
            Call_Plot_Design.constructRequest(map),
            // 重新生成初始层的节点内容
            Call_Node_Generate.constructRequest(map, 0, initialLayerCount)
        ]);
    };

    /**
     * 功能 B: 重塑指定范围的节点 Payload
     * 行为：归位 -> 清空指定层 Payload -> 重新生成 (NodeGen Only)
     * @param {number} startLayer - 起始层级
     * @param {number} count - 重塑层数
     */
    const reshapeLayerPayload = async (startLayer, count) => {
        const manager = window.mapManager;
        if (!manager || !manager.currentMap) return false;
        const map = manager.currentMap;

        if (map.isGenerating) {
            addLog("⏳ 生成进行中...");
            return false;
        }

        // 1. 强制归位
        _forcePlayerToRoot(manager);

        // 2. 局部清洗
        const endLayer = startLayer + count;
        let targetCount = 0;

        map.nodes.forEach(node => {
            if (node.layerIndex >= startLayer && node.layerIndex < endLayer) {
                // 注意：这里我们通常不清除 node.name，只清除 payload
                // 如果你想连名字也改，需要把 Call_Map_Named 也加进来，但那样太重了
                node.payload = {};
                node.isGenerated = false;
                targetCount++;
            }
        });

        if (targetCount === 0) {
            addLog(`⚠️ 该层级范围 (${startLayer}-${endLayer-1}) 没有发现有效节点`);
            return false;
        }

        addLog(`✨ 正在重塑 ${startLayer} 至 ${endLayer - 1} 层的内容...`);

        // 3. 触发局部生成
        return await Game_Manager.sendRequest([
            // 仅请求节点 Payload 生成
            Call_Node_Generate.constructRequest(map, startLayer, count)
        ]);
    };

    return {
        reInitializeWorld,
        reshapeLayerPayload
    };
}