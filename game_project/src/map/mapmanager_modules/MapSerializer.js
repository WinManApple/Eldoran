/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/map/mapmanager_modules/MapSerializer.js

/**
 * 子模块：持久化序列化器 (MapSerializer)
 * 职责：负责地图数据的导出(Save)与恢复(Load)，以及存档数据的清洗与迁移
 */
export class MapSerializer {

    constructor(manager) {
        this.manager = manager;
    }

    /**
     * 序列化当前世界状态
     */
    serialize() {
        const registry = this.manager.registry;
        // 🟢 [优化] 序列化时断开引用，防止外部直接修改 registry
        return {
            version: "2.0",
            activeMapId: registry.activeMapId,
            maps: JSON.parse(JSON.stringify(registry.maps)), 
            chapterCount: registry.chapterCount
        };
    }

    /**
     * 反序列化恢复世界状态
     */
    deserialize(data) {
        const registry = this.manager.registry;

        // 1. 坏档/空档检查
        if (!data || !data.maps) {
            console.warn("[MapSerializer] 无有效存档数据，初始化新游戏");
            registry.initNewGame();
            return;
        }

        console.log("[MapSerializer] 正在恢复世界状态...", data);

        // 🟢 [核心修复] 使用深拷贝阻断引用！
        // 这样游戏内的修改就不会污染到 SnapshotManager 里的存档副本
        registry.maps = JSON.parse(JSON.stringify(data.maps));
        
        registry.activeMapId = data.activeMapId;
        registry.chapterCount = data.chapterCount || 1;
        
        // 3. 数据清洗与兼容性处理 (Migration)
        Object.values(registry.maps).forEach(map => {
            if (map.type === 'SUB' && typeof map.isPinned === 'undefined') {
                map.isPinned = false; 
            }
        });
        
        // 4. 指针有效性检查
        if (!registry.currentMap) {
            console.error("[MapSerializer] 当前地图指针无效，重置回主线");
            registry.initNewGame(); 
        }
    }
}