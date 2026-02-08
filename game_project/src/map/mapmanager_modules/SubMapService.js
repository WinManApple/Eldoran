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

// src/map/mapmanager_modules/SubMapService.js

import { NodeType, NodeState, MapNode } from '../MapData.js';
import { MapGenerator } from '../MapGenerator.js';

// 引入 LLM 调用
import { Game_Manager } from '../../LLM/Game_Manager.js';
import { Call_Map_Named } from '../../LLM/calls/Call_Map_Named.js';
import { Call_Plot_Design } from '../../LLM/calls/Call_Plot_Design.js';
import { Call_Node_Generate } from '../../LLM/calls/Call_Node_Generate.js';
import { Chat_Memory } from '../../LLM/memory/Chat_Memory.js';

/**
 * 子模块：支线与裂缝服务 (SubMapService)
 * 职责：负责支线地图的挂载、修剪、生命周期维护、固定状态管理以及 UI 数据获取
 */
export class SubMapService {
    
    static INITIAL_GEN_LAYERS = 1;

    constructor(manager) {
        this.manager = manager;
    }

    // ==========================================
    // 1. 支线挂载 (Mounting)
    // ==========================================

    /**
     * 动态挂载支线任务
     * @param {Object} config - 包含 chapter, layerIndex, edge_position, questName 等
     */
    mountSubMap(config) {
        console.log("🕵️ [SubMapService] 收到挂载请求:", config);

        // 1. 获取目标父地图
        const targetMap = this.manager.registry.maps[config.chapter];
        if (!targetMap) {
            console.error(`[SubMapService] 无法挂载支线，目标地图 ${config.chapter} 不存在`);
            return;
        }

        // 🟢 [需求2] 层级回溯寻找锚点
        // 如果指定层没有空间，就往上一层找，直到第 0 层
        let anchor = null;
        let finalLayerIndex = config.layerIndex; // 初始目标层

        // 循环尝试：从目标层开始，逐层向上 (layer--)
        for (let layer = finalLayerIndex; layer >= 0; layer--) {
            // 构造临时配置进行探测
            const tempConfig = { ...config, layerIndex: layer };
            
            // 尝试在该层寻找锚点
            anchor = this._findAnchor(targetMap, tempConfig);
            
            if (anchor) {
                console.log(`[SubMapService] ✅ 在第 ${layer} 层找到可用空间 (原定: ${config.layerIndex})`);
                finalLayerIndex = layer; // 更新最终层级
                break; // 找到了，跳出循环
            } else {
                console.log(`[SubMapService] ⚠️ 第 ${layer} 层空间不足，尝试上一层...`);
            }
        }

        // 如果遍历完所有层还是没找到
        if (!anchor) {
            console.warn(`[SubMapService] ❌ 挂载失败：所有层级均无可用空间 (尝试至 Layer 0)`);
            // 这里可以加一个 UI 提示：addLog("周围太拥挤了，无法开启新通道...");
            return;
        }

        // 3. 更新配置为最终确认的层级
        const finalConfig = { ...config, layerIndex: finalLayerIndex };

        // 4. 创建入口节点 (紫色传送门)
        const portalNode = this._createEntryNode(targetMap, anchor, finalConfig);

        // 5. 立即挂载到父地图 (数据层)
        targetMap.nodes.push(portalNode);

        // 6. 🟢 [需求1] 立即更新渲染 (视觉层)
        // 这样玩家立刻能看到节点，不需要等 LLM
        this._updateRenderer(portalNode, config.chapter, anchor.node);

        // 7. 🟢 [需求1] 强制刷新 Vue 界面 (让左上角 HUD 或其他 UI 感知变化)
        if (window.uiStore) {
            window.uiStore.tempMapData = Date.now();
        }
        
        console.log(`[SubMapService] 支线入口已显示: ${portalNode.name}，正在后台生成内容...`);

        // 8. 最后再异步生成支线数据 (LLM 请求)
        // 此时节点已经显示在屏幕上了
        this._generateSubMap(portalNode, targetMap, finalConfig);
    }

    // --- 挂载流程辅助函数 ---

    _findAnchor(targetMap, config) {
        const allLayerNodes = targetMap.nodes.filter(n => n.layerIndex === config.layerIndex);
        if (allLayerNodes.length === 0) return null; // 该层没节点，无法挂载
        
        allLayerNodes.sort((a, b) => a.x - b.x);
        
        const visibleNodes = allLayerNodes.filter(n => n.state !== NodeState.LOCKED);
        if (visibleNodes.length === 0) return null; // 该层没有可见节点，没法连线

        // --- 安全边界定义 ---
        const SAFE_MIN_X = 80;   // 左侧边界
        const SAFE_MAX_X = 1080; // 右侧边界 (避让 UI)

        // 候选位置
        const leftCandidateX = allLayerNodes[0].x - 180;
        const rightCandidateX = allLayerNodes[allLayerNodes.length - 1].x + 180;

        let finalIsLeft = (config.edge_position === 'LEFT');
        let finalX = 0;
        let anchorNode = null;

        // 状态检查
        const canLeft = leftCandidateX >= SAFE_MIN_X;
        const canRight = rightCandidateX <= SAFE_MAX_X;

        // 如果左右都塞不下了，直接返回 null，触发上层回溯
        if (!canLeft && !canRight) {
            return null; 
        }

        // 决策逻辑
        if (finalIsLeft) {
            if (canLeft) {
                finalX = leftCandidateX;
                anchorNode = visibleNodes[0];
            } else {
                // 左边不行，强切右边
                finalIsLeft = false;
                finalX = rightCandidateX;
                anchorNode = visibleNodes[visibleNodes.length - 1];
            }
        } else {
            if (canRight) {
                finalX = rightCandidateX;
                anchorNode = visibleNodes[visibleNodes.length - 1];
            } else {
                // 右边不行，强切左边
                finalIsLeft = true;
                finalX = leftCandidateX;
                anchorNode = visibleNodes[0];
            }
        }

        return {
            node: anchorNode,
            targetX: finalX,
            isLeft: finalIsLeft
        };
    }

    _createEntryNode(targetMap, anchor, config) {
        const newNodeId = `${targetMap.mapId}_sub_${Date.now()}`;
        const subMapId = `sub_${Date.now()}`;

        const newNode = new MapNode({
            id: newNodeId,
            type: NodeType.PORTAL_NEXT_CHAPTER, 
            name: config.questName,
            layerIndex: config.layerIndex,
            state: NodeState.REVEALED,
            x: anchor.targetX,
            y: anchor.node.y 
        });

        // 绑定传送目标
        newNode.portalTarget = subMapId;
        return newNode;
    }

    _generateSubMap(portalNode, targetMap, config) {
        const genConfig = {
            mapId: portalNode.portalTarget,
            type: 'SUB',
            parentMapId: targetMap.mapId,
            entryNodeId: portalNode.id,
            parentDepth: config.layerIndex,
            themeId: 'THEME_DUNGEON', // 默认地牢
            ...config // 透传覆盖
        };

        const subMap = MapGenerator.generate(genConfig);

        this.manager.registry.registerMap(subMap);
        
        // 🟢 [新增] 同步注册频道与记忆
        if (window.uiStore && window.uiStore.chatData) {
            const channelId = subMap.mapId;
            const channelName = subMap.name || "未知信号";

            // 1. UI 注册
            window.uiStore.chatData.registerChannel(channelId, channelName, 'QUEST');
            
            // 2. 记忆初始化 (仅针对支线)
            // 引入 Chat_Memory (确保顶部 import 了)
            if (typeof Chat_Memory !== 'undefined') {
                const initLog = `已建立链接：${channelName}`;
                
                // 写入记忆库 (role: system)
                Chat_Memory.addRecentChat(
                    channelId, 
                    null, 
                    null, 
                    [{ role: 'system', text: initLog }], 
                    "Init"
                );
                
                console.log(`[SubMapService] 🧠 记忆扇区已分配: ${channelId}`);
            }
        }

        // 触发 LLM
        Game_Manager.sendRequest([
            Call_Plot_Design.constructRequest(subMap), 
            Call_Map_Named.constructRequest(subMap), 
            Call_Node_Generate.constructRequest(subMap, 0, SubMapService.INITIAL_GEN_LAYERS)
        ]);

        subMap.maxGeneratedLayer = SubMapService.INITIAL_GEN_LAYERS - 1;
    }

    _updateRenderer(node, mapId) {
        if (this.manager.registry.currentMap && this.manager.registry.currentMap.mapId === mapId) {
            const scene = window.game?.scene?.getScene('ExplorationScene');
            // 🟢 [修复] 修正属性名为 mapRenderer
            // 🟢 [确认] 第二个参数保持 null，遵循你的要求：不绘制丑陋的连线
            if (scene && scene.mapRenderer) {
                scene.mapRenderer.addNodeToScene(node, null);
            }
        }
    }

    // ==========================================
    // 2. 支线修剪 (Pruning)
    // ==========================================

    /**
     * 检查玩家是否位于目标地图或其子孙地图中
     */
    isPlayerInLineage(targetMapId) {
        let tempMap = this.manager.registry.currentMap;
        if (!tempMap) return false;

        // 向上回溯
        while (tempMap) {
            if (tempMap.mapId === targetMapId) return true;
            
            if (tempMap.parentMapId) {
                tempMap = this.manager.registry.maps[tempMap.parentMapId];
            } else {
                break;
            }
        }
        return false;
    }

    /**
     * 彻底修剪(删除)支线地图
     */
    pruneSubMap(subMapId) {
        // 安全检查：如果玩家在里面，不能删
        if (this.isPlayerInLineage(subMapId)) {
            console.warn(`[SubMapService] 🛡️ 拦截删除：玩家位于地图链下游`);
            // 续命一秒，防止死循环尝试删除
            if (this.manager.registry.maps[subMapId]) {
                this.manager.registry.maps[subMapId].life = 1; 
            }
            return;
        }

        const maps = this.manager.registry.maps;
        const subMap = maps[subMapId];
        if (!subMap) return;

        const parentMap = maps[subMap.parentMapId];
        
        // 如果父地图也没了，直接删自己
        if (!parentMap) {
            delete maps[subMapId]; 
            // 同步销毁对应的聊天频道
            if (window.uiStore && window.uiStore.chatData) {
                // 支线地图的频道 ID 约定为 mapId (参见 MapRegistry.getChannelId)
                window.uiStore.chatData.deleteChannel(subMapId);
            }

            // [新增] 同步销毁 LLM 记忆
            if (typeof Chat_Memory !== 'undefined' && Chat_Memory.channels) {
                if (Chat_Memory.channels[subMapId]) {
                    delete Chat_Memory.channels[subMapId];
                    console.log(`[SubMapService] 🧠 记忆扇区已回收: ${subMapId}`);
                }
            }

            return;
        }

        // 1. 移除父地图中的入口节点
        const entryNodeIndex = parentMap.nodes.findIndex(n => n.portalTarget === subMapId);
        if (entryNodeIndex !== -1) {
            const entryNode = parentMap.nodes[entryNodeIndex];
            
            // 断开连接
            const connectedNodes = parentMap.nodes.filter(n => n.nextNodes.includes(entryNode.id));
            connectedNodes.forEach(node => {
                node.nextNodes = node.nextNodes.filter(id => id !== entryNode.id);
            });

            // 从数据移除
            parentMap.nodes.splice(entryNodeIndex, 1);

            // 从场景移除
            const scene = window.game?.scene?.getScene('ExplorationScene');
            if (scene && scene.mapRenderer) {
                scene.mapRenderer.removeNodeFromScene(entryNode.id);
            }
        }

        // 2. 删除地图数据
        delete maps[subMapId];

        // 同步销毁对应的聊天频道 (针对正常修剪的情况)
        if (window.uiStore && window.uiStore.chatData) {
            window.uiStore.chatData.deleteChannel(subMapId);
        }

        // [新增] 同步销毁 LLM 记忆
        if (typeof Chat_Memory !== 'undefined' && Chat_Memory.channels) {
            if (Chat_Memory.channels[subMapId]) {
                delete Chat_Memory.channels[subMapId];
                console.log(`[SubMapService] 🧠 记忆扇区已回收: ${subMapId}`);
            }
        }

        console.log(`[SubMapService] 支线 ${subMapId} 已移除`);
    }

    /**
     * 世界心跳：处理支线任务寿命
     */
    tickWorldLife() {
        const maps = this.manager.registry.maps;
        const keys = Object.keys(maps);
        const deadMaps = [];

        keys.forEach(key => {
            const map = maps[key];
            // 仅当：是支线、未锁定、不是当前地图、未被玩家固定 时扣血
            if (map.type === 'SUB' && !map.isLocked && !map.isActive && !map.isPinned) {
                map.life -= 1;
                if (map.life <= 0) {
                    deadMaps.push(key);
                }
            }
        });

        deadMaps.forEach(mapId => {
            this.pruneSubMap(mapId); 
        });
    }

    // ==========================================
    // 3. 扩展接口 (UI & Script)
    // ==========================================

    /**
     * 手动创建支线 (脚本调用)
     */
    createSubQuest(name, sourceNodeId) {
        const currentMap = this.manager.registry.currentMap;
        if (!currentMap) return;

        const subId = `sub_${Date.now()}`;
        const subMap = MapGenerator.generate({
            mapId: subId,
            type: 'SUB',
            themeId: 'THEME_DUNGEON',
            parentMapId: currentMap.mapId,
            entryNodeId: sourceNodeId,
            parentDepth: this._getCurrentNodeLayer()
        });

        this.manager.registry.registerMap(subMap);

        // 🟢 [新增] 立即注册支线频道与记忆
        if (window.uiStore && window.uiStore.chatData) {
            const channelId = subMap.mapId;
            const channelName = subMap.name || "未知信号";

            // 1. UI 注册
            window.uiStore.chatData.registerChannel(channelId, channelName, 'QUEST');
            console.log(`[SubMapService] 📡 侦测到新信号，频道已建立: ${channelId}`);

            // 2. 记忆初始化
            if (typeof Chat_Memory !== 'undefined') {
                const initLog = `已建立链接：${channelName}`;
                Chat_Memory.addRecentChat(
                    channelId, 
                    null, 
                    null, 
                    [{ role: 'system', text: initLog }], 
                    "Init"
                );
            }
        }

        // 触发 LLM 生成
        Game_Manager.sendRequest([
            Call_Plot_Design.constructRequest(subMap), 
            Call_Map_Named.constructRequest(subMap), 
            Call_Node_Generate.constructRequest(subMap, 0, SubMapService.INITIAL_GEN_LAYERS)
        ]);

        // 修改源节点为传送门
        const sourceNode = currentMap.nodes.find(n => n.id === sourceNodeId);
        if (sourceNode) {
            sourceNode.type = NodeType.PORTAL_NEXT_CHAPTER;
            sourceNode.portalTarget = subId;
            sourceNode.name = name || "支线入口";
        }

        return subId;
    }

    /**
     * UI 接口：获取所有支线列表
     */
    getSubMaps() {
        const allMaps = Object.values(this.manager.registry.maps);
        const subMaps = allMaps.filter(m => m.type === 'SUB');

        return subMaps.map(map => ({
            id: map.mapId,
            name: map.name || "未知裂缝",
            layerIndex: map.parentDepth || 0,
            life: map.life || 0,
            maxLife: map.maxLife || 10,
            isPinned: !!map.isPinned
        }));
    }

    /**
     * UI 接口：切换固定状态
     */
    togglePinSubMap(mapId) {
        const targetMap = this.manager.registry.maps[mapId];
        if (targetMap && targetMap.type === 'SUB') {
            targetMap.isPinned = !targetMap.isPinned;
            console.log(`[SubMapService] 地图 ${mapId} 固定状态: ${targetMap.isPinned}`);
            return true;
        }
        return false;
    }

    // 辅助
    _getCurrentNodeLayer() {
        const map = this.manager.registry.currentMap;
        if (!map) return 0;
        const node = map.nodes.find(n => n.id === map.currentNodeId);
        return node ? node.layerIndex : 0;
    }
}