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
 * src/battle/Combatant.js
 * 战斗角色类入口（重构版）
 * 采用模块化设计，将逻辑外包给子模块，本体仅作为状态容器与调度器
 */

import { initCombatant } from './combatant_modules/initializer.js';
import * as Stats from './combatant_modules/stats.js';
import * as Calculator from './combatant_modules/calculator.js';
import * as Effects from './combatant_modules/effects.js';

export class Combatant {
    /**
     * 构造函数：通过 Initializer 模块支持多种初始化模式
     */
    constructor(...args) {
        // 调度初始化工厂，处理：1.模型加载 2.传统ID 3.动态对象 (Mode 3)
        initCombatant(this, ...args);
    }

    /**
     * 初始化运行时状态（Buffs, AP, 状态位等）
     */
    initRuntimeState() {
        this.buffs = [];
        this.debuffs = [];
        this.dots = [];
        this.isDefending = false;
        this.isStunned = false;
        this.actionPoints = 0;
        this.calculateActionPoints();
    }
    
    /**
     * 同步数据回原始模型（如 PlayerState）
     */
    syncToModel() {
        if (this.sourceModel) {
            this.sourceModel.hp = this.hp;
            this.sourceModel.mp = this.mp;
            if (this.hp <= 0) this.sourceModel.isDead = true;
        }
    }

    // === 1. 属性与行动力逻辑 (委派至 stats.js) ===

    calculateActionPoints() {
        return Stats.calculateActionPoints(this);
    }

    updateStats() {
        Stats.updateStats(this);
    }

    // === 2. 状态效果管理 (委派至 effects.js) ===

    applyBuff(buff) {
        return Effects.applyBuff(this, buff);
    }

    updateEffects() {
        return Effects.updateEffects(this);
    }

    // 🟢 修改后 (添加 return，将结果传递出去)
    applySkillEffect(effectData, target) {
        return Effects.applySkillEffect(this, effectData, target);
    }
    // === 3. 战斗计算核心 (委派至 calculator.js) ===

    attackTarget(target, skill = null) {
        if (this.isStunned) {
            return { damage: 0, critical: false, dodged: false, message: `${this.name}被眩晕，无法行动！` };
        }
        
        let calcResult = { damage: 0, isCritical: false };
        let isDodged = false;
        
        // 🟢 [新增] 效果执行详情容器
        let effectDetails = [];

        if (skill) {
            // 计算技能伤害
            calcResult = this.calculateSkillDamage(skill, target);
                        
            // 🟢 [修改] 宽松的特效触发逻辑 (支持混合技能 & 扁平结构)
            // 不再限制 skill.type 必须是 BUFF/STUN/DOT，
            // 只要有 effect 数据，或者本身包含特效字段，就尝试触发。

            let effectPayload = skill.effect;

            // 兼容性回退：如果没有 effect 对象，但在 skill 根节点发现了特效特征
            if (!effectPayload && (skill.stat || skill.dotType || skill.type === 'STUN' || skill.type === 'DOT' || skill.type === 'ACTIVE_BUFF')) {
                effectPayload = skill;
            }

            if (effectPayload) {
                // 🟢 [修改] 获取详细结果对象
                const res = this.applySkillEffect(effectPayload, target);
                effectDetails = res.outcomes; // 保存战报列表
            }
        } else {
            // 普通攻击
            calcResult = this.calculateBasicDamage(target);
        }
        
        // 判定闪避
        const canDodge = !skill || skill.type === 'ACTIVE_DMG';
        if (canDodge && Math.random() < target.dodgeRate) {
            isDodged = true;
            calcResult.damage = 0;
        }
        
        // 应用扣血逻辑
        if (calcResult.damage > 0) {
            if (target.isDefending) calcResult.damage = Math.floor(calcResult.damage * 0.5);
            target.hp = Math.max(0, target.hp - calcResult.damage);
        }
        
        return {
            damage: calcResult.damage,
            critical: calcResult.isCritical && !isDodged,
            isAdvantage: calcResult.isAdvantage && !isDodged,
            dodged: isDodged,
            skillUsed: skill ? skill.name : null,
            effectDetails: effectDetails
        };
    }
    
    calculateBasicDamage(target) {
        return Calculator.calculateBasicDamage(this, target);
    }

    calculateSkillDamage(skill, target) {
        return Calculator.calculateSkillDamage(this, skill, target);
    }

    getElementMultiplier(attackerElement, defenderElement) {
        return Calculator.getElementMultiplier(attackerElement, defenderElement);
    }

    applyDamageModifiers(rawDamage, target) {
        return Calculator.applyDamageModifiers(this, rawDamage, target);
    }
}