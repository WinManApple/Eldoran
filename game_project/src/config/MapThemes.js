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

// src/config/MapThemes.js
import { NodeType } from '../map/MapData.js';

/**
 * 地图主题配置表
 * 定义了不同区域的节点分布(distribution)、深度(depth)与保底节点(mandatory)
 * * 适配开局背景：
 * 1. THEME_FOREST:      墓苏醒 (莉莉丝线)
 * 2. THEME_BATTLEFIELD: 战场炮灰 (女长官线)
 * 3. THEME_MOUNTAIN:    深山魔法学徒 (女师傅线)
 * 4. THEME_WASTELAND:   流放荒野求生 (单人硬核)
 * 5. THEME_DUNGEON:     魔族祭品 (单人逃脱)
 * 6. THEME_CITY:        城市贵族 (单人经营/社交)
 */
export const MapTheme = {
    
    // ============================================================
    // 1. 墓苏醒 (对应 FOREST) - 经典开局，平衡型
    // ============================================================
    THEME_FOREST: {
        id: 'THEME_FOREST',
        name: '幽寂森林与古墓',
        depthRange: [3, 4],
        nodeCountRange: [3, 5],
        hasPortal: true,
        allowCombat: true,
        // 森林中容易遇到资源，也容易迷路(LOCATION)
        mandatoryNodes: [NodeType.COMBAT, NodeType.RESOURCE, NodeType.LOCATION],
        distribution: {
            [NodeType.COMBAT]:       0.30,
            [NodeType.RESOURCE]:     0.30, // 丰富的采集资源
            [NodeType.LOCATION]:     0.20, // 废弃墓碑、古树、迷雾小径
            [NodeType.EVENT_CHOICE]: 0.10,
            [NodeType.REST]:         0.10
        }
    },

    // ============================================================
    // 2. 战场炮灰 - 高压战斗，资源匮乏
    // ============================================================
    THEME_BATTLEFIELD: {
        id: 'THEME_BATTLEFIELD',
        name: '焦土前线',
        depthRange: [4, 6],
        nodeCountRange: [4, 6],
        hasPortal: true,
        allowCombat: true,
        mandatoryNodes: [NodeType.COMBAT, NodeType.REST],
        distribution: {
            [NodeType.COMBAT]:       0.55, // 极高的战斗频率
            [NodeType.LOCATION]:     0.20, // 战壕、废弃掩体、弹坑
            [NodeType.RESOURCE]:     0.10, // 资源稀缺 (搜刮尸体)
            [NodeType.EVENT_CHOICE]: 0.10, // 战术抉择
            [NodeType.REST]:         0.05  // 很难找到休息点
        }
    },

    // ============================================================
    // 3. 深山魔法学徒 - 隐居修行，事件与探索为主
    // ============================================================
    THEME_MOUNTAIN: {
        id: 'THEME_MOUNTAIN',
        name: '云隐深山',
        depthRange: [3, 5],
        nodeCountRange: [3, 4],
        hasPortal: true,
        allowCombat: true,
        mandatoryNodes: [NodeType.RESOURCE, NodeType.EVENT_CHOICE, NodeType.LOCATION],
        distribution: {
            [NodeType.RESOURCE]:     0.35, // 采药、矿石
            [NodeType.LOCATION]:     0.30, // 试炼场、冥想石、悬崖
            [NodeType.COMBAT]:       0.15, // 少量野兽
            [NodeType.EVENT_CHOICE]: 0.15, // 师傅的考验、突发事件
            [NodeType.REST]:         0.05
        }
    },

    // ============================================================
    // 4. 流放荒野求生 - 资源搜集与生存挑战
    // ============================================================
    THEME_WASTELAND: {
        id: 'THEME_WASTELAND',
        name: '无尽荒原',
        depthRange: [5, 8], // 漫长的旅途
        nodeCountRange: [4, 5],
        hasPortal: true,
        allowCombat: true,
        mandatoryNodes: [NodeType.COMBAT, NodeType.RESOURCE],
        distribution: {
            [NodeType.RESOURCE]:     0.40, // 必须通过拾荒生存
            [NodeType.COMBAT]:       0.30, // 荒原掠夺者、变异生物
            [NodeType.LOCATION]:     0.15, // 废墟、枯井
            [NodeType.EVENT_CHOICE]: 0.10,
            [NodeType.REST]:         0.05
        }
    },

    // ============================================================
    // 5. 魔族祭品 - 压抑的逃脱战，抉择与H事件高发
    // ============================================================
    THEME_DUNGEON: {
        id: 'THEME_DUNGEON',
        name: '魔王城地牢',
        depthRange: [4, 5],
        nodeCountRange: [3, 5],
        hasPortal: true,
        allowCombat: true,
        mandatoryNodes: [NodeType.COMBAT, NodeType.EVENT_CHOICE],
        distribution: {
            [NodeType.COMBAT]:       0.35, // 狱卒、魔物
            [NodeType.EVENT_CHOICE]: 0.25, // 逃跑路线选择、机关
            [NodeType.EVENT_H]:      0.15, // 魅魔、调教事件 (符合祭品设定)
            [NodeType.LOCATION]:     0.15, // 刑讯室、黑暗走廊
            [NodeType.RESOURCE]:     0.10
        }
    },

    // ============================================================
    // 6. 城市贵族 - 社交、贸易与地标
    // ============================================================
    THEME_CITY: {
        id: 'THEME_CITY',
        name: '王都下城区', // 即使是贵族，冒险也多发生在鱼龙混杂之地
        depthRange: [2, 3], // 城市地图通常较浅
        nodeCountRange: [4, 6],
        hasPortal: true,
        allowCombat: true, // 巷战、刺客
        mandatoryNodes: [NodeType.SHOP, NodeType.LOCATION],
        distribution: {
            [NodeType.SHOP]:         0.30, // 高频的商业互动
            [NodeType.LOCATION]:     0.30, // 广场、酒馆、贵族宅邸 (地标大显身手)
            [NodeType.EVENT_CHOICE]: 0.20, // 社交舞会、政治阴谋
            [NodeType.COMBAT]:       0.10, // 治安较好，战斗少
            [NodeType.RESOURCE]:     0.10  // 捡漏
        }
    },

    // ============================================================
    // 默认兜底配置
    // ============================================================
    DEFAULT: {
        id: 'THEME_DEFAULT',
        name: '未知领域',
        depthRange: [3, 5],
        nodeCountRange: [3, 5],
        hasPortal: true,
        allowCombat: true,
        mandatoryNodes: [NodeType.COMBAT, NodeType.RESOURCE],
        distribution: {
            [NodeType.COMBAT]: 0.3,
            [NodeType.RESOURCE]: 0.3,
            [NodeType.LOCATION]: 0.2,
            [NodeType.EVENT_CHOICE]: 0.1,
            [NodeType.REST]: 0.1
        }
    }
};