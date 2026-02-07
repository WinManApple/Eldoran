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

// src/LLM/memory/H_State_Memory.js

import { H_STATE_CONFIG } from '../calls/Configuration_Table.js';

/**
 * H_State_Memory
 * 管理女性角色动态演化的 H 阶段描述模板
 * 允许每个角色拥有独立的、可被 LLM 修改的阶段描述和性癖标签
 */

// 内存存储结构: { [charId]: { Long_Term: {...}, Short_Term: {...}, Sexuality: [] } }
let _hStateMemory = {};

export const H_State_Memory = {

    /**
     * 为角色初始化 H 状态记忆
     * 如果记忆中不存在该角色，则从 Configuration_Table 深度拷贝默认模板
     * @param {string} charId - 角色ID
     */
    initForCharacter(charId) {
        if (!charId) return;

        // 如果已经存在，跳过初始化，保留现有进化过的记忆
        if (_hStateMemory[charId]) {
            return;
        }

        console.log(`[H_State_Memory] 为 ${charId} 初始化专属 H 描述模板...`);

        // 深度拷贝配置表作为出厂设置
        // 注意：配置表里是 ALL_CAPS (LONG_TERM), 这里按照你的要求转换为 CamelCase (Long_Term)
        const defaultConfig = JSON.parse(JSON.stringify(H_STATE_CONFIG));

        _hStateMemory[charId] = {
            id: charId,
            Long_Term: {
                AFFECTION: defaultConfig.LONG_TERM.AFFECTION || [],
                DEPRAVITY: defaultConfig.LONG_TERM.DEPRAVITY || [],
                PARTS: defaultConfig.LONG_TERM.PARTS || []
            },
            Short_Term: {
                STAMINA: defaultConfig.SHORT_TERM.STAMINA || [],
                SANITY: defaultConfig.SHORT_TERM.SANITY || [],
                PLEASURE: defaultConfig.SHORT_TERM.PLEASURE || [],
                EXCITEMENT: defaultConfig.SHORT_TERM.EXCITEMENT || []
                // Shame 逻辑特殊，暂时保留在 Config 或后续动态化
            },
            Sexuality: [] // 默认空数组
        };
    },

    /**
     * 获取指定角色的完整规则集
     * @param {string} charId 
     * @returns {Object|null}
     */
    getCharacterRules(charId) {
        return _hStateMemory[charId] || null;
    },

    /**
     * 获取指定属性的规则列表 (用于 Call_Chat/Call_H 的读取逻辑)
     * @param {string} charId 
     * @param {string} type - 'Long_Term' | 'Short_Term'
     * @param {string} category - 'AFFECTION', 'STAMINA' 等
     */
    getRuleSet(charId, type, category) {
        const mem = _hStateMemory[charId];
        if (!mem || !mem[type] || !mem[type][category]) {
            // 如果没找到个人的，回退到全局配置防止报错 (兜底)
            const globalKey = type === 'Long_Term' ? 'LONG_TERM' : 'SHORT_TERM';
            return H_STATE_CONFIG[globalKey][category] || [];
        }
        return mem[type][category];
    },

    /**
     * 获取角色的性癖标签
     */
    getSexuality(charId) {
        return _hStateMemory[charId]?.Sexuality || [];
    },

    // =================================================
    // 动态修改 API (供 Action_LLM 调用以修改记忆)
    // =================================================

    /**
     * 修改某条规则的描述文本
     * @param {string} charId 
     * @param {string} type - 'Long_Term' | 'Short_Term'
     * @param {string} category - 'AFFECTION' 等
     * @param {number} index - 数组索引
     * @param {string} newText - 新的描述文本
     */
    updateRuleText(charId, type, category, index, newText) {
        const rules = this.getRuleSet(charId, type, category);
        if (rules[index]) {
            rules[index].text = newText;
            console.log(`[H_State_Memory] 更新了 ${charId} 的 ${category} 规则[${index}]: ${newText.substring(0, 10)}...`);
            return true;
        }
        return false;
    },

    /**
     * 修改某条规则的阈值 (Max)
     * 修改后会自动重新排序，以保证查找逻辑正确
     */
    updateRuleThreshold(charId, type, category, index, newMax) {
        const rules = this.getRuleSet(charId, type, category);
        if (rules[index]) {
            rules[index].max = Number(newMax);
            // 重新排序
            rules.sort((a, b) => a.max - b.max);
            return true;
        }
        return false;
    },

    /**
     * 增加一条新规则条目 (自动排序)
     * @param {string} charId 
     * @param {string} type 
     * @param {string} category 
     * @param {number} maxVal - 阈值
     * @param {string} text - 描述
     */
    addRuleEntry(charId, type, category, maxVal, text) {
        const mem = _hStateMemory[charId];
        if (!mem || !mem[type]) return false;

        if (!mem[type][category]) mem[type][category] = [];
        
        const list = mem[type][category];
        list.push({ max: Number(maxVal), text: text });
        
        // 保持升序，确保 find(curr < max) 逻辑正常工作
        list.sort((a, b) => a.max - b.max);
        
        console.log(`[H_State_Memory] ${charId} 新增 ${category} 规则: <${maxVal}`);
        return true;
    },

    /**
     * 删除指定索引的规则
     */
    deleteRuleEntry(charId, type, category, index) {
        const rules = this.getRuleSet(charId, type, category);
        if (rules[index]) {
            rules.splice(index, 1);
            return true;
        }
        return false;
    },

    /**
     * 添加性癖/特性标签
     */
    addSexualityTag(charId, tag) {
        const mem = _hStateMemory[charId];
        if (mem) {
            if (!mem.Sexuality.includes(tag)) {
                mem.Sexuality.push(tag);
                return true;
            }
        }
        return false;
    },

    /**
     * 移除性癖/特性标签
     */
    removeSexualityTag(charId, tag) {
        const mem = _hStateMemory[charId];
        if (mem) {
            const idx = mem.Sexuality.indexOf(tag);
            if (idx > -1) {
                mem.Sexuality.splice(idx, 1);
                return true;
            }
        }
        return false;
    },

    // =================================================
    // 持久化接口
    // =================================================

    serialize() {
        return JSON.parse(JSON.stringify(_hStateMemory));
    },

    deserialize(data) {
        if (!data) {
            _hStateMemory = {};
            return;
        }
        try {
            _hStateMemory = JSON.parse(JSON.stringify(data));
            console.log(`[H_State_Memory] 已加载 ${Object.keys(_hStateMemory).length} 名角色的个性化 H 记忆`);
        } catch (e) {
            console.error("[H_State_Memory] 反序列化失败", e);
            _hStateMemory = {};
        }
    },
    
    /**
     * 调试用：重置所有
     */
    clear() {
        _hStateMemory = {};
    }
};