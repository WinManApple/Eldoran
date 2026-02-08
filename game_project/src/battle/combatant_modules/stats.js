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
 * src/battle/combatant_modules/stats.js
 * 负责属性更新与行动点 (AP) 计算
 */
import { store } from '../../ui/modules/store.js'

/**
 * 更新角色的战斗属性
 * 🟢 核心升级：完全适配属性字典 (Stats Dictionary)
 */
export function updateStats(actor) {
    // 1. 重置为基础值 (Base)
    actor.atk = actor.base_atk;
    actor.def_phys = actor.base_def_phys;
    actor.def_magic = actor.base_def_magic;
    
    // 如果没有绑定模型，这些高级属性也需要重置回基础值
    if (!actor.sourceModel) {
        actor.critRate = actor.baseCritRate;
        actor.critDamage = actor.baseCritDmgMult || 1.5;
        actor.dodgeRate = 0.1; // 默认值
    }

    // 2. 遍历 Buffs 进行叠加计算
    actor.buffs.forEach(buff => {
        const val = buff.value || 0;
        
        // 🟢 使用与属性字典完全一致的 Switch Case
        switch(buff.type) {
            case 'atk': 
                // 攻击力提升 (百分比)
                actor.atk = Math.floor(actor.atk * (1 + val)); 
                break;
                
            case 'def_phys': 
                // 物理防御提升 (百分比)
                actor.def_phys = Math.floor(actor.def_phys * (1 + val)); 
                break;
                
            case 'def_magic': 
                // 魔法防御提升 (百分比)
                actor.def_magic = Math.floor(actor.def_magic * (1 + val)); 
                break;
                
            case 'speed': 
                // 速度不需要在这里直接修改 actor.speed 属性，
                // 而是会在 calculateActionPoints 中被调用 (buff.type === 'speed')
                break;
                
            case 'critRate': 
                // 暴击率 (直接加算)
                actor.critRate += val; 
                break;
                
            case 'critDamage': 
                // 暴击伤害 (直接加算)
                actor.critDamage += val; 
                break;
                
            case 'dodgeRate': 
                // 闪避率 (直接加算)
                actor.dodgeRate += val; 
                break;
            
            case 'res_phys':
                // 物理抗性修正 (直接加算，负数代表减伤增强)
                actor.res_phys += val;
                break;

            case 'res_magic':
                // 魔法抗性修正
                actor.res_magic += val;
                break;
        }
    });
    
    // 3. 安全钳制
    actor.critRate = Math.min(actor.critRate, 1.0); // 最大 100% 暴击
    actor.dodgeRate = Math.min(actor.dodgeRate, 0.8); // 最大 80% 闪避 (防止无敌)
}

/**
 * 计算当前回合的行动点数 (决定行动顺序)
 * @param {Object} actor - Combatant 实例
 */
export function calculateActionPoints(actor) {
    // 1. 如果绑定了模型且模型有专门的 AP 滚动逻辑，则优先使用
    if (actor.sourceModel && typeof actor.sourceModel.rollActionPoints === 'function') {
        actor.actionPoints = actor.sourceModel.rollActionPoints();
        return actor.actionPoints;
    }

    // 2. 通用 AP 计算逻辑：基于等级权重与随机波动
    const levelWeight = store.config.battle.Mechanics.speedLevelWeight;
    const baseMin = 8 + actor.level * levelWeight;
    const baseMax = 10 + actor.level * levelWeight;

    // 基础随机值
    actor.actionPoints = Math.random() * (baseMax - baseMin) + baseMin;
    
    // 3. 应用速度类 Buff 修正
    // 🟢 确认：这里查找的 type 必须是 'speed'，与属性字典一致
    const speedBuff = actor.buffs.find(buff => buff.type === 'speed');
    
    // 速度 buff 既可以用 level (固定值) 也可以用 value (百分比，需扩展支持)
    if (speedBuff) {
        if (speedBuff.level) actor.actionPoints += speedBuff.level;
        // 如果想支持百分比速度: 
        // if (speedBuff.value) actor.actionPoints *= (1 + speedBuff.value);
    }
    return actor.actionPoints;
}