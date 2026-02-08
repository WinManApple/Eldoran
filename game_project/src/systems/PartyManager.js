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

// src/systems/PartyManager.js
import { GameDatabase } from '../config/GameDatabase.js';
import { CharacterModel } from './PlayerState.js';
import { HState } from './HInteractionSystem/H_State.js';
import { store } from '../ui/modules/store.js';

import { FemaleConfig } from '../config/FemaleConfig.js';
import { DEFAULT_OPENING_ID, getOpeningConfig } from '../config/Opening.js';
import { H_State_Memory } from '../LLM/memory/H_State_Memory.js';


export const PartyManager = {
    /**
     * 创建初始队伍实例 (参数化改造版)
     * @param {Object} openingData - 来自 Opening.js 的配置对象 (包含 playerConfig, companionIds 等)
     */
    createInitialParty(openingData) {
        console.log("[PartyManager] 正在基于开局配置创建队伍...", openingData?.id);

        // 0. 兜底逻辑：如果未传入配置，加载默认开局
        if (!openingData) {
            console.warn("[PartyManager] 未接收到开局配置，使用默认兜底方案");
            openingData = getOpeningConfig(DEFAULT_OPENING_ID);
        }

        // 数据解构兼容 (支持标准开局结构 与 LLM动态开局结构)
        // 1. 标准结构: playerConfig/items 直接在根节点
        // 2. 动态结构: 嵌套在 openingData.openingData 中，且队友数据在 openingData.companionData
        const playerConfig = openingData.playerConfig || openingData.openingData?.playerConfig || {};
        const items = openingData.items || openingData.openingData?.items || [];
        
        // 队友数据源分流
        const companionIds = openingData.companionIds;          // 静态：ID列表
        const dynamicCompanion = openingData.companionData;     // 动态：完整配置对象

        // ==========================================
        // 1. 初始化主角 (动态修正)
        // ==========================================
        const player = new CharacterModel(); 
        player.id = 'player_001';
        player.isPlayer = true;
        player.sex = 'male';      
        player.level = 1;
        player.name = playerConfig.name || "user"; 

        // [动态应用]：应用开局身份与描述
        player.character = playerConfig.character || '无';
        player.appearance = playerConfig.appearance || '相貌平平';
        player.core_objective = playerConfig.core_objective || "在这个危险的世界中生存下去";
        
        // [动态应用]：应用开局金币修正
        player.gold = (playerConfig.extraGold !== undefined) ? playerConfig.extraGold : 500;

        // 基础战斗属性 (全开局通用底子，可视情况在 playerConfig 中进一步修正)
        player.baseStats.atk = 15;
        player.baseStats.def = 5;
        player.baseStats.critRate = 0.25;

        // 重算属性以生效
        player.recalculateStats(); 
        player.hp = player.maxHp;
        player.mp = player.maxMp;

        // ==========================================
        // 2. 初始化队友 (查表 FemaleConfig)
        // ==========================================
        const partyMembers = [player];

        if (Array.isArray(companionIds)) {
            companionIds.forEach((npcId, index) => {
                const config = FemaleConfig[npcId];
                if (!config) {
                    console.warn(`[PartyManager] 找不到 ID 为 ${npcId} 的女性角色配置，跳过创建。`);
                    return;
                }

                console.log(`[PartyManager] 正在实例化队友: ${config.base_info.name}`);

                const companion = new CharacterModel();
                // 生成唯一 ID (避免重复)
                companion.id = `companion_${npcId}_${index}`;
                companion.isPlayer = true; // 标记为我方单位
                
                // 2.1 注入基础信息
                companion.name = config.base_info.name;
                companion.identity = config.base_info.identity;
                companion.character = config.base_info.character;
                companion.appearance = config.base_info.appearance;
                companion.core_objective = config.base_info.core_objective;
                companion.sex = 'female';
                
                // 2.2 注入战斗属性
                // 注意：CharacterModel 构造函数里默认有一些值，这里我们要覆盖它们
                Object.assign(companion.baseStats, config.attributes);

                // 2.3 注入装备
                if (Array.isArray(config.initial_equipment)) {
                    config.initial_equipment.forEach(item => {
                        // 1. 简单校验
                        if (!item || typeof item !== 'object') return;

                        // 2. 补全 ID (防止 LLM 忘记生成 ID)
                        if (!item.id) {
                            item.id = `dyn_equip_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                        }

                        // 3. 先加入背包 (PlayerState 的逻辑要求穿戴前必须拥有该物品，或者直接传对象给 equipItem 也可以，但稳妥起见先入库)
                        // 注意：这里我们直接传入对象，PlayerState.addItemToInventory 支持对象
                        companion.addItemToInventory(item, 1);

                        // 4. 执行穿戴
                        // PlayerState.equipItem 会自动识别 type (WEAPON/ARMOR) 并装备到对应槽位
                        // 它也会自动处理属性计算
                        const success = companion.equipItem(item.id);
                        
                        if (!success) {
                            console.warn(`[PartyManager] 动态队友 ${companion.name} 无法装备 ${item.name} (可能缺少 type 字段)`);
                        }
                    });
                }
                // 兼容旧逻辑 (万一 LLM 还是返回了对象结构，或者 fallback 到了旧数据)
                else if (config.initial_equipment && typeof config.initial_equipment === 'object') {
                    Object.keys(config.initial_equipment).forEach(slot => {
                        companion.equipment[slot] = config.initial_equipment[slot];
                    });
                }

                // 2.4 注入技能
                if (Array.isArray(config.initial_skills)) {
                    companion.skills.learned = [...config.initial_skills];
                    // 默认装备所有初始技能 (最多4个)
                    companion.skills.equipped = config.initial_skills.slice(0, 4);
                }

                // 2.5 注入 H 状态原始数据 (供后续 H_State_Init 使用)
                // 这是一个临时的私有字段，H_State_Init 会读取它
                companion._rawHData = config.h_state_init ? JSON.parse(JSON.stringify(config.h_state_init)) : null;

                // 2.6 重算状态
                companion.recalculateStats();
                companion.hp = companion.maxHp;
                companion.mp = companion.maxMp;

                partyMembers.push(companion);
            });
        }

        // ==========================================
        // 2.5 [新增] 实例化动态队友 (LLM 生成)
        // ==========================================
        if (dynamicCompanion) {
            // 兼容单个对象或数组
            const dynConfigs = Array.isArray(dynamicCompanion) ? dynamicCompanion : [dynamicCompanion];

            dynConfigs.forEach((config, index) => {
                console.log(`[PartyManager] 正在实例化动态队友: ${config.base_info.name}`);

                const companion = new CharacterModel();
                // 使用动态 ID 或生成临时 ID
                companion.id = config.id || `dyn_companion_${Date.now()}_${index}`;
                companion.isPlayer = true;

                // 注入基础信息 (结构与 FemaleConfig 保持一致)
                companion.name = config.base_info.name;
                companion.identity = config.base_info.identity;
                companion.character = config.base_info.character;
                companion.appearance = config.base_info.appearance;
                companion.core_objective = config.base_info.core_objective;
                companion.sex = 'female';

                // 注入战斗属性
                if (config.attributes) {
                    Object.assign(companion.baseStats, config.attributes);
                }

                // 注入装备
                if (config.initial_equipment) {
                    Object.keys(config.initial_equipment).forEach(slot => {
                        companion.equipment[slot] = config.initial_equipment[slot];
                    });
                }

                // 注入技能
                // 🟢 [核心修改] 注入技能 (智能适配 字符串ID 或 动态对象)
                if (Array.isArray(config.initial_skills)) {
                    // 1. 学习技能 (PlayerState 支持直接存对象)
                    companion.skills.learned = [...config.initial_skills];
                    
                    // 2. 装备技能 (取前4个)
                    // ⚠️ 修正: 如果是对象，必须提取 id 放入 equipped；如果是字符串，直接放入。
                    const skillsToEquip = config.initial_skills.slice(0, 4);
                    
                    companion.skills.equipped = skillsToEquip.map(skill => {
                        if (typeof skill === 'object' && skill !== null) {
                            // 确保动态技能有 ID，如果没有则生成一个兜底
                            if (!skill.id) {
                                console.warn(`[PartyManager] 动态技能缺少 ID，已自动生成`);
                                skill.id = `dyn_skill_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                            }
                            return skill.id; // 提取 ID
                        }
                        return skill; // 已经是 ID 字符串
                    });
                }

                // 注入 H 状态原始数据
                companion._rawHData = config.h_state_init ? JSON.parse(JSON.stringify(config.h_state_init)) : null;

                // 重算状态
                companion.recalculateStats();
                companion.hp = companion.maxHp;
                companion.mp = companion.maxMp;

                partyMembers.push(companion);
            });
        }

        // ==========================================
        // 3. 物品发放 (通用 + 开局特供)
        // ==========================================
        
        // 3.1 [动态应用] 开局特殊物品
        // 3.2 [动态应用] 开局特殊物品 (支持 静态引用 + 动态定义)
        if (Array.isArray(items)) {
            items.forEach(entry => {
                // 分支 A: 静态物品 (通过 staticId 查库)
                if (entry.staticId) {
                    const dbId = entry.staticId;
                    // 校验数据库是否存在该 ID
                    if (GameDatabase.Items[dbId] || GameDatabase.Equipment[dbId]) {
                        player.addItemToInventory(dbId, entry.count || 1);
                        console.log(`[PartyManager] 发放静态物资: ${dbId} x${entry.count}`);
                    } else {
                        console.warn(`[PartyManager] 无法找到静态物品 ID: ${dbId}`);
                    }
                } 
                // 分支 B: 动态物品 (直接作为对象注入)
                // 这里的 entry 就是 Opening.js 里写的完整对象 (如 掘墓者的铲子)
                else {
                    // PlayerState.js 的 addItemToInventory 已经支持接收对象
                    // 只要对象包含 stats 或 type='SPECIAL' 即可被识别为动态物品
                    player.addItemToInventory(entry, entry.count || 1);
                    console.log(`[PartyManager] 发放动态物资: ${entry.name}`);
                }
            });
        }

        // ==========================================
        // 4. 全局初始化
        // ==========================================
        
        // 再次重算全员 (确保背包变动后的负重等潜在逻辑正确 - 虽然目前没有负重)
        partyMembers.forEach(m => m.recalculateStats());

        // 初始化 H 模块 (自动读取上面注入的 _rawHData)
        this.H_State_Init(partyMembers);

        console.log("[PartyManager] 队伍初始化完成，成员数:", partyMembers.length);
        return partyMembers;
    },

    /**
     * 🟢 修复后的批量初始化药水函数
     * 增加过滤：只发放 CONSUMABLE (消耗品)，排除特殊道具
     */
    add_potion(character, defaultCount = 5) {
        if (!character || !GameDatabase.Items) return;

        // 获取数据库中所有的物品 ID
        const allItemIds = Object.keys(GameDatabase.Items);
        
        // 🟢 核心修复：增加 filter 过滤，只保留 type 为 'CONSUMABLE' 的物品
        const potionArray = allItemIds
            .filter(id => {
                const item = GameDatabase.Items[id];
                // 确保数据存在且类型为消耗品
                return item && item.type === 'CONSUMABLE';
            })
            .map(id => ({
                id: id,
                count: defaultCount
            }));

        // 调用基础注入函数
        // ⚠️ 确保 injectItemsToCharacter 定义在下方且在对象内部
        this.injectItemsToCharacter(character, potionArray);
        console.log(`[PartyManager] 已向共享仓库注入 ${potionArray.length} 种基础消耗品`);
    },

    /**
     * 辅助函数：将物品数组注入到指定角色背包
     * 🟢 必须保留在 PartyManager 对象内部
     */
    injectItemsToCharacter(character, itemArray) {
        if (!Array.isArray(itemArray)) return;
        itemArray.forEach(item => {
            character.addItemToInventory(item.id, item.count);
        });
    },

    /**
     * 初始化女性角色的 H 属性模块
     */
    H_State_Init(members) {
        if (!store.hData) {
            store.hData = {};
        }

        members.forEach(member => {
            // 判定是否为需要初始化 H 属性的角色
            // 🟢 [修改] 增加转大写判断，增强鲁棒性 (防止 'Female' vs 'female')
            const sex = member.sex ? member.sex.toUpperCase() : 'UNKNOWN';
            
            if (sex === 'FEMALE' && member.id) {
                console.log(`[H-System] 正在激活 ${member.name} 的 H 逻辑模块...`);

                // ============================================================
                // 🟢 [新增] 步骤 0: 初始化该角色的动态 H 描述记忆
                // 这将从配置表中克隆一份独立的描述模板到 H_State_Memory
                // ============================================================
                H_State_Memory.initForCharacter(member.id);

                // 1. 数据加载：从成员模型的原始数据中提取 H 存档 (initialData)
                const initialHData = member._rawHData || {}; 

                // 2. 实例化逻辑：将存档数据注入构造函数
                const hStateInstance = new HState(member.id, initialHData);

                // 3. 建立双向关联
                // 关联 A: 存入全局注册表 (方便系统跨模块访问)
                store.hData[member.id] = hStateInstance;
                
                // 关联 B: 挂载到角色实例 (方便在代码中直接 member.hStatus.updateAffection(10))
                member.hStatus = hStateInstance;

                // 4. 清理临时数据，节省内存
                delete member._rawHData;
            }
        });
    }

};