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

/**
 * src/config/FemaleConfig.js
 * * 女性角色配置库 (Female Companion Database)
 * 职责：定义所有潜在女性队友的基础档案、初始战斗属性与 H 状态初始值。
 * * 设计原则：
 * 1. 键值对结构：Key 为角色 ID (需与 Opening.js 中的 companionIds 对应)。
 * 2. 动态兼容：未来 LLM 生成的新角色只需生成符合此结构的 JSON 即可直接热加载。
 * 3. H 状态预设：显式定义初始的好感/堕落/开发度，支持千人千面的开局关系。
 */

export const FemaleConfig = {

    // ============================================================
    // 1. 莉莉丝 (Lilith) - 对应开局：墓园苏醒 (FOREST)
    // ============================================================
    "lilith": {
        id: "lilith",
        base_info: {
            name: "莉莉丝",
            identity: "恶魔公主",
            // 核心性格标签，供 LLM 参考
            character: "傲娇、毒舌、高傲、隐藏的占有欲", 
            // 纯文本外观描述，不依赖图片
            appearance: "拥有一头如夜色般柔顺的黑长直发，眼眸是摄人心魄的鲜红色。身形高挑丰满，皮肤呈现出病态的苍白。常穿哥特风格的黑色蕾丝裙装，散发着危险而迷人的气息。",
            core_objective: "寻找解除自身封印的方法，向背叛者复仇"
        },
        
        // 初始战斗属性 (裸值)
        attributes: {
            base_atk: 20,       // 高攻击
            base_def: 3,        // 低防御
            base_speed: 12,     // 较快
            base_crit_rate: 0.20,
            base_crit_dmg: 0.50,
            resistance_phys: 0.9, // 身体较弱，受到 100% -> 90% (需修正) 物理伤害? 不，这里1.0是基准。设为1.1代表易伤。设为0.9代表减伤。
            // 恶魔体质：轻微物理易伤，高魔抗
            resistance_phys: 1.1, 
            resistance_magic: 0.8 
        },

        // 初始装备 (引用 GameDatabase ID)
        initial_equipment: {
            weapon: "wpn_staff_01",
            chest: "armor_magic_chest" // 假设有对应法袍，如果没有系统会自适应或留空
        },

        // 初始技能列表
        initial_skills: ["skill_water_shot", "skill_fire_bolt"],

        // H 系统初始状态 (H_State)
        h_state_init: {
            affection: 5,        // 好感度：低 (视主角为奴仆/工具)
            depravity: 10,       // 堕落度：低 (虽然是恶魔，但身为皇室非常高傲，不屑于低俗行为)
            isVirgin: true,      // 处女：是 (皇室的高洁)
            sexCount: 0,
            // 部位开发度 (0-100)
            parts: {
                mouth: 0,
                breast: 0,
                pussy: 0,
                anal: 0
            },
            // 初始称呼
            call_player: "愚蠢的容器"
        }
    },

    // ============================================================
    // 2. 西尔维亚 (Sylvia) - 对应开局：战争炮灰 (BATTLEFIELD)
    // ============================================================
    "commander_sylvia": {
        id: "commander_sylvia",
        base_info: {
            name: "西尔维亚",
            identity: "帝国指挥官",
            character: "严厉、冷酷、责任感极强、内心压抑",
            appearance: "留着干练的银色短发，眼神如刀锋般锐利。身着帝国制式轻铠，身材被紧致的战斗服包裹，肌肉线条流畅而有力。右脸颊有一道浅浅的疤痕，不仅不损美貌，反增几分英气。",
            core_objective: "带领残部在死局中突围，守护国家的荣耀"
        },

        attributes: {
            base_atk: 18,
            base_def: 12,       // 高防御
            base_speed: 10,     // 中等
            base_crit_rate: 0.15,
            resistance_phys: 0.8, // 历战之躯，物理抗性高
            resistance_magic: 1.2 // 对魔法抗性较差
        },

        initial_equipment: {
            weapon: "wpn_sword_01",
            chest: "armor_phys_chest"
        },

        initial_skills: ["skill_metal_cut", "skill_earth_buff"], // 擅长物理斩击与防御Buff

        h_state_init: {
            affection: 15,       // 好感度：中低 (对部下的基本信任，但有阶级隔阂)
            depravity: 0,        // 堕落度：零 (禁欲主义者，视享乐为软弱)
            isVirgin: true,      // 处女：是 (嫁给了军队)
            sexCount: 0,
            parts: {
                mouth: 0,
                breast: 0,
                pussy: 0,
                anal: 0
            },
            call_player: "士兵"
        }
    },

    // ============================================================
    // 3. 艾拉 (Elara) - 对应开局：深山魔法学徒 (MOUNTAIN)
    // ============================================================
    "master_elara": {
        id: "master_elara",
        base_info: {
            name: "艾拉",
            identity: "隐世大魔女",
            character: "温柔、天然呆、知性、深不可测",
            appearance: "看起来是二十多岁的成熟女性，实际年龄未知。拥有一头波浪般的亚麻色长发，总是戴着一副宽大的眼镜。穿着宽松的法师长袍，却掩盖不住那惊人的胸怀。",
            core_objective: "教导这唯一的笨蛋弟子出师，顺便研究世界的异变"
        },

        attributes: {
            base_atk: 8,         // 物理攻击极低
            base_def: 5,
            base_speed: 14,      // 意外地敏捷 (或是时间魔法?)
            base_crit_rate: 0.10,
            resistance_phys: 1.3, // 身体非常脆弱
            resistance_magic: 0.5 // 魔法抗性极高 (大师级)
        },

        initial_equipment: {
            weapon: "wpn_staff_01",
            chest: "armor_magic_chest"
        },

        initial_skills: ["skill_wood_whip", "skill_wood_buff", "skill_holy_pray"], // 擅长控制与治疗

        h_state_init: {
            affection: 40,       // 好感度：高 (非常宠溺弟子，但这不一定是爱情)
            depravity: 5,        // 堕落度：低 (对未知的学术探究精神...)
            isVirgin: true,      // 处女：是 (一直隐居深山，虽然理论知识丰富)
            sexCount: 0,
            parts: {
                mouth: 0,
                breast: 5,       // 胸部稍微有点敏感 (可能是因为太大了?)
                pussy: 0,
                anal: 0
            },
            call_player: "小徒弟"
        }
    },

    // ============================================================
    // 4. 塞西莉亚 (Cecilia) - 妹妹 (对应：落魄贵族)
    // ============================================================
    "noble_sister": {
        id: "noble_sister",
        base_info: {
            name: "塞西莉亚",
            identity: "病弱妹妹",
            character: "温婉、依赖兄长、外柔内刚、久病成医",
            appearance: "拥有家族遗传的银白色长发，因为常年不见阳光，皮肤呈现出透明的质感。坐在轮椅上（或拄着手杖），身穿略显旧气的贵族长裙，眼神中总是充满了对你的担忧。",
            core_objective: "治好自己的身体，不再成为哥哥的累赘，并复兴家族荣耀"
        },

        attributes: {
            base_atk: 5,          // 身体虚弱，物理攻击极低
            base_def: 2,          // 极脆
            base_speed: 6,        // 慢
            base_crit_rate: 0.05,
            resistance_phys: 1.5, // 【负面特性】受到物理伤害增加 50%
            resistance_magic: 0.6 // 【正面特性】极高的魔法抗性（魔法天才）
        },

        initial_equipment: {
            weapon: "wpn_book_old", // 假设有一本旧魔导书
            chest: "armor_dress_silk"
        },

        initial_skills: ["skill_heal_light", "skill_ice_shield"], // 治疗与护盾

        h_state_init: {
            affection: 80,       // 好感度：极高 (相依为命的兄妹)
            depravity: 0,        // 堕落度：零
            isVirgin: true,
            sexCount: 0,
            parts: {
                mouth: 0,
                breast: 0,
                pussy: 0,
                anal: 0
            },
            call_player: "哥哥大人"
        }
    },

    // ============================================================
    // 5. 贝拉 (Bella) - 贴身女仆 (对应：落魄贵族)
    // ============================================================
    "noble_maid": {
        id: "noble_maid",
        base_info: {
            name: "贝拉",
            identity: "战斗女仆",
            character: "三无（无口无心无表情）、绝对忠诚、毒舌（偶尔）、家务万能",
            appearance: "穿着便于行动的改制女仆装，裙摆下藏着多把飞刀。黑发盘在脑后，戴着黑框眼镜，无论何时都保持着完美的站姿。看垃圾的眼神和看主人的眼神可以无缝切换。",
            core_objective: "铲除一切阻碍主人复兴家族的障碍（顺便催主人起床）"
        },

        attributes: {
            base_atk: 16,
            base_def: 8,
            base_speed: 18,       // 极快 (刺客型)
            base_crit_rate: 0.30, // 高暴击
            resistance_phys: 0.9,
            resistance_magic: 1.0
        },

        initial_equipment: {
            weapon: "wpn_dagger_maid", // 假设有女仆短刀
            chest: "armor_maid_outfit"
        },

        initial_skills: ["skill_dagger_throw", "skill_clean_up"], // 投掷与“大扫除”(AOE)

        h_state_init: {
            affection: 50,       // 好感度：高 (家族死士的忠诚)
            depravity: 10,       // 堕落度：低 (为了主人的话，什么都可以做)
            isVirgin: true,
            sexCount: 0,
            parts: {
                mouth: 5,        // 稍微有点侍奉经验?
                breast: 0,
                pussy: 0,
                anal: 0
            },
            call_player: "主人"
        }
    }

};
