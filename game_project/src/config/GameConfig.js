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

// src/config/GameConfig.js

// 引入战斗默认配置 (作为出厂设置)
import { BattleConfig } from '../battle/BattleConfig.js';

/**
 * 全局游戏配置默认模板
 * 注意：这些值将作为 store.config 的初始状态。
 * 游戏运行时的实际数值请直接访问 store.config，不要直接引用此文件。
 */
export const DefaultGameConfig = {
    // ==========================================
    // 1. 战斗系统 (Battle)
    // ==========================================
    // 直接解构 BattleConfig，包含 Difficulty, RNG, Mechanics, Settings
    battle: {
        ...BattleConfig
    },

    team: {
        maxDeployed: 4 // 最大同时出战人数
    },

    // ==========================================
    // 2. AI 与 记忆管理 (AI & Memory)
    // ==========================================
    // 源自 Call_Chat.js 的 CONFIG
    ai: {
        chat: {
            maxRecentInteractions: 10,  // 触发"阶段总结"的近期对话条数阈值
            maxSummaries: 5,            // 触发"宏观总结"的阶段总结条数阈值
            retentionRecent: 5,         // 总结发生后，保留的近期对话条数 (维持上下文连贯性)
            retentionSummary: 3         // 宏观总结发生后，保留的阶段总结条数
        }
    },

    // ==========================================
    // 3. 地图与生成 (Map & Generation)
    // ==========================================
    // 源自 MapNavigation.js 的静态属性
    map: {
        lazyGenLayers: 3,    // 惰性加载触发时，每次预生成的层数
        initialGenLayers: 1  // 进入新章节时，初始生成的层数 (需与 Registry 保持一致)
    }


};