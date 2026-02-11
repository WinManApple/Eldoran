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
 * src/battle/combatant_modules/initializer.js
 * 负责 Combatant 的三种初始化模式：模型适配、Legacy参数、动态对象注入
 */
import { GameDatabase } from '../../config/GameDatabase.js';
import { store } from '../../ui/modules/store.js'

/**
 * 核心逻辑调度器
 * @param {Object} actor - Combatant 实例 (this)
 */
export function initCombatant(actor, arg1, arg2, ...args) {
    // 模式 1: PlayerState 模型适配
    if (typeof arg1 === 'object' && arg1.combatStats) {
        setupFromModel(actor, arg1, arg2);
    } 
    // 模式 3: 传入的是敌人原始数据对象 (Duck Typing / LLM 友好)
    else if (typeof arg1 === 'object' && arg1.stats && arg1.type === 'enemy') {
        const e = arg1;
        setupLegacy(
            actor,
            e.id, e.name, 'enemy', e.hp, e.mp, 
            e.stats.atk, e.stats.def, e.level, e.element, 
            false, '怪物', e.rewards, e.description, e.skills,
            e.base_res_phys, e.base_res_magic
        );
    }
    // 模式 2: 传统多参数 (Legacy)
    else {
        setupLegacy(actor, arg1, arg2, ...args);
    }
}

/**
 * 模式 1: 适配 PlayerState
 */
function setupFromModel(actor, model, runtimeId) {
    actor.sourceModel = model; 
    actor.id = runtimeId || model.name; 
    actor.name = model.name;
    actor.type = 'player';
    actor.class = '冒险者'; 
    actor.isPlayer = true;

    // 🟢 1. 基础属性映射 (与 Stats 字典对应)
    actor.maxHp = model.maxHp;
    actor.hp = model.hp;
    actor.maxMp = model.maxMp;
    actor.mp = model.mp;
    
    // 🟢 2. 战斗属性映射 (核心修改)
    const s = model.combatStats;
    actor.base_atk = s.final_atk;             // 记录基础值
    actor.base_def_phys = s.final_def_phys;   // 记录基础值
    actor.base_def_magic = s.final_def_magic; // 🟢 新增：基础魔防
    actor.base_speed = s.final_speed || 10;   // 🟢 新增：基础速度

    // 运行时属性 (会在 stats.js 中被动态计算覆盖)
    actor.atk = actor.base_atk;
    actor.def_phys = actor.base_def_phys;     // 替换原有的 actor.defense
    actor.def_magic = actor.base_def_magic;   // 🟢 新增
    
    // 🟢 3. 高级属性映射
    actor.critRate = s.final_crit_rate;
    actor.critDamage = 1 + s.final_crit_dmg; // 对应 critDamage (倍率)
    actor.dodgeRate = s.final_dodge;

    // 🟢 [核心修复] 备份基础抗性，防止被 stats.js 的重置逻辑抹除
    actor.base_res_phys = s.final_res_phys || 0;
    actor.base_res_magic = s.final_res_magic || 0;

    // 🟢 [核心修复] 抗性初始化 (倒数模型)
    // 必须确保基准值为 1.0，否则后续除法公式会出错
    // 从 PlayerState 计算好的 final_res 直接传递过来
    actor.base_res_phys = s.final_res_phys || 1.0;
    actor.base_res_magic = s.final_res_magic || 1.0;

    // 初始化运行时抗性
    actor.res_phys = actor.base_res_phys;
    actor.res_magic = actor.base_res_magic;

    // 🟢 [核心修复] 技能初始化：强制深拷贝，剥离 Vue Proxy
    actor.skills = (model.skills.equipped || []).map(skillOrId => {
        // 1. 确定数据源：如果是 ID，先去 learned 里找找有没有对应的动态对象
        let sourceData = skillOrId;
        
        if (typeof skillOrId === 'string') {
            const found = (model.skills.learned || []).find(s => {
                const sId = (typeof s === 'object') ? s.id : s;
                return sId === skillOrId;
            });
            // 如果在已习得列表里找到了对象版本，就用对象版本
            if (found) sourceData = found;
        }

        // 2. 深拷贝处理 (Deep Copy)
        // 只有当它是对象时才需要拷贝；如果是字符串 ID 则直接返回
        if (typeof sourceData === 'object' && sourceData !== null) {
            try {
                // 彻底断开引用，确保战斗内是一个纯净的 JS 对象
                return JSON.parse(JSON.stringify(sourceData));
            } catch (e) {
                console.warn("[Initializer] 技能深拷贝失败，将使用原始引用:", sourceData);
                return sourceData;
            }
        }

        return sourceData;
    });

    actor.rewards = { exp: 0, gold: 0, items: [] };
    actor.description = "一位无畏的冒险者。";
    actor.initRuntimeState(); 
}

/**
 * 模式 2 & 3: 传统/动态初始化逻辑
 */
function setupLegacy(actor, id, name, type, hp, mp, attack, defense, level, element, isPlayer, className = '', rewards = null, description = '', skills = [], res_phys = null, res_magic = null) {
    // ... (基础信息保持不变)
    actor.id = id;
    actor.name = name;
    actor.type = type; 
    actor.class = className || (isPlayer ? '战士' : '怪物'); 
    actor.level = level;
    actor.element = element;
    actor.isPlayer = isPlayer;

    // 🟢 1. 生命魔法
    actor.maxHp = !isPlayer ? Math.floor(hp * store.config.battle.Difficulty.enemyHpMultiplier) : hp;
    actor.hp = actor.maxHp;
    actor.maxMp = mp;
    actor.mp = mp;

    // 🟢 2. 战斗属性 (明确拆分)
    // 兼容旧的 defense 参数：如果没有显式传魔防，默认魔防 = 物防
    actor.base_atk = attack;
    actor.base_def_phys = defense;
    actor.base_def_magic = defense; // 默认值策略

    // 初始化运行时属性
    actor.atk = attack;
    actor.def_phys = defense;
    actor.def_magic = defense;

    // ... (RNG 数值初始化保持不变)
    actor.baseCritRate = isPlayer ? store.config.battle.RNG.baseCritRate : (store.config.battle.RNG.baseCritRate - 0.1);
    actor.critRate = actor.baseCritRate;
    actor.critDamage = store.config.battle.RNG.critDamageMultiplier; 
    actor.dodgeRate = store.config.battle.RNG.baseDodgeRate;

    // 🟢 [重构] 敌人抗性初始化逻辑
    // 1. 获取全局平衡常数 K
    const K = store.config.battle.Mechanics.defenseBalanceFactor || 1000;
    const safeDef = Math.max(0, defense || 0);

    // 2. 计算防御力提供的抗性转化值 (0.0 ~ 1.0)
    const defContribution = safeDef / (safeDef + K);

    // 3. 计算初始抗性值 (1.0 基准 + 防御转化 + 外部修正)
    // 这里的 res_phys/magic 此时应作为“修正值”加算
    actor.base_res_phys = 1.0 + defContribution + (res_phys || 0);
    actor.base_res_magic = 1.0 + defContribution + (res_magic || 0);

    // 同步到运行时属性
    actor.res_phys = actor.base_res_phys;
    actor.res_magic = actor.base_res_magic;

    actor.rewards = rewards || { exp: 0, gold: 0, items: [] };
    actor.description = description || "一个神秘的敌人。";
    // 🟢 [优化] 敌人技能也进行深拷贝安全处理
    actor.skills = (skills || []).map(s => {
        if (typeof s === 'object' && s !== null) {
            return JSON.parse(JSON.stringify(s));
        }
        return s;
    });
    actor.initRuntimeState();
}