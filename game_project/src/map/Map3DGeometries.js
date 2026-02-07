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

// src/map/Map3DGeometries.js
import { NodeType } from './MapData.js';

/**
 * 3D 几何体数据工厂 (OBJ 驱动版)
 * 职责：从 Phaser Cache 中读取 .obj 文件文本，解析为顶点与连线数据。
 */

// 映射表：NodeType -> Phaser Cache Key (文件名无后缀)
const OBJ_MAPPING = {
    [NodeType.ROOT]:       'root',
    [NodeType.COMBAT]:     'combat',
    [NodeType.EVENT_CHOICE]: 'event_choice',
    [NodeType.EVENT_H]:    'event_H',
    [NodeType.EVENT_QUEST]: 'event_quest',
    [NodeType.RESOURCE]:   'resource',
    [NodeType.SHOP]:       'shop',
    [NodeType.REST]:       'rest',
    [NodeType.PORTAL_NEXT_FLOOR]: 'next_floor',   // 深层入口
    [NodeType.PORTAL_NEXT_CHAPTER]: 'portal',      // 章节出口 & 支线入口 (共用模型)
    [NodeType.LOCATION]: 'location'    // 注册地标模型映射
};

export class Map3DGeometries {

    constructor() {
        // 缓存解析后的几何体数据 { vertices, edges }
        this.cache = {};
        
        // 生成一个兜底用的几何体 (避免资源未加载时报错)
        this.defaultGeometry = this._createFallbackCube();
    }

    /**
     * 静态获取映射配置，供 BootScene 加载资源时参考
     */
    static get MAPPING() {
        return OBJ_MAPPING;
    }

    /**
     * [核心] 批量从场景缓存中加载并解析 OBJ
     * 通常在 MapRenderer 初始化或 Scene Create 阶段调用
     * @param {Phaser.Scene} scene - 拥有 cache 的场景对象
     */
    initFromScene(scene) {
        console.log("Map3DGeometries: 开始批量解析 OBJ 模型...");
        
        Object.entries(OBJ_MAPPING).forEach(([nodeType, cacheKey]) => {
            if (scene.cache.text.exists(cacheKey)) {
                const objText = scene.cache.text.get(cacheKey);
                // 这里统一设定缩放比例，例如 15，根据你的美术资源实际大小调整
                const parsedData = this._parseOBJ(objText, 15); 
                this.cache[nodeType] = parsedData;
                console.log(` - 已注册模型: [${nodeType}] -> ${cacheKey}.obj`);
            } else {
                console.warn(`[Map3DGeometries] 警告: 未在 Cache 中找到 key 为 '${cacheKey}' 的文本资源。将使用默认方块。`);
            }
        });
    }

    /**
     * 根据节点类型获取几何体数据
     * @param {string} type - 节点类型 (NodeType)
     * @returns {Object} { vertices: [{x,y,z}], edges: [[i,j]] }
     */
    getGeometry(type) {
        // 优先返回缓存的 OBJ 数据
        if (this.cache[type]) {
            return this.cache[type];
        }
        // 没找到则返回兜底方块
        return this.defaultGeometry;
    }

    /**
     * 手动注册 (用于动态更新或调试)
     */
    registerOBJ(type, objText, scale = 15) {
        this.cache[type] = this._parseOBJ(objText, scale);
    }

    // ==========================================
    // OBJ 解析器 (保持不变)
    // ==========================================
    
    _parseOBJ(text, scale = 1) {
        const vertices = [];
        const edges = [];
        const edgeSet = new Set();
        const getEdgeKey = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;

        const lines = text.split('\n');

        lines.forEach(line => {
            line = line.split('#')[0].trim();
            if (!line) return;

            const parts = line.split(/\s+/);
            const type = parts[0];

            if (type === 'v') {
                // v x y z
                // 翻转 Y 轴以适配 WebGL/Phaser 坐标系习惯
                vertices.push({
                    x: parseFloat(parts[1]) * scale,
                    y: -parseFloat(parts[2]) * scale, 
                    z: parseFloat(parts[3]) * scale
                });
            } else if (type === 'f') {
                // f v1 v2 v3 ...
                const indices = parts.slice(1).map(p => parseInt(p.split('/')[0]) - 1);

                for (let i = 0; i < indices.length; i++) {
                    const start = indices[i];
                    const end = indices[(i + 1) % indices.length];

                    if (vertices[start] && vertices[end]) {
                        const key = getEdgeKey(start, end);
                        if (!edgeSet.has(key)) {
                            edgeSet.add(key);
                            edges.push([start, end]);
                        }
                    }
                }
            }
        });

        return { vertices, edges };
    }

    // ==========================================
    // 兜底数据 (Fallback)
    // ==========================================

    _createFallbackCube() {
        const s = 10; // 大小
        const vertices = [
            {x:-s, y:-s, z:-s}, {x: s, y:-s, z:-s}, {x: s, y: s, z:-s}, {x:-s, y: s, z:-s},
            {x:-s, y:-s, z: s}, {x: s, y:-s, z: s}, {x: s, y: s, z: s}, {x:-s, y: s, z: s}
        ];
        const edges = [
            [0,1], [1,2], [2,3], [3,0],
            [4,5], [5,6], [6,7], [7,4],
            [0,4], [1,5], [2,6], [3,7]
        ];
        return { vertices, edges };
    }
}