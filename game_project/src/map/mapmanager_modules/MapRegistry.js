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

// src/map/mapmanager_modules/MapRegistry.js
// @ts-nocheck
// 引入地图生成器与主题配置
import { MapGenerator } from '../MapGenerator.js';
import { MapTheme } from '../../config/MapThemes.js'; 

// 引入 LLM 调用相关的脚本
import { Game_Manager } from '../../LLM/Game_Manager.js';
import { Call_Map_Named } from '../../LLM/calls/Call_Map_Named.js';
import { Call_Plot_Design } from '../../LLM/calls/Call_Plot_Design.js';
import { Call_Node_Generate } from '../../LLM/calls/Call_Node_Generate.js';

// 引入系统模块
import { PartyManager } from '../../systems/PartyManager.js';

/**
 * 子模块：地图注册表 (MapRegistry)
 * 职责：负责地图数据的存储、索引、注册、切换以及新游戏的初始化
 */
export class MapRegistry {

    static INITIAL_GEN_LAYERS = 1; // 初始化生成层数

    constructor(manager) {
        this.manager = manager; // 持有 MapManager 的引用，用于回调
        
        this.maps = {};           // 容器: { mapId: GameMap对象 }
        this.activeMapId = null;  // 指针: 当前正在游玩的地图ID
        this.chapterCount = 0;    // 全局章节计数器
    }

    // ==========================================
    // Core Accessors
    // ==========================================

    /**
     * 🟢 [新增] 获取当前地图对应的频道 ID
     * 供外部模块 (如 MapEventProcessor) 调用
     */
    get currentChannelId() {
        const map = this.currentMap;
        if (!map) return 'main'; // 兜底
        return this.getChannelId(map);
    }

    /**
     * 🟢 [新增] 根据地图类型决定频道 ID
     * 规则：主线地图 -> 'main' | 支线地图 -> mapId
     */
    getChannelId(map) {
        if (!map) return 'main';
        // 如果是主线，强制归入 'main' 频道
        if (map.type === 'MAIN') return 'main';
        // 其他类型 (SUB/DUNGEON等) 使用独立的 mapId 作为频道
        return map.mapId;
    }

    get currentMap() {
        return this.maps[this.activeMapId] || null;
    }

    getMap(mapId) {
        return this.maps[mapId];
    }

    clear() {
        this.maps = {};
        this.activeMapId = null;
        this.chapterCount = 0;
    }

    // ==========================================
    // 1. 初始化与注册逻辑
    // ==========================================

    /**
     * 初始化新游戏世界
     * @param {Object} openingConfig - 开局配置对象 (必须包含 mapThemeId)
     */
    initNewGame(openingConfig) {
        console.log("[MapRegistry] 初始化新世界...", openingConfig?.id);
        
        // 1. 兜底逻辑
        if (!openingConfig) {
            console.error("[MapRegistry] 缺少 openingConfig，无法确定地图主题！");
            return;
        }

        // 🟢 队伍检查逻辑 (保持不变)
        if (window.uiStore) {
            if (!window.uiStore.party || window.uiStore.party.length === 0) {
                // 注意：这里理论上不应该被调用了，因为 useNavigation.startGame 会先创建队伍
                // 但为了健壮性，保留或打印警告
                console.warn("[MapRegistry] 警告: Store 中无队伍数据，这可能导致逻辑错误");
            }
        }
        
        this.clear();
        this.chapterCount = 1;
        
        // ==========================================
        // 2. 主题配置准备
        // ==========================================
        let genConfig = {
            mapId: 'chapter_1_main',
            type: 'MAIN',
            difficulty: 1
        };

        // 🟢 [新增] 动态主题适配逻辑
        // 如果 openingConfig.mapTheme 是一个对象，说明这是 LLM 生成的完整配置
        if (openingConfig.mapTheme && typeof openingConfig.mapTheme === 'object') {
            const dynamicTheme = openingConfig.mapTheme;
            console.log(`[MapRegistry] 检测到动态地图配置: ${dynamicTheme.name}`);

            // 1. 注入 ID (通常是 THEME_DYNAMIC_GENERATED)
            genConfig.themeId = dynamicTheme.id; 
            
            // 2. 透传核心生成参数给 MapGenerator
            // MapGenerator v2.2 已经支持读取 config.distribution / depthRange 等字段
            genConfig.distribution = dynamicTheme.distribution;
            genConfig.depthRange = dynamicTheme.depthRange;
            genConfig.nodeCountRange = dynamicTheme.nodeCountRange;
            genConfig.mandatoryNodes = dynamicTheme.mandatoryNodes;
            
            // 3. 可选参数
            if (dynamicTheme.hasPortal !== undefined) genConfig.hasPortal = dynamicTheme.hasPortal;
            if (dynamicTheme.allowCombat !== undefined) genConfig.allowCombat = dynamicTheme.allowCombat;

        } else {
            // 🟡 原有逻辑：使用静态 ID 查表
            const themeId = openingConfig.mapThemeId || 'THEME_DEFAULT';
            console.log(`[MapRegistry] 根据开局 [${openingConfig.title}] 选择静态主题: ${themeId}`);
            genConfig.themeId = themeId;
        }

        // ==========================================
        // 3. 生成第一章地图
        // ==========================================
        const mapData = MapGenerator.generate(genConfig);

        this.registerMap(mapData);

        mapData.maxGeneratedLayer = MapRegistry.INITIAL_GEN_LAYERS - 1;

        this.switchMap(mapData.mapId);
        
        // 4. 触发 LLM 生成 (保持不变)
        Game_Manager.sendRequest([
            Call_Plot_Design.constructRequest(mapData),
            Call_Map_Named.constructRequest(mapData), 
            Call_Node_Generate.constructRequest(mapData, 0, MapRegistry.INITIAL_GEN_LAYERS)
        ]);
    }

    registerMap(mapData) {
        if (this.maps[mapData.mapId]) {
            console.warn(`[MapRegistry] 地图 ID ${mapData.mapId} 已存在，将被覆盖`);
        }
        this.maps[mapData.mapId] = mapData;
    }

    /**
     * 切换当前激活的地图
     */
    switchMap(targetMapId) {
        const targetMap = this.maps[targetMapId];
        if (!targetMap) {
            console.error(`[MapRegistry] 目标地图 ${targetMapId} 不存在!`);
            return false;
        }

        // 1. 挂起当前地图 (如果有)
        const current = this.currentMap;
        
        if (current) {
            current.isActive = false;
        }

        // 2. 激活新地图
        this.activeMapId = targetMapId;
        targetMap.isActive = true;

        // 🟢 [新增] 自动切换/注册聊天频道
        if (window.uiStore && window.uiStore.chatData) {
            const channelId = this.getChannelId(targetMap);
            // 使用地图名作为频道显示名
            const channelName = targetMap.name || "未知区域"; 
            
            // 区分频道样式: MAIN -> 'MAIN', 其他 -> 'QUEST'
            const channelType = targetMap.type === 'MAIN' ? 'MAIN' : 'QUEST';

            // 1. 确保频道存在 (ChatData.registerChannel 内部有去重判断)
            window.uiStore.chatData.registerChannel(channelId, channelName, channelType);

            // 2. 切换 UI 视图到该频道
            window.uiStore.chatData.switchChannel(channelId);
            
            console.log(`[MapRegistry] 频道已同步: ${channelId}`);
        }

        // 🟢 [核心修复] 同步地图名与初始节点名到 UI Store
        if (window.uiStore && window.uiStore.worldState) {
            // 1. 同步地图名称
            window.uiStore.worldState.mapName = targetMap.name;
            
            // 2. 同步当前节点名称 (防止切换地图后节点名仍显示上一张图的旧节点)
            const currentNode = targetMap.nodes.find(n => n.id === targetMap.currentNodeId);
            if (currentNode) {
                window.uiStore.worldState.nodeName = currentNode.name;
            } else {
                window.uiStore.worldState.nodeName = "未知区域";
            }
        }

        // 3. 重置寿命 (如果是支线)
        if (targetMap.type === 'SUB') {
            targetMap.life = targetMap.maxLife;
        }

        // 4. 触发迷雾驱散 (通过 Manager 调用 Navigation 模块)
        // 逻辑：切换地图后，必须立即揭示当前位置周围的节点
        const currentNode = targetMap.nodes.find(n => n.id === targetMap.currentNodeId);
        if (currentNode) {
            // 检查 manager 是否具备 revealNeighbors 能力 (由 MapNavigation 提供)
            if (this.manager && typeof this.manager.revealNeighbors === 'function') {
                this.manager.revealNeighbors(currentNode);
            } else {
                console.warn("[MapRegistry] 切换地图成功，但 Manager 尚未挂载 Navigation 模块，无法自动驱散迷雾。");
            }
        }

        console.log(`[MapRegistry] 切换至地图: ${targetMap.name} (${targetMapId})`);
        return true;
    }
}
