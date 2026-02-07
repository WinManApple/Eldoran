/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

/**
 * src/config/GameDatabase.js
 * 静态数据库 (v3.0 标准版)
 * 完全适配物理/魔法分离、扁平化属性与模块化战斗系统
 */

export const ItemQuality = {
    GRAY: { id: 'GRAY', name: '破败', color: '#7f8c8d' },
    GREEN: { id: 'GREEN', name: '普通', color: '#2ecc71' },
    BLUE: { id: 'BLUE', name: '稀有', color: '#3498db' },
    PURPLE: { id: 'PURPLE', name: '史诗', color: '#9b59b6' },
    GOLD: { id: 'GOLD', name: '传说', color: '#f1c40f' },
    RED: { id: 'RED', name: '神器', color: '#e74c3c' }
};

/**
 * 1. 消耗品与特殊道具数据库
 * 核心修正：stat 键名与属性字典 (stats.js) 严格对应
 */
/**
 * 1. 消耗品与特殊道具数据库
 * 核心修正：stat 键名与属性字典 (stats.js) 严格对应
 * 补全规则：
 * - 恢复类: Low 20%, Mid 50%, High 80%
 * - Buff类: L1 10%/3T, L2 20%/5T, L3 30%/8T
 */
const Items = {
    // ==========================================
    // 1. 恢复类 (HP/MP/Hybrid)
    // ==========================================
    
    // --- 生命恢复 ---
    "potion_hp_low": {
        id: "potion_hp_low", name: "低级生命药水", type: "CONSUMABLE",
        effect_type: "RESTORE_HP_PERCENT", value: 0.2, desc: "恢复20%生命值", quality: "GREEN"
    },
    "potion_hp_mid": {
        id: "potion_hp_mid", name: "中级生命药水", type: "CONSUMABLE",
        effect_type: "RESTORE_HP_PERCENT", value: 0.5, desc: "恢复50%生命值", quality: "BLUE"
    },
    "potion_hp_high": {
        id: "potion_hp_high", name: "高级生命药水", type: "CONSUMABLE",
        effect_type: "RESTORE_HP_PERCENT", value: 0.8, desc: "恢复80%生命值", quality: "PURPLE"
    },
    
    // --- 魔力恢复 ---
    "potion_mp_low": {
        id: "potion_mp_low", name: "低级魔力药水", type: "CONSUMABLE",
        effect_type: "RESTORE_MP_PERCENT", value: 0.2, desc: "恢复20%魔法值", quality: "GREEN"
    },
    "potion_mp_mid": {
        id: "potion_mp_mid", name: "中级魔力药水", type: "CONSUMABLE",
        effect_type: "RESTORE_MP_PERCENT", value: 0.5, desc: "恢复50%魔法值", quality: "BLUE"
    },
    "potion_mp_high": {
        id: "potion_mp_high", name: "高级魔力药水", type: "CONSUMABLE",
        effect_type: "RESTORE_MP_PERCENT", value: 0.8, desc: "恢复80%魔法值", quality: "PURPLE"
    },

    // --- 复合恢复 (修改 effect_type 以包含 HP 和 MP 关键字) ---
    "potion_hybrid_low": {
        id: "potion_hybrid_low", name: "低级复合药水", type: "CONSUMABLE",
        effect_type: "RESTORE_HP_MP_PERCENT", value: 0.2, desc: "恢复20%生命与魔法", quality: "GREEN"
    },
    "potion_hybrid_mid": {
        id: "potion_hybrid_mid", name: "中级复合药水", type: "CONSUMABLE",
        effect_type: "RESTORE_HP_MP_PERCENT", value: 0.5, desc: "恢复50%生命与魔法", quality: "BLUE"
    },
    "potion_hybrid_high": {
        id: "potion_hybrid_high", name: "高级复合药水", type: "CONSUMABLE",
        effect_type: "RESTORE_HP_MP_PERCENT", value: 0.8, desc: "恢复80%生命与魔法", quality: "PURPLE"
    },

    // --- 复活类 (修改 effect_type 以匹配 TeamOverlay 判断逻辑) ---
    "potion_revive": {
        id: "potion_revive", name: "复活灵药", type: "CONSUMABLE",
        effect_type: "REVIVE_HP_PERCENT", value: 0.5, desc: "复活并恢复50%生命值", quality: "GOLD"
    },

    // ==========================================
    // 2. Buff 类 (状态提升)
    // ==========================================

    // --- 攻击力提升 (ATK) ---
    "potion_buff_atk_L1": {
        id: "potion_buff_atk_L1", name: "低级力量药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "atk", 
        value: 0.1, duration: 3, desc: "攻击力提升10%，持续3回合", quality: "GREEN"
    },
    "potion_buff_atk_L2": {
        id: "potion_buff_atk_L2", name: "中级力量药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "atk", 
        value: 0.2, duration: 5, desc: "攻击力提升20%，持续5回合", quality: "BLUE"
    },
    "potion_buff_atk_L3": {
        id: "potion_buff_atk_L3", name: "高级力量药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "atk", 
        value: 0.3, duration: 8, desc: "攻击力提升30%，持续8回合", quality: "PURPLE"
    },

    // --- 防御力提升 (DEF - 物理) ---
    "potion_buff_def_L1": {
        id: "potion_buff_def_L1", name: "低级铁皮药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "def_phys", 
        value: 0.1, duration: 3, desc: "物理防御提升10%，持续3回合", quality: "GREEN"
    },
    "potion_buff_def_L2": {
        id: "potion_buff_def_L2", name: "中级铁皮药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "def_phys", 
        value: 0.2, duration: 5, desc: "物理防御提升20%，持续5回合", quality: "BLUE"
    },
    "potion_buff_def_L3": {
        id: "potion_buff_def_L3", name: "高级铁皮药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "def_phys", 
        value: 0.3, duration: 8, desc: "物理防御提升30%，持续8回合", quality: "PURPLE"
    },

    // --- 速度提升 (SPEED / AGI) ---
    // 注：根据L3需求统一使用百分比提升
    "potion_buff_agi_L1": {
        id: "potion_buff_agi_L1", name: "低级敏捷药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "speed", 
        value: 0.1, duration: 3, desc: "速度提升10%，持续3回合", quality: "GREEN"
    },
    "potion_buff_agi_L2": {
        id: "potion_buff_agi_L2", name: "中级敏捷药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "speed", 
        value: 0.2, duration: 5, desc: "速度提升20%，持续5回合", quality: "BLUE"
    },
    "potion_buff_agi_L3": {
        id: "potion_buff_agi_L3", name: "高级敏捷药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "speed", 
        value: 0.3, duration: 8, desc: "速度提升30%，持续8回合", quality: "PURPLE"
    },

    // --- 暴击率提升 (CRIT RATE) ---
    "potion_buff_crit_rate_L1": {
        id: "potion_buff_crit_rate_L1", name: "低级鹰眼药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "critRate", 
        value: 0.1, duration: 3, desc: "暴击率提升10%，持续3回合", quality: "GREEN"
    },
    "potion_buff_crit_rate_L2": {
        id: "potion_buff_crit_rate_L2", name: "中级鹰眼药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "critRate", 
        value: 0.2, duration: 5, desc: "暴击率提升20%，持续5回合", quality: "BLUE"
    },
    "potion_buff_crit_rate_L3": {
        id: "potion_buff_crit_rate_L3", name: "高级鹰眼药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "critRate", 
        value: 0.3, duration: 8, desc: "暴击率提升30%，持续8回合", quality: "PURPLE"
    },

    // --- 暴击伤害提升 (CRIT DMG) ---
    // 注：严格遵循 L3 30% 的设定 (尽管 L1 原设定为 50%，这里优先保证 L3 符合你的需求描述)
    "potion_buff_crit_dmg_L1": {
        id: "potion_buff_crit_dmg_L1", name: "低级残暴药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "critDamage", 
        value: 0.5, duration: 3, desc: "暴击伤害提升50%，持续3回合", quality: "GREEN"
    },
    "potion_buff_crit_dmg_L2": {
        id: "potion_buff_crit_dmg_L2", name: "中级残暴药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "critDamage", 
        value: 0.6, duration: 5, desc: "暴击伤害提升60%，持续5回合", quality: "BLUE"
    },
    "potion_buff_crit_dmg_L3": {
        id: "potion_buff_crit_dmg_L3", name: "高级残暴药剂", type: "CONSUMABLE",
        effect_type: "BUFF_STAT", stat: "critDamage", 
        value: 1.0, duration: 8, desc: "暴击伤害提升100%，持续8回合", quality: "PURPLE"
    },

    // --- 剧情/特殊道具 ---
    "silver_ring": {
        id: "silver_ring",
        name: "银之戒指",
        type: "SPECIAL",
        quality: "PURPLE",
        effect_type: "NONE",
        type_desc: "重要物品",
        description: "传闻中英雄赠与他爱人的戒指，内侧刻着模糊的名字。"
    }
};

/**
 * 2. 装备数据库
 * 核心修正：扁平化 stats 结构，明确 atk_type 和 def_phys/magic
 */
export const Equipment = {
    // --- 武器 ---
    "wpn_sword_01": {
        id: "wpn_sword_01", name: "骑士长剑", type: "WEAPON", subtype: "SWORD", quality: "GREEN",
        stats: { atk: 35 }, 
        atk_type: "PHYSICAL", // 🟢 必需：决定计算物防
        desc: "制式长剑，物理攻击稳定。"
    },
    "wpn_staff_01": {
        id: "wpn_staff_01", name: "学徒法杖", type: "WEAPON", subtype: "STAFF", quality: "GREEN",
        stats: { atk: 25, maxMp: 20 }, 
        atk_type: "MAGIC",    // 🟢 必需：决定计算魔防
        desc: "入门法杖，微量提升魔力。"
    },

    // --- 防具: 物理套 (钢铁守卫) ---
    "armor_phys_head": { 
        id: "armor_phys_head", name: "钢铁头盔", type: "ARMOR", subtype: "HEAD", quality: "GREEN", 
        stats: { def_phys: 15, def_magic: 5 }, // 🟢 拆分双防
        desc: "厚重的铁盔。" 
    },
    "armor_phys_chest": { 
        id: "armor_phys_chest", name: "钢铁胸甲", type: "ARMOR", subtype: "CHEST", quality: "GREEN", 
        stats: { def_phys: 40, def_magic: 10 }, 
        desc: "坚固的板甲。" 
    },
    "armor_phys_hands": { id: "armor_phys_hands", name: "钢铁手甲", type: "ARMOR", subtype: "HANDS", quality: "GREEN", stats: { def_phys: 10, def_magic: 2 }, desc: "保护双手。" },
    "armor_phys_legs": { id: "armor_phys_legs", name: "钢铁护腿", type: "ARMOR", subtype: "LEGS", quality: "GREEN", stats: { def_phys: 20, def_magic: 5 }, desc: "行动略显笨拙。" },
    "armor_phys_boots": { id: "armor_phys_boots", name: "钢铁战靴", type: "ARMOR", subtype: "BOOTS", quality: "GREEN", stats: { def_phys: 10, def_magic: 2 }, desc: "沉重的步伐。" },

    // --- 防具: 魔法套 (秘法丝织) ---
    "armor_magic_head": { id: "armor_magic_head", name: "秘法兜帽", type: "ARMOR", subtype: "HEAD", quality: "GREEN", stats: { def_phys: 5, def_magic: 20 }, desc: "编织了防护符文。" },
    "armor_magic_chest": { id: "armor_magic_chest", name: "秘法长袍", type: "ARMOR", subtype: "CHEST", quality: "GREEN", stats: { def_phys: 10, def_magic: 45 }, desc: "对元素亲和力高。" },
    
    // --- 饰品 ---
    "acc_ring_power": {
        id: "acc_ring_power", name: "力量指环", type: "ACCESSORY", quality: "BLUE",
        stats: { atk: 15 }, 
        desc: "铭刻着力量符文的铜戒。"
    },
    "acc_amulet_focus": {
        id: "acc_amulet_focus", name: "鹰眼护符", type: "ACCESSORY", quality: "BLUE",
        stats: { critRate: 0.05, critDamage: 0.20 }, // 🟢 修正键名
        desc: "猎人常佩戴的护身符。"
    },
    "acc_cape_evasion": {
        id: "acc_cape_evasion", name: "灵风披风", type: "ACCESSORY", quality: "BLUE",
        stats: { dodgeRate: 0.05 }, // 🟢 修正键名
        desc: "随风摆动，难以捉摸。"
    }
};

/**
 * 3. 技能数据库
 * 核心修正：
 * - type: ATTACK / ACTIVE_BUFF / HEAL
 * - atk_type: PHYSICAL / MAGIC
 * - stat: 与属性字典一致
 */
export const Skills = {
    // --- 火 (FIRE) ---
    "skill_fire_bolt": {
        id: "skill_fire_bolt", name: "火球术", element: "FIRE", 
        type: "ATTACK",       // 🟢 修正：ATTACK
        atk_type: "MAGIC",    // 🟢 必需：判定魔抗
        cost: { mp: 10 }, power: 1.2, 
        desc: "投掷一枚火球，造成火属性魔法伤害。"
    },
    "skill_fire_buff": {
        id: "skill_fire_buff", name: "烈焰之心", element: "FIRE", type: "ACTIVE_BUFF",
        cost: { mp: 15 }, 
        effect: { stat: "atk", value: 0.2, duration: 3 }, // 🟢 修正：atk
        desc: "燃起斗志，提升攻击力。"
    },

    // --- 水 (WATER) ---
    "skill_water_shot": {
        id: "skill_water_shot", name: "水流冲击", element: "WATER", 
        type: "ATTACK", 
        atk_type: "MAGIC",
        cost: { mp: 8 }, power: 1.1, 
        desc: "高压水流冲击敌人，造成水属性魔法伤害。"
    },
    "skill_water_buff": {
        id: "skill_water_buff", name: "流水护盾", element: "WATER", type: "ACTIVE_BUFF",
        cost: { mp: 12 }, 
        effect: { stat: "def_phys", value: 0.2, duration: 3 }, // 🟢 修正：def_phys
        desc: "水流环绕周身，提升物理防御力。"
    },

    // --- 木 (WOOD) ---
    "skill_wood_whip": {
        id: "skill_wood_whip", name: "荆棘鞭挞", element: "WOOD", 
        type: "ATTACK",
        atk_type: "MAGIC",
        cost: { mp: 10 }, power: 1.0, 
        desc: "带刺藤蔓抽打敌人，造成木属性魔法伤害。"
    },
    "skill_wood_buff": {
        id: "skill_wood_buff", name: "森之守护", element: "WOOD", type: "ACTIVE_BUFF",
        cost: { mp: 20 }, 
        effect: { stat: "def_magic", value: 0.3, duration: 3 }, // 🟢 修正：def_magic
        desc: "自然之力护体，大幅提升魔法防御。"
    },

    // --- 土 (EARTH) ---
    "skill_earth_smash": {
        id: "skill_earth_smash", name: "落石术", element: "EARTH", 
        type: "ATTACK",
        atk_type: "PHYSICAL", // 🟢 物理系法术
        cost: { mp: 15 }, power: 1.5, 
        desc: "召唤巨石砸向敌人，造成极高的土属性物理伤害。"
    },
    "skill_earth_buff": {
        id: "skill_earth_buff", name: "岩石皮肤", element: "EARTH", type: "ACTIVE_BUFF",
        cost: { mp: 15 }, 
        effect: { stat: "def_phys", value: 0.4, duration: 3 }, // 🟢 修正：def_phys
        desc: "大幅提升物理防御。"
    },

    // --- 金 (METAL) ---
    "skill_metal_cut": {
        id: "skill_metal_cut", name: "裂金斩", element: "METAL", 
        type: "ATTACK",
        atk_type: "PHYSICAL",
        cost: { mp: 12 }, power: 1.3, 
        desc: "锐利的物理斩击，金属性物理伤害。"
    },
    "skill_metal_buff": {
        id: "skill_metal_buff", name: "锋锐术", element: "METAL", type: "ACTIVE_BUFF",
        cost: { mp: 15 }, 
        effect: { stat: "critDamage", value: 0.5, duration: 3 }, // 🟢 修正：critDamage
        desc: "提升暴击伤害。"
    },

    // --- 圣 (HOLY) ---
    "skill_holy_smite": {
        id: "skill_holy_smite", name: "圣光惩戒", element: "HOLY", 
        type: "ATTACK",
        atk_type: "MAGIC",
        cost: { mp: 20 }, power: 1.3, 
        desc: "召唤圣光打击敌人，造成圣属性魔法伤害。"
    },
    "skill_holy_pray": { // 🟢 标准化治疗技能
        id: "skill_holy_pray", name: "圣光祈祷", element: "HOLY", 
        type: "HEAL",
        cost: { mp: 25 }, 
        effect: "heal",       // 引擎识别关键字
        healPercent: 0.3,     // 30% 百分比治疗
        targetType: "ally",
        desc: "祈祷圣光，恢复目标30%的最大生命值。"
    }
};

/**
 * 4. 敌人数据库
 * 核心修正：
 * - 基础防御 def (初始化器会同时应用给 def_phys 和 def_magic)
 * - 明确设置 base_res_phys 和 base_res_magic
 */
const Enemies = {
    "enemy1": {
        id: 'enemy1', 
        name: '哥布林', 
        type: 'enemy', 
        hp: 100, mp: 40, level: 5, element: 'WOOD',
        stats: { atk: 35, def: 25, speed: 10 }, 
        base_res_phys: 0.0,  // 无修正
        base_res_magic: 0.0,
        description: "一只普通的哥布林，看起来不太聪明。",
        rewards: { 
            exp: 50, gold: 25, 
            items: [{ itemId: 'potion_hp_low', chance: 0.3 }] 
        },
        skills: ['skill_wood_whip']
    },
    "enemy2": {
        id: 'enemy2', 
        name: '岩石怪', 
        type: 'enemy', 
        hp: 150, mp: 0, level: 6, element: 'EARTH',
        stats: { atk: 50, def: 40, speed: 5 }, 
        // 🟢 修正逻辑：负数代表减伤 (Resistance)
        base_res_phys: -0.2, // 物理减伤 20%
        base_res_magic: 0.2, // 魔法易伤 20%
        description: "坚硬的石头怪物，物理攻击对它效果不佳。",
        rewards: { exp: 80, gold: 40, items: [] },
        skills: ['skill_earth_smash']
    }
};

export const GameDatabase = {
    ItemQuality,
    Items,
    Equipment,
    Skills,
    Enemies
};