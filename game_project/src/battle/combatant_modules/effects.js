/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
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
 * src/battle/combatant_modules/effects.js
 * 负责管理 Buff、Debuff、DOT 的生命周期与逻辑应用
 */
import { updateStats } from './stats.js';

/**
 * 应用一个新的 Buff 或叠加现有 Buff
 * @param {Object} actor - Combatant 实例
 * @param {Object} buff - Buff 数据对象
 */
export function applyBuff(actor, buff) {
    const existingIndex = actor.buffs.findIndex(b => b.type === buff.type);
    
    if (existingIndex >= 0) {
        // 叠加逻辑：更新数值并取最大持续时间
        const existing = actor.buffs[existingIndex];
        if (buff.value) existing.value = (existing.value || 0) + buff.value;
        if (buff.level) existing.level = (existing.level || 0) + buff.level;
        existing.duration = Math.max(existing.duration, buff.duration);
        
        updateStats(actor); // 刷新属性
        return 'stacked';
    } else {
        // 新增逻辑：深拷贝防止引用污染
        actor.buffs.push(JSON.parse(JSON.stringify(buff))); 
        updateStats(actor);
        return 'added';
    }
}

/**
 * 每回合更新效果状态（持续时间减1，结算 DOT）
 * @param {Object} actor - Combatant 实例
 * @returns {number} 产生的总 DOT 伤害值
 */
export function updateEffects(actor) {
    // 1. 更新 Buff 持续时间
    actor.buffs = actor.buffs.filter(buff => {
        buff.duration--;
        return buff.duration > 0;
    });
    
    // 2. 更新属性 (因为 Buff 消失可能导致属性变动)
    updateStats(actor);
    
    // 3. 更新 Debuff 持续时间
    actor.debuffs = actor.debuffs.filter(debuff => {
        debuff.duration--;
        return debuff.duration > 0;
    });
    
    // 4. 结算 DOT (持续伤害)
    let dotDamage = 0;
    actor.dots = actor.dots.filter(dot => {
        dot.duration--;
        dotDamage += (dot.damage || 0);
        return dot.duration > 0;
    });
    
    if (dotDamage > 0) {
        actor.hp = Math.max(0, actor.hp - dotDamage);
    }

    // 5. 更新状态标识：检查是否依然处于眩晕状态
    actor.isStunned = actor.debuffs.some(d => d.type === 'stun');
    
    return dotDamage;
}

/**
 * 将技能/物品的 effectData 转化为具体的战斗状态
 * 🟢 支持动态解析：即使是数据库未定义的属性，只要符合格式即可转换
 */
export function applySkillEffect(actor, effectData, target) {
    if (!effectData) return false;

    // A. 属性修改类 (Stat Buffs)
    if (effectData.stat) {
        // 直接使用属性字典的 Key，不再重命名
        // 允许的 Key: 'atk', 'def_phys', 'def_magic', 'speed', 'critRate', 'dodgeRate' 等
        
        applyBuff(actor, { 
            type: effectData.stat, // 直接透传 Key
            value: effectData.value, 
            duration: effectData.duration, 
            level: effectData.level || 1 
        });
        return true;
    }
    // B. 状态异常类 (如眩晕) 🟢 注入概率逻辑
    else if (effectData.type === 'STUN' || (effectData.duration && !effectData.stat)) {
        // 1. 确定生效概率：如果定义了 chance 则使用，否则默认为 0.1 (10%)
        const successChance = (effectData.chance !== undefined) ? effectData.chance : 0.1;

        // 2. 进行随机判定
        if (Math.random() < successChance) {
            target.isStunned = true;
            target.debuffs.push({ 
                type: 'stun', 
                duration: effectData.duration || 1 
            });
            return true;
        } else {
            return false;
        }
    }
    // 🟢  C. 持续伤害类 (DOT)
    // 逻辑：识别包含 damage 字段且没有 stat 字段的效果
    else if (effectData.damage && !effectData.stat) {
        // 1. 确定概率：使用定义值，否则默认为 10% (0.1)
        const successChance = (effectData.chance !== undefined) ? effectData.chance : 0.1;

        // 2. 概率判定
        if (Math.random() < successChance) {
            // 3. 注入到目标的 dots 数组中
            // 战斗引擎 updateEffects 每回合会自动结算这里的数值
            target.dots.push({
                dotType: effectData.dotType || '未知', // 用于 UI 显示
                damage: effectData.damage || 0,       // 每回合扣血量
                duration: effectData.duration || 1     // 持续回合
            });
            return true;
        } else {
            return false;
        }
    }
}