/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/config/CustomOpeningConfig.js

export const CustomOpeningConfig = {
    // ==========================================
    // 1. 物品生成规则
    // ==========================================
    ITEMS: {
        // 静态物品生成的概率 (35%)
        STATIC_RATIO: 0.35,

        // 静态物品池定义 (类型概率)
        STATIC_TYPE_WEIGHTS: {
            'potion_hp': 0.4,
            'potion_mp': 0.4,
            'potion_hybrid': 0.2
        },

        // 静态物品品质/档位概率
        STATIC_TIER_WEIGHTS: {
            'low': 0.6,
            'mid': 0.3,
            'high': 0.1
        },

        // 静态物品 ID 映射表 (Database ID)
        STATIC_ID_MAP: {
            'potion_hp_low': 'item_potion_hp_small',
            'potion_hp_mid': 'item_potion_hp_medium',
            'potion_hp_high': 'item_potion_hp_large',
            'potion_mp_low': 'item_potion_mp_small',
            'potion_mp_mid': 'item_potion_mp_medium',
            'potion_mp_high': 'item_potion_mp_large',
            'potion_hybrid_low': 'item_potion_hybrid_small',
            'potion_hybrid_mid': 'item_potion_hybrid_medium',
            'potion_hybrid_high': 'item_potion_hybrid_large',
        },

        // 动态物品品质概率 [GRAY, GREEN, BLUE, PURPLE, GOLD, RED]
        DYNAMIC_QUALITY_WEIGHTS: [
            { value: 'GRAY', weight: 0.10 },
            { value: 'GREEN', weight: 0.40 },
            { value: 'BLUE', weight: 0.25 },
            { value: 'PURPLE', weight: 0.15 },
            { value: 'GOLD', weight: 0.07 },
            { value: 'RED', weight: 0.03 }
        ],

        // 动态物品种类概率
        DYNAMIC_TYPE_WEIGHTS: [
            { value: 'WEAPON', weight: 0.3 },
            { value: 'ARMOR', weight: 0.3 },
            { value: 'ACCESSORY', weight: 0.3 },
            { value: 'SPECIAL', weight: 0.1 } // 包含技能书等
        ]
    },

    // ==========================================
    // 2. 剧本生成规则
    // ==========================================
    SCRIPTS: {
        // 生成的剧本长度范围 (条数)
        LENGTH_RANGE: [20, 30]
    },

    // ==========================================
    // 3. 伴侣生成规则 (属性骨架范围)
    // ==========================================
    COMPANIONS: {
        // 基础属性范围 (用于给 LLM 参考或作为兜底)
        BASE_STATS: {
            atk: [10, 20],
            def: [5, 15],
            speed: [10, 15],
            crit: [0.1, 0.3],
            resistance_phys: [0.5,1.5],
            resistance_magic: [0.5,1.5]
        },
    }
};