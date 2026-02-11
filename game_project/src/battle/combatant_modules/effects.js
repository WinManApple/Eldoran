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
 * 🟢 [重构] 返回详细的执行结果数组，用于精准日志显示
 * @returns {Object} { anySuccess: Boolean, outcomes: Array }
 */
export function applySkillEffect(actor, effectData, target) {
    // 统一返回结构
    let result = {
        anySuccess: false,
        outcomes: [] // 结构: { type: 'BUFF'|'DOT'|'STUN', name: string, isSuccess: boolean }
    };

    if (!effectData) return result;

    // 1. 递归处理数组
    if (Array.isArray(effectData)) {
        effectData.forEach(subEffect => {
            const subRes = applySkillEffect(actor, subEffect, target);
            if (subRes.anySuccess) result.anySuccess = true;
            result.outcomes = result.outcomes.concat(subRes.outcomes);
        });
        return result;
    }

    // 2. 单个效果处理
    
    // 获取概率 (默认 0.1 / 10%)
    // 注意：如果是属性Buff(stat)，通常默认是 1.0 (100%)，除非显式定义了 chance
    let defaultChance = 0.1; 
    if (effectData.stat) defaultChance = 1.0; // Buff 类默认必中

    const chance = (effectData.chance !== undefined) ? effectData.chance : defaultChance;
    const roll = Math.random();
    const isSuccess = roll < chance;

    // A. 属性修改类 (Stat Buffs)
    if (effectData.stat) {
        if (isSuccess) {
            applyBuff(target, { 
                type: effectData.stat, 
                value: effectData.value, 
                duration: effectData.duration, 
                level: effectData.level || 1 
            });
            result.anySuccess = true;
        }
        
        // 记录战报
        result.outcomes.push({
            type: 'BUFF',
            name: effectData.value < 0 || (effectData.stat||'').startsWith('res_') ? '属性削弱' : '状态提升',
            isSuccess: isSuccess,
            detail: effectData.stat // 供日志细化使用
        });
    }

    // B. 状态异常类 (眩晕)
    else if (effectData.type === 'STUN' || (effectData.duration && !effectData.stat && !effectData.damage && !effectData.dotType)) {
        if (isSuccess) {
            target.isStunned = true;
            target.debuffs.push({ type: 'stun', duration: effectData.duration || 1 });
            result.anySuccess = true;
        }
        result.outcomes.push({
            type: 'STUN',
            name: '眩晕',
            isSuccess: isSuccess
        });
    }

    // C. 持续伤害类 (DOT)
    else if (effectData.damage || effectData.dotType || effectData.type === 'DOT') {
        const dotName = effectData.dotType || '持续伤害';
        if (isSuccess) {
            target.dots.push({
                dotType: dotName,
                damage: effectData.damage || 0,
                duration: effectData.duration || 3
            });
            result.anySuccess = true;
        }
        result.outcomes.push({
            type: 'DOT',
            name: dotName,
            isSuccess: isSuccess
        });
    }

    // 🟢 [新增] D. 治疗类 (HEAL)
    // 识别条件: type='HEAL' 或 effect='heal' (兼容旧写法)
    else if (effectData.type === 'HEAL' || effectData.effect === 'heal') {
        let amt = 0;
        
        // 计算治疗量
        if (effectData.healAmount) {
            amt = effectData.healAmount; // 固定数值
        } 
        else if (effectData.healPercent || effectData.value) {
            // 百分比 (优先用 healPercent, 兼容 value)
            const pct = effectData.healPercent || effectData.value;
            amt = Math.floor(target.maxHp * pct);
        }

        if (amt > 0) {
            const oldHp = target.hp;
            target.hp = Math.min(target.maxHp, target.hp + amt);
            const realHeal = target.hp - oldHp;
            
            result.anySuccess = true;
            result.outcomes.push({
                type: 'HEAL',
                value: realHeal,
                isSuccess: true
            });
        }
    }

    return result;
}