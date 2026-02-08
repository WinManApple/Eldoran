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

/**
 * src/battle/combatant_modules/calculator.js
 * 负责所有的战斗数学公式：伤害计算、属性克制、抗性应用
 * 🟢 v3.0 重构版：适配 def_phys/def_magic 分离与属性字典对齐
 */
import { GameDatabase } from '../../config/GameDatabase.js';
import { store } from '../../ui/modules/store.js'
// 防御力减伤常数 (K值)。防御力等于此值时，减伤 50%。
// 可以根据游戏数值膨胀程度调整 (推荐 200-500)
const DEFENSE_CONSTANT = 200; 

/**
 * 核心：计算普通攻击伤害
 * @param {Object} actor - 攻击者实例
 * @param {Object} target - 目标实例
 */
export function calculateBasicDamage(actor, target) {
    // 1. 基础伤害 (使用 actor.atk)
    let damage = actor.atk;
    
    // 2. 判定暴击 (使用 actor.critRate / actor.critDamage)
    let isCritical = false;
    let critMultiplier = 1;
    // 安全钳制暴击率
    const effectiveCritRate = Math.min(Math.max(actor.critRate, 0), 1.0);
    
    if (Math.random() < effectiveCritRate) {
        isCritical = true;
        // 假设基础爆伤是 1.5 (150%)，actor.critDamage 是增量 (如 +0.5)
        // 或者 actor.critDamage 本身就是总倍率。
        // 根据之前的 stats.js 逻辑: actor.critDamage = 1 + s.final_crit_dmg
        critMultiplier = actor.critDamage;
    }
    
    // 3. 获取属性克制倍率
    const elementData = getElementMultiplier(actor.element, target.element);
    const elementMultiplier = elementData.multiplier; 
    
    // 4. 判定攻击类型 (物理 vs 魔法)
    // 默认为物理攻击 (空手或常规武器)
    let attackType = 'PHYSICAL';
    
    if (actor.sourceModel && actor.sourceModel.equipment.weapon) {
        const weapon = actor.sourceModel.equipment.weapon;
        // 支持动态对象 (LLM生成) 或 静态ID
        const weaponData = (typeof weapon === 'object') ? weapon : GameDatabase.Equipment[weapon];
        
        if (weaponData && weaponData.atk_type) {
            attackType = weaponData.atk_type;
        }
    }

    // 5. 获取防御侧数据 (def_phys vs def_magic)
    let targetDef = 0;
    let targetRes = 0;

    if (attackType === 'MAGIC') {
        targetDef = target.def_magic;
        targetRes = target.res_magic;
    } else {
        targetDef = target.def_phys;
        targetRes = target.res_phys;
    }

    // 6. 执行计算公式
    // Step A: 基础乘区
    let rawDamage = damage * critMultiplier * elementMultiplier;

    // Step B: 防御减伤 (减伤率公式)
    // 公式: 实际伤害 = 伤害 * (常数 / (常数 + 防御))
    // 例: 防御=200, 常数=200 -> 受到 50% 伤害
    const defMitigation = DEFENSE_CONSTANT / (DEFENSE_CONSTANT + Math.max(0, targetDef));
    rawDamage = rawDamage * defMitigation;

    // Step C: 抗性修正 (百分比直接增减)
    // res 为负数代表减伤 (如 -0.1 为减伤10%)，为正数代表易伤
    // multiplier = 1 + (-0.1) = 0.9
    const resMultiplier = 1.0 + targetRes;
    rawDamage = rawDamage * Math.max(0.1, resMultiplier); // 保底 10% 伤害防止变负数

    // 7. 应用难度与随机波动
    const finalDamage = applyDamageModifiers(actor, rawDamage, target);

    return {
        damage: finalDamage,
        isCritical: isCritical,
        isAdvantage: elementData.isAdvantage
    };
}

/**
 * 核心：计算技能伤害
 * @param {Object} actor - 施法者实例
 * @param {Object} skill - 技能对象 (支持动态注入)
 * @param {Object} target - 目标实例
 */
export function calculateSkillDamage(actor, skill, target) {
    // 1. 技能基础伤害 = 攻击力 * 倍率
    const powerMultiplier = skill.power !== undefined ? skill.power : 1.0;
    let damage = Math.floor(actor.atk * powerMultiplier);
    
    // 2. 判定暴击
    let isCritical = false;
    let critMultiplier = 1;
    const effectiveCritRate = Math.min(Math.max(actor.critRate, 0), 1.0);
    
    if (Math.random() < effectiveCritRate) {
        isCritical = true;
        critMultiplier = actor.critDamage;
    }
    
    // 3. 获取属性克制 (优先使用技能属性，否则使用角色属性)
    const skillElement = skill.element || actor.element || 'NONE';
    const elementData = getElementMultiplier(skillElement, target.element || 'NONE');
    const elementMultiplier = elementData.multiplier;
    
    // 4. 判定攻击类型 (物理 vs 魔法)
    const attackType = skill.atk_type || 'PHYSICAL';
    
    // 5. 获取防御侧数据
    let targetDef = 0;
    let targetRes = 0;

    if (attackType === 'MAGIC') {
        targetDef = target.def_magic;
        targetRes = target.res_magic;
    } else {
        targetDef = target.def_phys;
        targetRes = target.res_phys;
    }
    
    // 6. 执行计算公式
    let rawDamage = damage * critMultiplier * elementMultiplier;

    // 防御减伤
    const defMitigation = DEFENSE_CONSTANT / (DEFENSE_CONSTANT + Math.max(0, targetDef));
    rawDamage = rawDamage * defMitigation;

    // 抗性修正
    const resMultiplier = 1.0 + targetRes;
    rawDamage = rawDamage * Math.max(0.1, resMultiplier);

    // 7. 应用难度与随机波动
    const finalDamage = applyDamageModifiers(actor, rawDamage, target);
    
    return {
        damage: finalDamage,
        isCritical: isCritical,
        isAdvantage: elementData.isAdvantage
    };
}

/**
 * 应用伤害随机波动与难度修正
 */
export function applyDamageModifiers(actor, rawDamage, target) {
    // 1. 随机波动 (例如 0.2 代表 ±20%)
    const variance = store.config.battle.RNG.damageVariance || 0.2; 
    // randomFactor 在 [0.8, 1.2] 之间
    const randomFactor = 1 - variance + Math.random() * (variance * 2);
    
    let finalDamage = Math.floor(rawDamage * randomFactor);

    // 2. 应用难度系数
    if (actor.isPlayer) {
        // 玩家攻击敌人 -> 应用玩家伤害倍率 (如难度高时，玩家伤害可能降低)
        const multiplier = store.config.battle.Difficulty.playerDamageMultiplier || 1.0;
        finalDamage = Math.floor(finalDamage * multiplier);
    } else {
        // 敌人攻击玩家 -> 应用敌人伤害倍率 (如难度高时，敌人伤害增加)
        const multiplier = store.config.battle.Difficulty.enemyDamageMultiplier || 1.0;
        finalDamage = Math.floor(finalDamage * multiplier);
    }

    return Math.max(1, finalDamage); // 至少造成 1 点伤害
}

/**
 * 获取属性克制数据
 */
export function getElementMultiplier(attackerElement, defenderElement) {
    let result = { multiplier: 1.0, isAdvantage: false };
    
    if (!attackerElement || !defenderElement || attackerElement === 'NONE' || defenderElement === 'NONE') {
        return result;
    }

    // 克制关系表
    const advantages = {
        'FIRE': 'WOOD', 
        'WOOD': 'EARTH', 
        'EARTH': 'METAL', 
        'METAL': 'WATER', 
        'WATER': 'FIRE',
        // 光暗互克
        'HOLY': 'DEMON',
        'DEMON': 'HOLY'
    };

    if (advantages[attackerElement] === defenderElement) {
        // 读取配置中的克制倍率，默认为 1.5
        result.multiplier = store.config.battle.Mechanics.elementalAdvantage || 1.5;
        result.isAdvantage = true;
    } 

    return result;
}