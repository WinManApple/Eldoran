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

// src/systems/PlayerState.js
import { GameDatabase } from '../config/GameDatabase.js';
import { store, addLog } from '../ui/modules/store.js';
import { BattleConfig } from '../battle/BattleConfig.js';

/**
 * 玩家状态模型 (Runtime Model) - v3.0 重构版
 * 核心升级：支持扁平化的 stats 属性结构，移除 bonus_stats 旧逻辑
 */
export class CharacterModel {
    /**
     * @param {Object} savedData - 从 slot_x.json 读取的 player 字段数据
     */
    constructor(savedData = {}) {

        // 🟢 修复 : 优先读取存档中的 id
        this.id = savedData.id || null;

        // 🟢 [新增] 读取出战状态 (默认为 true，兼容旧存档)
        this.isDeployed = savedData.isDeployed !== undefined ? savedData.isDeployed : true;

        // 1. 基础信息 (Base Info)
        const base = savedData.base_info || {};
        this.name = base.name || "无名骑士";
        this.identity = base.identity || "平民";
        this.core_objective = base.core_objective || "在这个危险的世界中生存下去";
        this.level = base.level || 1;
        this.exp = base.exp || 0;
        this.nextLevelExp = this.calculateNextLevelExp(this.level);
        this.element = base.element || 'NONE'; // 自身属性
        this.avatar = base.avatar || "assets/avatars/hero_default.png";
        this.sex = base.sex || "female"; // 默认女性
        //  性格描述 (默认为"普通")
        this.character = base.character || "普通";
        this.appearance = base.appearance || "外貌平平";

        // 2. 核心维生指标 (Vitals)
        const vitals = savedData.vitals || {};
        this.hp = vitals.hp !== undefined ? vitals.hp : 100;
        this.mp = vitals.mp !== undefined ? vitals.mp : 50;
        // maxHp/maxMp 会在 recalculateStats 中计算，这里先给个保底值
        this.maxHp = 100; 
        this.maxMp = 50;
        this.isDead = vitals.is_dead || false;

        // 3. 基础属性 (Attributes - 裸值)
        // 这些是从存档读出来的、不含装备的原始属性
        const attrs = savedData.attributes || {};
        this.baseStats = {
            atk: attrs.base_atk || 15,
            def: attrs.base_def || 5, // 基础防御 (同时影响物防/魔防基数)
            speed: attrs.base_speed || 10,
            critRate: attrs.base_crit_rate || 0.25,
            critDmg: attrs.base_crit_dmg || 0.25, // 0.25 代表 +25% 伤害 (即 125%)
            dodge: attrs.base_dodge || 0.10,
            // 耐受性基数 (1.0 = 100% 承伤)
            res_phys: attrs.resistance_phys || 1.0,
            res_magic: attrs.resistance_magic || 1.0
        };

        // 4. 装备栏 (Equipment - 存 ID 或 动态对象)
        const eq = savedData.equipment || {};
        this.equipment = {
            weapon: eq.weapon || null,
            head: eq.head || null,
            chest: eq.chest || null,
            hands: eq.hands || null,
            legs: eq.legs || null,
            boots: eq.boots || null,
            accessory_1: eq.accessory_1 || null,
            accessory_2: eq.accessory_2 || null
        };

        // 5. 技能栏 (Skills)
        const skills = savedData.skills || {};
        this.skills = {
            learned: skills.learned || [],
            equipped: skills.equipped || [] // 当前携带的技能
        };

        // 6. 背包 (Inventory)
        const inv = savedData.inventory || {};
        this.gold = inv.gold || 0;
        this.spiritStones = inv.spirit_stones || 0;
        this._inventory = (inv.items || []).map(item => {
            if (typeof item === 'object' && item.type === 'SPECIAL' && item.isExposedToLLM === undefined) {
                return { ...item, isExposedToLLM: true };
            }
            return item;
        });
        this.keyItems = inv.key_items || [];

        // 7. 运行时战斗属性 (Computed Stats)
        // 这些属性不会存入存档，每次游戏启动或装备变更时重新计算
        this.combatStats = {
            final_atk: 0,
            final_def_phys: 0,
            final_def_magic: 0,
            final_speed: 0,
            final_crit_rate: 0,
            final_crit_dmg: 0,
            final_dodge: 0,
            // 最终耐受倍率 (计算了防御减免后的结果)
            final_res_phys: 1.0,
            final_res_magic: 1.0
        };

        // 8. 临时 Buff 容器
        this.buffs = savedData.status_effects || [];

        // H 系统的原始存档数据 (供 PartyManager 初始化使用)
        this._rawHData = savedData.h_status || null; 
        
        // 逻辑实例槽位
        this.hStatus = null;

        // 初始化时立即计算一次属性
        this.recalculateStats();
    }

    /**
     * 共享背包逻辑：始终访问队长的背包
     */
    get inventory() {
        const leader = window.uiStore?.party?.[0];
        return (leader && leader !== this) ? leader._inventory : this._inventory;
    }

    /**
     * 🟢 [核心重构] 重新计算战斗面板
     * 适配 v3.0 数据标准：扁平化 stats 解析
     */
    recalculateStats() {
        const b = this.baseStats;
        const s = this.combatStats;

        // --- Step 1: 重置为基础值 ---
        s.final_atk = b.atk;
        s.final_def_phys = b.def;
        s.final_def_magic = b.def;
        s.final_crit_rate = b.critRate;
        s.final_crit_dmg = b.critDmg;
        s.final_dodge = b.dodge;
        
        // 速度基础成长公式: base + (level * 0.2)
        s.final_speed = b.speed + (this.level * 0.2);

        // 临时变量：属性累加器
        let bonusHp = 0;
        let bonusMp = 0;
        let modResPhys = 0;  // 物理耐受修正
        let modResMagic = 0; // 魔法耐受修正

        // --- Step 2: 遍历所有装备 ---
        Object.values(this.equipment).forEach(itemId => {
            if (!itemId) return;

            // 解析装备数据 (支持动态对象或静态ID)
            let itemData;
            if (typeof itemId === 'object') {
                itemData = itemId; 
            } else {
                itemData = GameDatabase.Equipment[itemId]; 
            }

            if (!itemData) {
                console.warn(`[PlayerState] 无法解析装备数据:`, itemId);
                return;
            }

            // 🟢 2.1 扁平化属性加成 (New Standard)
            // 直接读取 itemData.stats 对象中的键值对
            if (itemData.stats) {
                const st = itemData.stats;

                // --- A. 基础攻防 ---
                if (st.atk) s.final_atk += st.atk;
                
                // 防御力分流
                if (st.def_phys) s.final_def_phys += st.def_phys;
                if (st.def_magic) s.final_def_magic += st.def_magic;
                
                // 兼容性：如果装备还在用 def (双防)，也加上
                if (st.def) {
                    s.final_def_phys += st.def;
                    s.final_def_magic += st.def;
                }

                // --- B. 维生指标 (累加到临时变量) ---
                if (st.maxHp) bonusHp += st.maxHp;
                if (st.maxMp) bonusMp += st.maxMp;

                // --- C. 高级属性 ---
                if (st.speed) s.final_speed += st.speed;
                if (st.critRate) s.final_crit_rate += st.critRate;
                if (st.critDamage) s.final_crit_dmg += st.critDamage;
                if (st.dodgeRate) s.final_dodge += st.dodgeRate;

                // --- D. 耐受性修正 (数值直接相加) ---
                // 例如 res_phys: -0.1 代表受到的伤害 -10%
                if (st.res_phys) modResPhys += st.res_phys;
                if (st.res_magic) modResMagic += st.res_magic;
            }
            
            // 🚫 已移除 bonus_stats 处理逻辑
        });

        // --- Step 3: 应用被动 Buff (属性类) ---
        this.buffs.forEach(buff => {
            if (buff.type === "BUFF_STAT") {
                if (buff.stat === "atk_percent") s.final_atk = Math.floor(s.final_atk * (1 + buff.value));
                if (buff.stat === "def_percent") {
                    s.final_def_phys = Math.floor(s.final_def_phys * (1 + buff.value));
                    s.final_def_magic = Math.floor(s.final_def_magic * (1 + buff.value));
                }
                if (buff.stat === "speed_flat") s.final_speed += buff.value;
                if (buff.stat === "crit_rate_flat") s.final_crit_rate += buff.value;
                if (buff.stat === "crit_dmg_flat") s.final_crit_dmg += buff.value;
            }
        });

        // --- Step 4: 更新生命/魔力上限 ---
        const baseMaxHp = 100 + (this.level * 20);
        const baseMaxMp = 50 + (this.level * 5);
        
        this.maxHp = Math.floor(baseMaxHp + bonusHp);
        this.maxMp = Math.floor(baseMaxMp + bonusMp);

        // 状态修正：防止溢出
        if (this.hp > this.maxHp) this.hp = this.maxHp;
        if (this.mp > this.maxMp) this.mp = this.maxMp;

        // --- Step 5: 计算最终耐受倍率 (Resistance) ---
        // 公式: 伤害减免 = 防御 / (防御 + K)
        // 设定平衡系数 K = 100 (防御力100时减伤50%)
        const K = BattleConfig.Mechanics.defenseBalanceFactor || 100;

        // 物理减免率
        const reducePhys = s.final_def_phys / (Math.max(0, s.final_def_phys) + K);
        // 魔法减免率
        const reduceMagic = s.final_def_magic / (Math.max(0, s.final_def_magic) + K);

        // 最终耐受 = (基础耐受 + 装备修正) * (1 - 减免率)
        // 限制最小耐受为 0.1 (最高 90% 减伤)
        s.final_res_phys = Math.max(0.1, (b.res_phys + modResPhys) * (1 - reducePhys));
        s.final_res_magic = Math.max(0.1, (b.res_magic + modResMagic) * (1 - reduceMagic));
        
        // console.log("[PlayerState] 属性已重算:", this.combatStats);
    }

    /**
     * 获取当前回合的行动点 (AP)
     * 公式: rand[6, 10] + (level * 0.2) + speed_bonus
     */
    rollActionPoints() {
        const minBase = 6 + (this.level * 0.2);
        const maxBase = 10 + (this.level * 0.2);
        
        const roll = Math.random() * (maxBase - minBase) + minBase;
        
        // 速度奖励：每超过 10 点速度，每点提供 0.5 AP
        const speedBonus = (this.combatStats.final_speed - 10) * 0.5;

        return roll + Math.max(0, speedBonus);
    }

    // ==========================================
    // 资源管理
    // ==========================================

    heal(amount) {
        if (this.isDead && amount > 0) {
            addLog(`✨ ${this.name} 已死亡, 常规治疗不生效!`);
            return false;
        }
        this.hp = Math.min(this.maxHp, this.hp + amount);
        return true;
    }

    revive(hpAmount) {
        if (!this.isDead) return false;
        this.isDead = false;
        this.hp = Math.min(this.maxHp, hpAmount);
        addLog(`✨ ${this.name} 重新站了起来！`);
        return true;
    }

    restoreMp(amount) {
        this.mp = Math.min(this.maxMp, this.mp + amount);
    }

    takeDamage(amount) {
        this.hp = Math.max(0, this.hp - amount);
        if (this.hp <= 0) {
            this.isDead = true;
            addLog("☠️ 你已力竭倒下...");
        }
    }

    consumeMp(amount) {
        if (this.mp >= amount) {
            this.mp -= amount;
            return true;
        }
        return false;
    }

    gainExp(amount) {
        this.exp += amount;
        while (this.exp >= this.nextLevelExp) {
            this.levelUp();
        }
    }

    calculateNextLevelExp(level) {
        // 简单的线性升级公式
        return Math.pow(level, 2) * 100 + 400;
    }

    levelUp() {
        this.level++;
        this.exp -= this.nextLevelExp;
        this.nextLevelExp = this.calculateNextLevelExp(this.level);
        
        // 升级全回复
        this.recalculateStats();
        this.hp = this.maxHp;
        this.mp = this.maxMp;
        
        addLog(`✨ 升级了！当前等级: ${this.level}`);
        // 只有当升级的是队长 (store.party[0]) 时触发
        if (store.party && store.party.length > 0 && this === store.party[0]) {
            store.party.forEach(member => {
                // 跳过自己，且只提升等级低于自己的队员
                if (member !== this && member.level < this.level) {
                    member.level = this.level;
                    member.exp = 0; // 重置队员经验进度
                    member.nextLevelExp = member.calculateNextLevelExp(member.level);
                    
                    // 队员也享受升级全回复与属性重算
                    member.recalculateStats();
                    member.hp = member.maxHp;
                    member.mp = member.maxMp;
                    
                    addLog(`⬆️ [同步] 伙伴 ${member.name} 跟随提升到了 Lv.${member.level}`);
                }
            });
        }
    }

    // ==========================================
    // 技能管理
    // ==========================================

    hasSkill(skillId) {
        return this.skills.learned.some(s => {
            if (typeof s === 'string') return s === skillId;
            return s.id === skillId;
        });
    }

    learnSkill(skillOrId) {
        const id = (typeof skillOrId === 'object') ? skillOrId.id : skillOrId;
        
        if (this.hasSkill(id)) {
            console.warn(`[PlayerState] 技能 ${id} 已学会，无需重复学习。`);
            return false;
        }

        // 直接存入 (支持 Skill Payload 对象)
        this.skills.learned.push(skillOrId);
        
        // 自动装备 (如果有空位)
        if (this.skills.equipped.length < 4) {
             this.skills.equipped.push(id);
        }
        
        return true;
    }

    // ==========================================
    // 装备管理
    // ==========================================

    equipItem(itemOrId, slot = null) {
        let item;

        // 1. 解析物品对象
        if (typeof itemOrId === 'object') {
            // 如果是动态生成的纯数据对象，可能缺少 type，尝试从 DB 补全
            if (!itemOrId.type && itemOrId.id) {
                const dbData = GameDatabase.Equipment[itemOrId.id];
                if (dbData) {
                    item = { ...dbData, ...itemOrId }; 
                } else {
                    console.warn(`数据库中找不到 ID 为 ${itemOrId.id} 的装备数据`);
                    return false;
                }
            } else {
                item = itemOrId;
            }
        } else {
            // 静态 ID
            item = GameDatabase.Equipment[itemOrId];
            if (!item) {
                // 尝试从背包动态物品里找
                const dynamicItem = this.inventory.find(i => i.id === itemOrId && typeof i === 'object');
                if (dynamicItem) item = dynamicItem;
            }
        }

        if (!item) return false;

        // 2. 确定目标槽位
        let targetSlot = slot;
        if (!targetSlot) {
            if (item.type === 'WEAPON') targetSlot = 'weapon';
            else if (item.type === 'ACCESSORY') targetSlot = 'accessory_1';
            else if (item.type === 'ARMOR') {
                targetSlot = item.subtype ? item.subtype.toLowerCase() : 'chest';
            }
        }

        if (!targetSlot || this.equipment[targetSlot] === undefined) {
            console.warn(`无法确定装备 ${item.name} 的目标槽位 (type: ${item.type})`);
            return false;
        }

        // 3. 卸下旧装备
        if (this.equipment[targetSlot]) {
            this.unequipItem(targetSlot);
        }

        // 4. 穿上新装备
        // 策略：如果有动态 stats，必须存对象；否则存 ID 以节省空间
        if (item.stats && !itemOrId.stats) {
             this.equipment[targetSlot] = item.id;
        } else {
             this.equipment[targetSlot] = item;
        }

        // 5. 从背包移除
        this.removeItemFromInventory(itemOrId, 1);
        
        this.recalculateStats();
        return true;
    }

    unequipItem(slot) {
        const itemId = this.equipment[slot];
        if (itemId) {
            this.addItemToInventory(itemId, 1);
            this.equipment[slot] = null;
            this.recalculateStats();
            return true;
        }
        return false;
    }

    // ==========================================
    // 背包管理
    // ==========================================

    addItemToInventory(itemOrId, count = 1) {

        // 🟢 [新增] 预检逻辑：将静态 ID 的 SPECIAL 物品强制转为“动态对象”处理
        if (typeof itemOrId === 'string') {
            // 同时检索物品库与装备库（考虑到技能书可能在 Items 中，独特纪念品可能被视为 Equipment）
            const dbItem = GameDatabase.Items[itemOrId] || GameDatabase.Equipment[itemOrId];
            if (dbItem && dbItem.type === 'SPECIAL') {
                // 转换为对象，使其能命中下方的“分支 A”
                itemOrId = { ...dbItem, id: itemOrId };
            }
        }
        // A. 动态物品 (对象): 独立存储，不堆叠
        if (typeof itemOrId === 'object' && (itemOrId.stats || itemOrId.type === 'SPECIAL')) {
            const newItem = { 
                ...itemOrId, 
                count: count,
                // 🟢 [新增] 初始化 LLM 暴露属性 (默认允许)
                isExposedToLLM: itemOrId.isExposedToLLM !== undefined ? itemOrId.isExposedToLLM : true 
            };
            this.inventory.push(newItem);
            return;
        }

        // B. 静态物品 (ID): 尝试堆叠
        const targetId = (typeof itemOrId === 'object') ? itemOrId.id : itemOrId;
        const existing = this.inventory.find(i => i.id === targetId && !i.stats);
        
        if (existing) {
            existing.count += count;
        } else {
            this.inventory.push({ id: targetId, count: count });
        }
    }

    /**
     * 从背包中移除/扣除物品 (强化调试版)
     * @param {Object|String} itemOrId - 物品对象或 ID
     * @param {Number} count - 扣除数量
     * @returns {Boolean} 是否扣除成功
     */
    removeItemFromInventory(itemOrId, count = 1) {
        let index = -1;
        const targetId = (typeof itemOrId === 'object') ? itemOrId.id : itemOrId;

        // --- 调试日志 ---
        // console.log(`[Inventory] 正在尝试移除: ${targetId} (数量: ${count})`);
        
        // 策略 A: 引用精确查找 (针对 UI 传来的动态对象)
        if (typeof itemOrId === 'object') {
            index = this.inventory.indexOf(itemOrId);
        }

        // 策略 B: ID 查找 (最常用的路径)
        if (index === -1) {
            // 🟢 [强化修复] 使用更安全的查找方式，防止 Proxy 干扰
            index = this.inventory.findIndex(i => {
                // 确保 i 存在且 id 匹配
                return i && i.id === targetId;
            });
        }

        if (index !== -1) {
            const item = this.inventory[index];
            
            if (item.count >= count) {
                item.count -= count;
                // console.log(`[Inventory] 扣除成功，剩余: ${item.count}`);

                // 如果数量归零，则从数组中彻底移除
                if (item.count <= 0) {
                    this.inventory.splice(index, 1);
                    // console.log(`[Inventory] 物品已耗尽，从数组中移除`);
                }
                return true;
            } else {
                console.warn(`[PlayerState] 移除失败：物品 ${targetId} 数量不足 (拥有: ${item.count}, 需要: ${count})`);
                return false;
            }
        }
        
        // ❌ 如果走到这里，说明真的没找到
        console.warn(`[PlayerState] 移除失败：背包中未找到物品 ID [${targetId}]`);
        // 打印当前背包前5个物品ID，帮助确认是否存在数据偏差
        // console.log("当前背包快照(前5):", this.inventory.slice(0, 5).map(i => i.id));
        
        return false;
    }

    /**
     * 🟢 [新增] 抉择系统专用：通过物品名称删除物品 (门票检定)
     * @param {String} itemName - 物品的准确名称 (如 "验证核心")
     * @returns {Boolean} 删除成功返回 true; 未找到或数量不足返回 false
     */
    removeQuestItemByName(itemName) {
        if (!itemName) return false;

        // 1. 通过 Name 查找索引 (严格匹配)
        // 注意：这里查找的是 i.name (名称) 而不是 i.id
        const index = this.inventory.findIndex(i => i && i.name === itemName);

        if (index !== -1) {
            const item = this.inventory[index];
            
            // 2. 执行扣除
            if (item.count >= 1) {
                item.count--;
                // 数量归零则移除
                if (item.count <= 0) {
                    this.inventory.splice(index, 1);
                }
                // console.log(`[PlayerState] 检定通过，已消耗: ${itemName}`);
                return true; // ✅ 删除成功
            }
        }
        
        // 失败日志：注意这里我特意改了日志前缀，方便你调试区分
        console.warn(`[PlayerState] 🔴 检定失败：背包里没找到名字叫 "${itemName}" 的东西`);
        return false; // ❌ 删除失败
    }

    /**
     * 🟢 [新增] 物品检定 (只读不删)
     * 用于 ChoiceSystem 的 'check' 指令
     * @param {String} itemName - 物品名称
     * @returns {Boolean} 是否拥有该物品
     */
    hasItemByName(itemName) {
        if (!itemName) return false;

        // 查找背包中是否存在该名称的物品且数量 > 0
        // 注意：inventory 可能包含 undefined 或 null，需要 i && 判断
        return this.inventory.some(i => i && i.name === itemName && i.count > 0);
    }

    /**
     * 🟢 [新增] 消耗金币 (带余额检定)
     * @param {Number} amount - 需要消耗的金币数量 (必须是正整数)
     * @returns {Boolean} 成功返回 true，余额不足返回 false
     */
    consumeGold(amount) {
        if (amount <= 0) return true; // 消耗 0 或负数视为逻辑通过
        
        if (this.gold >= amount) {
            this.gold -= amount;
            // console.log(`[PlayerState] 消费金币: ${amount}, 剩余: ${this.gold}`);
            return true;
        }
        
        console.warn(`[PlayerState] 支付失败: 余额不足 (需要 ${amount}, 拥有 ${this.gold})`);
        return false;
    }

    hasItem(itemId, count = 1) {
        const item = this.inventory.find(i => i.id === itemId);
        return item && item.count >= count;
    }

    // ==========================================
    // 数据持久化
    // ==========================================

    serialize() {
        return {
            
            // 🟢 修复 2: 显式保存 id
            id: this.id,

            // 🟢 [新增] 保存出战状态
            isDeployed: this.isDeployed,

            base_info: {
                name: this.name,
                identity: this.identity,
                core_objective: this.core_objective,
                level: this.level,
                exp: this.exp,
                element: this.element,
                avatar: this.avatar,
                sex: this.sex,
                character: this.character,
                appearance: this.appearance
            },
            vitals: {
                hp: this.hp,
                mp: this.mp,
                is_dead: this.isDead
            },
            attributes: {
                base_atk: this.baseStats.atk,
                base_def: this.baseStats.def,
                base_speed: this.baseStats.speed,
                base_crit_rate: this.baseStats.critRate,
                base_crit_dmg: this.baseStats.critDmg,
                base_dodge: this.baseStats.dodge,
                resistance_phys: this.baseStats.res_phys,
                resistance_magic: this.baseStats.res_magic
            },
            equipment: { ...this.equipment },
            skills: { ...this.skills },
            inventory: {
                gold: this.gold,
                spirit_stones: this.spiritStones,
                items: [...this._inventory], 
                key_items: [...this.keyItems]
            },
            status_effects: [...this.buffs]
        };
    }
}