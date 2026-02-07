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

// src/LLM/memory/Player_Memory.js
import { store } from '../../ui/modules/store.js';
// 🟢 必须引入数据库，用于把 ID 翻译成详细信息
import { GameDatabase } from '../../config/GameDatabase.js'; 

export const Player_Memory = {

    getPartyData() {
        if (!window.uiStore || !window.uiStore.party) {
            console.warn("[Player_Memory] 无法获取队伍数据");
            return [];
        }

        const party = window.uiStore.party;
        // 映射每一个成员
        return party.map(member => this._formatMember(member));
    },

    _formatMember(member) {
        const sexUpper = member.sex ? member.sex.toUpperCase() : 'UNKNOWN';
        
        // ==========================================
        // 🟢 1. 处理技能 (ID -> 详细对象)
        // ==========================================
        const rawSkills = member.skills ? (member.skills.equipped || []) : [];
        const resolvedSkills = rawSkills.map(skill => {
            // 情况A: 是静态ID (字符串) -> 查库
            if (typeof skill === 'string') {
                const dbSkill = GameDatabase.Skills[skill];
                if (dbSkill) {
                    return {
                        id: skill,
                        name: dbSkill.name,
                        description: dbSkill.description,
                        cost: dbSkill.cost,
                        effect: dbSkill.effect // 把具体的数值效果发给 LLM
                    };
                }
                return { id: skill, name: "未知技能" };
            }
            // 情况B: 已经是动态对象 (你举例的那种) -> 直接透传
            return skill;
        });

        // ==========================================
        // 🟢 2. 处理装备 (ID -> 详细对象)
        // ==========================================
        const resolvedEquipment = {};
        const rawEquip = member.equipment || {};
        
        for (const [slot, item] of Object.entries(rawEquip)) {
            if (!item) continue;

            // 情况A: 是静态ID (字符串)
            if (typeof item === 'string') {
                // 🟢 修复核心：优先查 Equipment 表，其次查 Items 表 (防止特殊道具被装备)
                const dbItem = GameDatabase.Equipment[item] || GameDatabase.Items[item];
                
                if (dbItem) {
                    resolvedEquipment[slot] = {
                        id: item,
                        name: dbItem.name,
                        // 🟢 [新增] 提取品质字段，如果没定义则默认 GREEN
                        quality: dbItem.quality || 'GREEN', 
                        description: dbItem.description,
                        stats: dbItem.stats, 
                        effects: dbItem.effects || []
                    };
                } else {
                    // 查不到数据的兜底
                    resolvedEquipment[slot] = { id: item, name: "未知装备", quality: "GRAY" };
                }
            } 
            // 情况B: 动态装备对象 (通常自带 quality，但做个保底)
            else {
                resolvedEquipment[slot] = {
                    ...item,
                    quality: item.quality || 'GREEN' // 确保动态物品也有品质字段
                };
            }
        }

        // ==========================================
        // 3. 组装最终数据
        // ==========================================
        
        // 🟢 [修复] 从 combatStats 获取最终计算后的战斗数值
        // 如果 combatStats 尚未计算(极少数情况), 则回退到 baseStats
        const s = member.combatStats || {};
        const b = member.baseStats || {};

        // 提取核心属性，优先用 final_*, 否则用 base_*
        const finalAtk = s.final_atk !== undefined ? s.final_atk : (b.atk || 0);
        const finalDefPhys = s.final_def_phys !== undefined ? s.final_def_phys : (b.def || 0);
        const finalResMagic = s.final_res_magic !== undefined ? s.final_res_magic : (b.res_magic || 0); // 注意：CharacterModel里是用 res_magic 存耐性
        
        // 为了兼容 Node_Genertate.js 的逻辑，我们需要构造一个标准的 stats 对象
        // Node_Genertate.js 读取的是: stats.def (用于计算均值) 和 stats.res_magic
        const resolvedStats = {
            atk: finalAtk,
            def: finalDefPhys,      // 映射为通用的 'def'，对应物理防御
            res_magic: finalResMagic, // 魔法耐性/防御
            speed: s.final_speed || b.speed || 0
        };

        const baseData = {
            player_ID: member.id,
            name: member.name,
            
            // 修复身份丢失问题，源头获取 identity
            identity: member.identity || "冒险者", 
            
            // 暴露核心目标给 LLM
            // 加上默认值兜底，防止旧存档数据缺失
            "核心目标": member.core_objective || "无明确目标",

            sex: sexUpper,
            appearance: member.appearance || "无描述",
            character: member.character ||  "无描述",
            level: member.level || 1,
            HP: member.hp, 
            MP: member.mp,
            // 修正攻击力读取
            attack_power: finalAtk,
            
            // 🟢 [修复] 传递重构后的 stats 对象
            stats: resolvedStats, 

            // 使用处理后的“丰满”数据
            equipment: resolvedEquipment, 
            skills: resolvedSkills
        };

        if (sexUpper === 'FEMALE') {
            baseData.H_state = this._getHState(member);
        }

        return baseData;
    },

    _getHState(member) {
        // (保持原有逻辑不变)
        let hStatus = member.hStatus;
        if (!hStatus && store.hData) hStatus = store.hData[member.id];
        if (!hStatus) return { affection: 0, depravity: 0, isVirgin: true, sexCount: 0 };
        return {
            affection: hStatus.affection || 0,
            depravity: hStatus.depravity || 0,
            isVirgin: !!hStatus.isVirgin,
            sexCount: hStatus.sexCount || 0
        };
    }
};