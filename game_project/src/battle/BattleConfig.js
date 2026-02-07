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

/**
 * js/config.js
 * 战斗系统全局配置
 * 包含：难度倍率、随机性参数、核心机制参数
 */

export const BattleConfig = {
    // 1. 难度总控制器 (数值越大，玩家越强；数值越小，游戏越难)
    Difficulty: {
        playerDamageMultiplier: 20.1,    // 玩家造成的伤害倍率 (1.0 = 100%)
        enemyDamageMultiplier: 0.05,     // 敌人造成的伤害倍率 (如果你觉得太难，可以改成 0.8)
        enemyHpMultiplier: 1.0,         // 敌人血量倍率 (用于快速增加怪物肉度)
        xpGainMultiplier: 1.0,          // 经验获取倍率 
    },

    // 2. 基础属性与随机性 (RNG)
    RNG: {
        baseCritRate: 0.25,             // 基础暴击率
        critDamageMultiplier: 1.5,      // 暴击伤害倍率 (1.5倍)
        baseDodgeRate: 0.1,             // 基础闪避率
        damageVariance: 0.1,            // 伤害浮动范围 (±10%)
    },

    // 3. 战斗机制参数 (核心公式参数)
    Mechanics: {
        baseFleeChance: 1.0,            // 基础逃跑成功率
        elementalAdvantage: 1.5,        // 属性克制倍率 (例如: 火打木)
        elementalDisadvantage: 1.0,     // 属性被克制倍率 (例如: 火打水)
        defenseBalanceFactor: 100,      // 防御公式常数 K: 减伤 = Def / (Def + K)
        speedLevelWeight: 0.2,          // 等级对速度的影响系数
        mpCostMultiplier: 1.0,          // 蓝耗倍率
    },

    // 4. UI与动画设置
    Settings: {
        animationSpeed: 1000,           // 敌人行动思考时间 (毫秒)
        logMaxEntries: 50,              // 战斗日志最大保留行数
    }
};