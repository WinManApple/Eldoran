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

// src/map/MapManager.js
// @ts-nocheck
// 引入拆分后的子模块
import { MapRegistry } from './mapmanager_modules/MapRegistry.js';
import { MapNavigation } from './mapmanager_modules/MapNavigation.js';
import { SubMapService } from './mapmanager_modules/SubMapService.js';
import { MapEventProcessor } from './mapmanager_modules/MapEventProcessor.js';
import { MapSerializer } from './mapmanager_modules/MapSerializer.js';

/**
 * 世界管理器 (World Manager) - v3.0 集成版 (Facade)
 * 核心架构升级：
 * 本文件仅作为 API 统一入口与模块集成器，具体逻辑已拆分至 mapmanager_modules/ 目录。
 */
export class MapManager {

    constructor() {
        // 初始化子模块，并将自身 (this) 注入，实现上下文共享
        this.registry = new MapRegistry(this);
        this.navigation = new MapNavigation(this);
        this.subMapService = new SubMapService(this);
        this.eventProcessor = new MapEventProcessor(this);
        this.serializer = new MapSerializer(this);
    }

    // ==========================================
    // 🟢 新增：UI 同步辅助方法
    // ==========================================
    /**
     * 强制将当前地图状态同步到 Vue 全局 Store
     * 修复 UI 显示 "正在定位..." 的问题
     */
    _syncStateToUI() {
        if (!window.uiStore || !window.uiStore.worldState) return;
        
        const current = this.currentMap;
        if (current) {
            // 同步地图名称，如果没有名字则显示默认值
            window.uiStore.worldState.mapName = current.name || "未知区域";
            
            // 如果你需要同步环境类型，也可以在这里加
            // window.uiStore.worldState.environment = current.environment || "default";
            
            console.log(`[MapManager] UI 同步完成: ${window.uiStore.worldState.mapName}`);
        }
    }

    // ==========================================
    // 1. 状态访问代理 (State Proxy)
    // ==========================================

    /** 获取所有地图容器 */
    get maps() { return this.registry.maps; }
    
    /** 获取当前激活的地图对象 */
    get currentMap() { return this.registry.currentMap; }
    
    /** 获取当前激活的地图 ID */
    get activeMapId() { return this.registry.activeMapId; }
    
    /** 获取当前章节计数 */
    get chapterCount() { return this.registry.chapterCount; }

    /** 获取当前地图的所有节点 (辅助) */
    getCurrentNodes() {
        return this.currentMap ? this.currentMap.nodes : [];
    }

    // ==========================================
    // 2. 初始化与注册 (Registry Delegation)
    // ==========================================

    initNewGame(openingConfig) {
        this.registry.initNewGame(openingConfig);
        this._syncStateToUI(); // 🟢 修复：开局后同步 UI
    }

    registerMap(mapData) {
        this.registry.registerMap(mapData);
    }

    switchMap(targetMapId) {
        const result = this.registry.switchMap(targetMapId);
        this._syncStateToUI(); // 🟢 修复：切换地图后同步 UI
        return result;
    }
    
    // 辅助：获取任意地图
    getMap(mapId) {
        return this.registry.getMap(mapId);
    }

    // ==========================================
    // 3. 导航与探索 (Navigation Delegation)
    // ==========================================

    moveToNode(targetNodeId, force = false) {
        return this.navigation.moveToNode(targetNodeId, force);
    }

    revealNeighbors(centerNode) {
        this.navigation.revealNeighbors(centerNode);
    }

    triggerLazyGeneration(startLayer, count) {
        this.navigation.triggerLazyGeneration(startLayer, count);
    }

    getCurrentNodeLayer() {
        return this.navigation.getCurrentNodeLayer();
    }
    
    teleportToMap(targetMapId) {
        // teleportToMap 内部通常会调用 switchMap，但为了保险起见，这里不需要重复调用 _syncStateToUI，
        // 除非 navigation 内部绕过了 switchMap 直接修改 currentMap。
        // 假设 navigation.teleportToMap 最终调用了 registry.switchMap 或 this.switchMap。
        return this.navigation.teleportToMap(targetMapId);
    }

    // ==========================================
    // 4. 支线服务 (SubMap Delegation)
    // ==========================================

    mountSubMap(config) {
        this.subMapService.mountSubMap(config);
    }

    pruneSubMap(subMapId) {
        this.subMapService.pruneSubMap(subMapId);
    }

    createSubQuest(name, sourceNodeId) {
        return this.subMapService.createSubQuest(name, sourceNodeId);
    }

    getSubMaps() {
        return this.subMapService.getSubMaps();
    }

    togglePinSubMap(mapId) {
        return this.subMapService.togglePinSubMap(mapId);
    }

    tickWorldLife() {
        this.subMapService.tickWorldLife();
    }

    // ==========================================
    // 5. 事件回调 (Event Processor Delegation)
    // ==========================================

    resolveCombat(nodeId, outcome) {
        this.eventProcessor.resolveCombat(nodeId, outcome);
    }

    // ==========================================
    // 6. 持久化 (Serializer Delegation)
    // ==========================================

    serialize() {
        return this.serializer.serialize();
    }

    deserialize(data) {
        this.serializer.deserialize(data);
        this._syncStateToUI(); // 🟢 修复：读档后同步 UI
    }
}