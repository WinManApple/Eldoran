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
 * 🟢 v3.1 修复版：修正抗性计算公式与全局倍率应用
 */
import { GameDatabase } from '../../config/GameDatabase.js';
import { store } from '../../ui/modules/store.js'

/**
 * 核心：计算普通攻击伤害
 */
export function calculateBasicDamage(actor, target) {
    // 1. 基础伤害
    let damage = actor.atk;
    
    // 2. 判定暴击
    let isCritical = false;
    let critMultiplier = 1;
    const effectiveCritRate = Math.min(Math.max(actor.critRate, 0), 1.0);
    
    if (Math.random() < effectiveCritRate) {
        isCritical = true;
        critMultiplier = actor.critDamage;
    }
    
    // 3. 属性克制
    const elementData = getElementMultiplier(actor.element, target.element);
    
    // 4. 判定攻击类型 (物理/魔法)
    let attackType = 'PHYSICAL';
    if (actor.sourceModel && actor.sourceModel.equipment.weapon) {
        const weapon = actor.sourceModel.equipment.weapon;
        const weaponData = (typeof weapon === 'object') ? weapon : GameDatabase.Equipment[weapon];
        if (weaponData && weaponData.atk_type) {
            attackType = weaponData.atk_type;
        }
    }

    // 5. 获取综合抗性 (分母)
    const currentRes = (attackType === 'MAGIC') ? target.res_magic : target.res_phys;

    // 6. 执行计算
    // 原始伤害 = 面板 * 暴击 * 克制
    let rawDamage = damage * critMultiplier * elementData.multiplier;

    // 🟢 [关键修复] 应用抗性减免 (倒数模型)
    // 最终伤害 = 原始伤害 * (1 / 抗性值)
    // 抗性值越高，分数越小，伤害越低
    const resFactor = 1 / Math.max(0.1, currentRes); 
    rawDamage = rawDamage * resFactor;

    // 7. 应用全局难度倍率与浮动
    const finalDamage = applyDamageModifiers(actor, rawDamage, target);

    return {
        damage: finalDamage,
        isCritical: isCritical,
        isAdvantage: elementData.isAdvantage
    };
}

/**
 * 核心：计算技能伤害
 */
export function calculateSkillDamage(actor, skill, target) {
    // 1. 技能倍率
    let defaultPower = 1.0;
    if (skill.targetType === 'ally' && skill.power === undefined) {
        defaultPower = 0;
    }
    const powerMultiplier = skill.power !== undefined ? skill.power : defaultPower;
    
    let damage = Math.floor(actor.atk * powerMultiplier);
    
    // 2. 暴击
    let isCritical = false;
    let critMultiplier = 1;
    const effectiveCritRate = Math.min(Math.max(actor.critRate, 0), 1.0);
    
    if (Math.random() < effectiveCritRate) {
        isCritical = true;
        critMultiplier = actor.critDamage;
    }
    
    // 3. 属性克制
    const skillElement = skill.element || actor.element || 'NONE';
    const elementData = getElementMultiplier(skillElement, target.element || 'NONE');
    
    // 4. 攻击类型
    const attackType = skill.atk_type || 'PHYSICAL';
    
    // 5. 获取综合抗性
    const currentRes = (attackType === 'MAGIC') ? target.res_magic : target.res_phys;
    
    // 6. 执行计算
    let rawDamage = damage * critMultiplier * elementData.multiplier;

    // 🟢 [关键修复] 恢复被删除的抗性计算行
    const resFactor = 1 / Math.max(0.1, currentRes);
    rawDamage = rawDamage * resFactor;

    // 🔴 [已删除] 之前报错的 rawDamage = rawDamage * Math.max(0.1, resMultiplier);

    if (Math.floor(rawDamage) <= 0) {
        return {
            damage: 0,
            isCritical: false,
            isAdvantage: false
        };
    }

    // 7. 应用全局难度倍率
    const finalDamage = applyDamageModifiers(actor, rawDamage, target);
    
    return {
        damage: finalDamage,
        isCritical: isCritical,
        isAdvantage: elementData.isAdvantage
    };
}

/**
 * 应用伤害随机波动与全局难度修正
 */
export function applyDamageModifiers(actor, rawDamage, target) {
    // 1. 随机波动 (默认 ±10%)
    // 优先读取配置，如果读取不到则给默认值 0.1
    const rngConfig = store.config.battle?.RNG || {};
    const variance = rngConfig.damageVariance !== undefined ? rngConfig.damageVariance : 0.1; 
    
    const randomFactor = 1 - variance + Math.random() * (variance * 2);
    let finalDamage = Math.floor(rawDamage * randomFactor);

    // 2. 应用全局难度系数 (Difficulty Multiplier)
    const diffConfig = store.config.battle?.Difficulty || {};

    if (actor.isPlayer) {
        // 🟢 玩家攻击敌人 -> 乘算 playerDamageMultiplier
        // 你的截图中这个值是 0.1，意味着最终伤害会变成原来的 1/10
        const multiplier = diffConfig.playerDamageMultiplier !== undefined ? diffConfig.playerDamageMultiplier : 1.0;
        finalDamage = Math.floor(finalDamage * multiplier);
    } else {
        // 敌人攻击玩家 -> 乘算 enemyDamageMultiplier
        const multiplier = diffConfig.enemyDamageMultiplier !== undefined ? diffConfig.enemyDamageMultiplier : 1.0;
        finalDamage = Math.floor(finalDamage * multiplier);
    }

    return Math.max(1, finalDamage); // 保底 1 点伤害
}

/**
 * 获取属性克制数据
 */
export function getElementMultiplier(attackerElement, defenderElement) {
    let result = { multiplier: 1.0, isAdvantage: false };
    
    if (!attackerElement || !defenderElement || attackerElement === 'NONE' || defenderElement === 'NONE') {
        return result;
    }

    const advantages = {
        'FIRE': 'WOOD', 
        'WOOD': 'EARTH', 
        'EARTH': 'METAL', 
        'METAL': 'WATER', 
        'WATER': 'FIRE',
        'HOLY': 'DEMON',
        'DEMON': 'HOLY'
    };

    if (advantages[attackerElement] === defenderElement) {
        // 读取配置中的克制倍率，默认为 1.5
        const mechConfig = store.config.battle?.Mechanics || {};
        result.multiplier = mechConfig.elementalAdvantage || 1.5;
        result.isAdvantage = true;
    } 

    return result;
}