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

// src/LLM/calls/Call_Map_Named.js

import { LLMCommands } from '../../config/Protocol.js';
import { TAG as Tag_Map } from '../actions/Action_Map_Named.js';

/**
 * 地图命名请求构建器 (Call)
 * 职责：将原始 MapData 清洗为 LLM 易读的 JSON 骨架
 */
export const Call_Map_Named = {

    /**
     * 构建请求数据
     * @param {Object} mapData - 原始地图对象 (MapManager.currentMap)
     * @returns {Object} 包含 command 和 payload 的请求对象
     */
    constructRequest(mapData) {
        if (!mapData) {
            console.warn("[Call_Map_Named] 收到空的 mapData");
            return null;
        }

        // 1. 提取元数据
        const meta = {
            mapId: mapData.mapId,
            type: mapData.type,       // MAIN | SUB
            themeId: mapData.themeId, // 如 'THEME_FOREST'
            currentName: mapData.name // 当前名称 (可能是 "新章节1：...")
        };

        // 2. 清洗节点数据 (只保留 LLM 需要的字段)
        // 过滤掉: x, y, layerIndex, state, portalTarget 等引擎数据
        const simplifiedNodes = mapData.nodes.map(node => {
            // 提取 payload 中的现有描述 (如果有)
            let desc = "";
            if (node.payload && node.payload.description) {
                desc = node.payload.description;
            }

            return {
                id: node.id,
                type: node.type,
                name: node.name || "(待命名)",
                description: desc || "" // 初始为空，等待 LLM 填空
            };
        });

        // 3. 组装最终 Payload
        // 对应 Protocol.js 中的 LLMCommands.MAP_INIT 或类似指令
        return {
            command: LLMCommands.MAP_INIT || 'MAP_INIT', 
            expectedTags: [Tag_Map],
            params: {
                context: meta,
                nodes: simplifiedNodes
            }
        };
    }
};

// 兼容旧代码的引用习惯 (可选)
export const Call_MapInit = {
    requestMapGeneration: (mapData) => {
        // 这里只是为了兼容旧接口，实际逻辑应该由 Game_Manager 统一调度
        console.log("[Call_Map_Named] 兼容接口被调用，建议迁移至 Game_Manager.sendRequest");
        // 实际上这里应该触发 Game_Manager 的逻辑，暂时留空或打印日志
    }
};