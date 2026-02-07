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
 * src/config/Opening.js
 * 开局剧本配置库 (Opening Scenarios Database)
 * * 职责：定义游戏初始化的不同剧本元数据。
 * 核心功能：
 * 1. 绑定地图主题 (mapThemeId)：决定第一章生成什么风格的地图。
 * 2. 绑定队友 (companionIds)：决定开局携带哪些女性角色 (对应 FemaleConfig.js 的 Key)。
 * 3. 玩家修正 (playerConfig)：定义主角的初始身份文本、额外携带的特殊物品或金币修正。
 * 4. 剧本内容 (scripts)：开场演出的对话列表。
 */

export const OPENINGS = {
    
    // ============================================================
    // 1. 墓园苏醒 (经典开局 - 莉莉丝线)
    // ============================================================
    'graveyard_awakening': {
        id: 'graveyard_awakening',
        title: '墓园苏醒',
        description: '你在冰冷的墓坑中醒来，面前是一位暴躁的恶魔少女。为了活下去，你被迫与她缔结了主仆契约...',
        tags: ['双人', '魔法', '主仆'],
        
        // 关联配置
        mapThemeId: 'THEME_FOREST',       // 对应 MapThemes.js
        companionIds: ['lilith'],         // 对应 FemaleConfig.js
        
        // 主角开局修正
        playerConfig: {
            identity: '复生者',
            extraGold: 0,
            character: '迷茫但坚韧，对重获新生感到困惑，却有着强烈的求生本能。',
            appearance: '皮肤呈现出缺乏血色的苍白，身上裹着粗糙破烂的麻布寿衣，乱糟糟的黑发下是一张清秀却略显死气的脸庞。',
            core_objective: '作为莉莉丝的“容器”生存下去，并寻找摆脱灵魂契约的方法。',
        },

        items: [
            // 1. 静态物品：莉莉丝随手扔给你的剩余药水
            { staticId: 'potion_hp_low', count: 2 },

            // 2. 动态物品：不知名的戒指 (剧情物品，动态定义)
            {
                id: "dyn_special_ring_contract",
                name: "不知名的银戒",
                type: "SPECIAL",
                quality: "PURPLE",
                count: 1,
                effect_type: "NONE",
                type_desc: "契约之证",
                description: "一枚冰冷的银色戒指，内侧刻着模糊的名字。\n自从戴上它后，你感觉左胸口的蔷薇图腾与其产生了某种共鸣。"
            },

            // 3. 动态物品：甚至不是正经武器的防身工具
            {
                id: "dyn_wpn_grave_shovel",
                name: "掘墓者的铲子",
                type: "WEAPON",
                subtype: "AXE", // 动作模组类似斧头
                atk_type: "PHYSICAL",
                quality: "GRAY",
                count: 1,
                description: "一把沾满泥土的生锈铁铲，原本是用来埋你的。\n现在它是你唯一的防身武器。",
                stats: {
                    atk: 18,
                    speed: -2 // 挥舞起来有点笨重
                }
            }
        ],

        // 核心剧本 
        scripts: [
            { role: "system", text: "意识在无边的黑暗中缓慢回笼。" },
            { role: "system", text: "你感到后背冰冷潮湿，泥土的腥气钻进鼻腔。指尖触碰到粗糙的石面……那是一块墓碑的底部。" },
            { role: "system", text: "你艰难地睁开眼睛。瞳孔在昏暗中收缩，世界逐渐清晰——你躺在一座被挖开的坟墓里，身上裹着破烂的麻布寿衣，四肢酸软无力。" },
            { role: "少女", text: "可恶……" },
            { role: "system", text: "一道清脆却带着懊恼的少女嗓音从正上方传来。你费力地仰起头。" },
            { role: "system", text: "墓坑边缘坐着一个黑长直发的少女。她容貌惊艳得近乎不真实，苍白的皮肤在月光下几乎透明，此刻却满脸懊悔，用拳头一下一下地砸着地面。" },
            { role: "少女", text: "你……居然只是个普通人……我的复活秘药……就这样浪费在这种货色身上了……" },
            { role: "user", text: "什……什么……" },
            { role: "system", text: "你想说话，却只发出沙哑的气音，喉咙像被砂纸磨过。" },
            { role: "少女", text: "可恶、可恶、可恶！" },
            { role: "system", text: "她又狠狠捶了一下地面，然后猛地看向你，眼神复杂地审视了几秒，最终重重地叹了口气。" },
            { role: "少女", text: "已经没有时间重新找素材了……只能这样了。" },
            { role: "system", text: "她从腰间的皮囊里取出一支拇指粗细的水晶瓶，里面装着粘稠的猩红色液体，瓶身不断泛起幽幽红光，像有生命般缓缓脉动。" },
            { role: "少女", text: "喝下去吧。" },
            { role: "system", text: "她直接把瓶子扔进墓坑，精准落在你胸口。" },
            { role: "system", text: "你颤抖着拿起瓶子，软木塞轻易被拔开，一股甜腻又金属般的怪味冲进鼻腔。" },
            { role: "user", text: "（你迟疑了一瞬，但身体的本能告诉你要喝）……" },
            { role: "system", text: "你仰头将那冰冷的液体灌入口中。刹那间，像有一团火焰从喉咙炸开，顺着血管疯狂蔓延。" },
            { role: "system", text: "剧痛。炙热。撕裂感。心脏像是被一只无形的手狠狠攥住又松开。" },
            { role: "system", text: "在你几乎要昏厥的瞬间，一道冰冷而清晰的女性嗓音直接在你脑海深处响起——" },
            { role: "少女", text: "以我之名，莉莉丝·诺瓦雷斯，缔结灵魂从属契约——从今日起，你将作为我的『容器』与『剑』而存在。" },
            { role: "system", text: "左胸口突然传来灼热的刺痛，一个血红色的蔷薇图腾缓缓浮现，又迅速隐没在皮肤之下。" },
            { role: "system", text: "与此同时，你感觉身体里原本枯竭的力量正以可怕的速度回流，四肢重新拥有了力气。" },
            { role: "莉莉丝", text: "起来吧，我们得走了。" },
            { role: "system", text: "她伸出手，你下意识握住，被她一把拉出墓坑。她的手掌冰凉，却带着不容抗拒的力道。" },
            { role: "system", text: "就在这时，远处传来沉重的脚步声与金属铠甲碰撞的声音。火把的光亮正快速接近，墓园的雾气中隐约浮现银白色的甲胄轮廓。" },
            { role: "system", text: "少女的脸色瞬间沉了下来，漆黑的眼眸中闪过一丝杀意，但很快被冷静取代。" },
            { role: "莉莉丝", text: "啧……来得还真快。皇家卫兵……现在还不是硬拼的时候。" },
            { role: "system", text: "她一把抓住你的手腕，力气大得惊人，转身就往墓园深处奔去。月光下的墓碑如幽灵般掠过，你们钻进一片茂密的荆棘丛生的小径。" },
            { role: "system", text: "身后，卫兵的喊声响起" },
            { role: "莉莉丝", text: "跟紧我，别拖后腿！" },
            { role: "system", text: "她拉着你狂奔，风啸过耳畔，黑发在夜色中飞舞。墓园渐渐被身后甩开，前方出现一片幽暗的森林，树影幢幢，古木参天。" }
        ]
    },

    // ============================================================
    // 2. 战争炮灰 (女长官线)
    // ============================================================
    'battlefield_fodder': {
        id: 'battlefield_fodder',
        title: '战争炮灰',
        description: '帝国军团在边境遭遇了毁灭性打击。作为幸存的小队成员，你必须跟随严厉的女指挥官杀出重围。',
        tags: ['双人', '硬核', '军事'],

        mapThemeId: 'THEME_BATTLEFIELD',
        companionIds: ['commander_sylvia'],

        playerConfig: {
            identity: '逃兵', // 或者 "幸存士兵"
            extraGold: 50,    // 军饷
            character: '务实且警惕，患有轻微的战后应激障碍，比起荣誉更看重如何活过明天。',
            appearance: '脸上沾满硝烟与干涸的黑血，帝国制式轻甲上布满刀痕。眼神中透着历战幸存者特有的疲惫与凶狠。',
            core_objective: '在重装魔导骑士的包围网中存活，护送西尔维亚长官突围。',
        },

        items: [
            // 1. 静态物品：军用配给急救药
            { staticId: 'potion_hp_low', count: 3 },

            // 2. 动态物品：卷刃的军刀
            {
                id: "dyn_wpn_broken_saber",
                name: "卷刃的帝国军刀",
                type: "WEAPON",
                subtype: "SWORD",
                atk_type: "PHYSICAL",
                quality: "GRAY",
                count: 1,
                description: "帝国第三军团的制式军刀，刃口崩了好几个缺口。\n上面凝固的黑血已经分不清是敌人的还是战友的。",
                stats: {
                    atk: 28, // 比普通剑弱，但比铲子强
                    critRate: 0.05
                }
            },

            // 3. 动态物品：染血的狗牌 (饰品)
            {
                id: "dyn_acc_dog_tag",
                name: "染血的铭牌",
                type: "ACCESSORY",
                quality: "GREEN",
                count: 1,
                description: "一块被火熏黑的金属牌，刻着你的编号。\n它提醒着你：活下去，带着战友的那份一起。",
                stats: {
                    maxHp: 30,       // 意志力转化为生命
                    res_phys: 0.05   // 经历战火，微量物理抗性
                }
            }
        ],

        scripts: [
            { role: "system", text: "耳边是永不停歇的轰鸣。" },
            { role: "system", text: "大地在颤抖，泥土和血腥味混在一起被狂风卷进鼻腔。火光、黑烟、断肢、折断的枪杆，到处都是。" },
            { role: "system", text: "你趴在被炸翻的战壕里，胸甲上全是泥和别人的脑浆，右手死死攥着一把已经卷刃的军刀。" },
            { role: "system", text: "几分钟前，你们连还是完整的。现在只剩不到十个人。" },
            { role: "远处士兵", text: "啊啊啊啊——救命！我的腿！" },
            { role: "system", text: "惨叫被下一轮炮火吞没。" },
            { role: "女声·冷厉", text: "别他妈哭了！能动的给我爬起来！" },
            { role: "system", text: "一道沾满灰尘的黑色军靴重重踩在战壕边沿。靴子主人是个高挑的女人，深红短发被汗水和血粘在额角，左眼下方有一道新鲜的刀疤。" },
            { role: "system", text: "她胸前的指挥官徽章在火光中闪着冷光——帝国第三军团·突击指挥官 西尔维娅·克罗维尔。" },
            { role: "西尔维娅", text: "还有气就给我站起来，新兵！" },
            { role: "user", text: "（喘息）……长官……我们……已经被包围了……" },
            { role: "西尔维娅", text: "废话。我眼睛没瞎。" },
            { role: "system", text: "她单手拎起一杆还在冒烟的火枪，熟练地从腰间摸出最后一发魔晶弹塞进去，咔哒一声上膛。" },
            { role: "西尔维娅", text: "敌军重装魔导骑士还有三分钟就会碾过这片高地。想活命就闭嘴跟上。" },
            { role: "system", text: "她居高临下看了你一眼，目光像刀锋一样锋利，却又带着一丝近乎残酷的冷静。" },
            { role: "西尔维娅", text: "你。叫什么名字？" },
            { role: "user", text: "（报出名字）……" },
            { role: "西尔维娅", text: "记住了。从现在起，你是我的副官。死了我也会把你尸体扛回去。" },
            { role: "system", text: "她忽然伸手，一把揪住你的胸甲把你拽起来，力道大得几乎让你脚离地。" },
            { role: "西尔维娅", text: "听好了。我们要从东侧的断崖突围。那里有条魔兽踩出来的兽径，能通往黑松林。" },
            { role: "system", text: "远处传来沉重的金属脚步声，伴随着低沉的魔导引擎轰鸣。地平线上浮现出十几米高的黑铁骑士身影。" },
            { role: "西尔维娅", text: "时间到。跑！" },
            { role: "system", text: "她当先跃出战壕，火枪单手连射三发，精准打爆一头冲过来的战争猎犬头颅。你踉跄着跟上，身后炮火与惨叫交织成末日的交响乐。" }
        ]
    },

    // ============================================================
    // 3. 森林魔法学徒 (女师傅线)
    // ============================================================
    'mountain_apprentice': {
        id: 'mountain_apprentice',
        title: '深山修行',
        description: '你跟随隐居的大魔女在深山修行多年。直到某一天，师傅突然把你叫到跟前，说要进行“最后的试炼”。',
        tags: ['双人', '轻松', '养成'],

        mapThemeId: 'THEME_MOUNTAIN',
        companionIds: ['master_elara'],

        playerConfig: {
            identity: '见习法师',
            extraGold: 100,
            character: '好奇心旺盛，对世俗常识有些缺乏，在魔法领域有着超乎常人的专注。',
            appearance: '穿着朴素但干净的学徒长袍，袖口总是沾着不知名的草药汁液。手指修长，散发着淡淡的雪松味。',
            core_objective: '通过艾拉大师的最终试炼，协助她缝合虚空裂隙。',
        },

        items: [
            // 1. 静态物品：师傅炼制的魔力药水
            { staticId: 'potion_mp_low', count: 5 },
            { staticId: 'potion_hp_low', count: 2 },

            // 2. 动态物品：练习用法杖
            {
                id: "dyn_wpn_training_wand",
                name: "橡木练习法杖",
                type: "WEAPON",
                subtype: "STAFF",
                atk_type: "MAGIC",
                quality: "GREEN",
                count: 1,
                description: "艾拉师傅亲手削制的法杖，杖头镶嵌着一颗低纯度魔晶。\n虽然是练习用的，但手感意外地好。",
                stats: {
                    atk: 20,
                    maxMp: 30, // 增加法力上限
                    speed: 2   // 轻便
                }
            },

            // 3. 动态物品：魔法笔记 (特殊)
            {
                id: "dyn_lore_magic_notes",
                name: "被涂改的魔法笔记",
                type: "SPECIAL",
                quality: "BLUE",
                count: 1,
                effect_type: "NONE",
                type_desc: "知识记录",
                description: "记录了你修行期间的心得。\n空白处画满了师傅的批注（以及几个嘲笑你鬼画符的Q版涂鸦）。"
            }
        ],

        scripts: [
            { role: "system", text: "晨雾还未散尽，木屋的木板墙缝里透进第一缕金色阳光。" },
            { role: "system", text: "你闻到煮沸的药草味、烧焦的松脂味，还有师傅惯用的那种淡淡的雪松与焚香混合的气息。" },
            { role: "system", text: "你盘腿坐在工房中央的法阵里，面前漂浮着七颗不同颜色的微光晶体，正在按照既定的轨迹缓缓旋转。" },
            { role: "女声·沉稳", text: "专注。别让第十三次心跳打乱节奏。" },
            { role: "system", text: "艾拉大师的声音从你身后传来。她今天没穿那件沾满草汁的旧袍，而是罕见地披上了深靛蓝的星纹长袍，银白长发用一根简单的骨簪束起。" },
            { role: "艾拉", text: "今天是最后一次共鸣校准。做完它，你就不再是我的学徒。" },
            { role: "user", text: "（紧张地咽了口唾沫）……最后一次？" },
            { role: "艾拉", text: "嗯。也是最危险的一次。" },
            { role: "system", text: "她赤足走到法阵边缘，修长的手指轻轻点在阵纹的枢纽节点上。刹那间，所有晶体同时亮起刺目的光。" },
            { role: "system", text: "你感觉自己的魔力回路像被强行撕开又缝合，痛得几乎叫出声。" },
            { role: "艾拉", text: "忍住。让它流经心脏，再回到我这里。" },
            { role: "system", text: "你咬紧牙关，汗水顺着额角滑进眼里。模糊的视线里，师傅的身影被法阵的光晕笼罩，像一尊月下精灵。" },
            { role: "艾拉", text: "很好……再坚持三十秒……" },
            { role: "system", text: "突然，整个木屋剧烈震动。屋顶的草药束簌簌落下，窗外传来不属于森林的低沉咆哮。" },
            { role: "艾拉", text: "……来得比我预想的早。" },
            { role: "system", text: "她猛地收手，法阵瞬间崩解。你眼前一黑，被反噬的魔力冲得差点吐血。" },
            { role: "艾拉", text: "起来。试炼提前了。" },
            { role: "system", text: "她转身看向窗外，瞳孔收缩成针尖大小。" },
            { role: "艾拉", text: "虚空裂隙在山脉南坡撕开了第三道口子。它们来了。" },
            { role: "system", text: "她回身看向你，眼神前所未有地严肃，却又带着一丝温柔的决绝。" },
            { role: "艾拉", text: "孩子，这是你的成年礼。跟我一起，去把那个裂口……缝起来。" }
        ]
    },

    // ============================================================
    // 4. 荒野求生 (单人 - 硬核)
    // ============================================================
    'wasteland_survival': {
        id: 'wasteland_survival',
        title: '荒野流放',
        description: '因为莫须有的罪名，你被流放到了文明之外的无尽荒原。这里没有法律，只有生存。',
        tags: ['单人', '生存', '高难'],

        mapThemeId: 'THEME_WASTELAND',
        companionIds: [], // 单人开局

        playerConfig: {
            identity: '流放者',
            extraGold: 0, // 身无分文
            character: '沉默寡言，隐忍冷酷。被背叛的经历让你不再轻易信任任何人。',
            appearance: '皮肤因为风沙侵蚀而变得粗糙干裂，嘴唇起皮。手腕和脚踝处留着长年佩戴重型镣铐留下的青紫色淤痕。',
            core_objective: '在物资匮乏的荒原中活过第一周，寻找前往文明世界的路。',
        },

        items: [
            // 无任何药水开局 (硬核)

            // 1. 动态物品：打磨的石片 (极其简陋的武器)
            {
                id: "dyn_wpn_stone_shard",
                name: "锋利的黑曜石片",
                type: "WEAPON",
                subtype: "DAGGER",
                atk_type: "PHYSICAL",
                quality: "GRAY",
                count: 1,
                description: "你在荒原岩石缝里捡到的一块边缘锋利的石头。\n用破布缠了一圈作为握把，勉强能割开野兽的喉咙。",
                stats: {
                    atk: 12,
                    critRate: 0.15, // 匕首类高暴击
                    speed: 5        // 极快
                }
            },

            // 2. 动态物品：母亲的遗物 (仅剩的精神寄托)
            {
                id: "dyn_acc_mother_cross",
                name: "发黑的银十字",
                type: "ACCESSORY",
                quality: "GRAY",
                count: 1,
                description: "母亲留下的廉价护身符，链子已经被磨断了，只能揣在怀里。\n它并没有神力，但握着它能让你感到一丝虚幻的温暖。",
                stats: {
                    res_magic: 0.02 // 极其微弱的心理安慰抗性
                }
            }
        ],

        scripts: [
            { role: "system", text: "喉咙像被火烧过。你醒来的第一件事，是剧烈地咳嗽。" },
            { role: "system", text: "嘴唇干裂，舌头肿得几乎塞满口腔。睁开眼，只有无边无际的灰黄色天空和龟裂的大地。空气中弥漫着淡淡的魔雾，甜腻而腐蚀，像在悄无声息地啃噬你的肺叶。" },
            { role: "system", text: "你被扔在一块风化的巨岩阴影里，双手被粗麻绳反绑，脚踝上还挂着半截打断的铁镣。铁镣上刻着王国法师的封印符文，已然黯淡无光。" },
            { role: "system", text: "腰间空空如也——佩剑、钱袋、护身符，全都不见了。只剩胸前那枚母亲留下的廉价银十字，链子已被磨得发黑。" },
            { role: "system", text: "远处传来秃鹫的叫声，像在嘲笑。风卷起沙尘，打在脸上像刀割。更远处，地平线上隐约可见一道扭曲的虚空裂隙，紫黑色的触手状雾气从中缓缓溢出。" },
            { role: "system", text: "你想起最后记得的画面：行刑台、围观的民众、法官冰冷的宣判——『流放，不得归乡。愿光明女神怜悯你的灵魂。』他们甚至懒得杀你，直接把你扔进荒原，等着沙漠、魔雾或虚空兽替他们完成判决。" },
            { role: "system", text: "风啸声中，似乎夹杂着低沉的呢喃……虚空的低语？还是幻觉？你的头开始隐隐作痛。" },
            { role: "system", text: "你艰难地用肩膀蹭着岩石棱角，一点一点磨断绳索。手腕磨出血肉模糊，鲜血滴落时，竟在沙土上发出滋滋的腐蚀声——魔雾已开始侵蚀你的身体。" },
            { role: "system", text: "终于——绳子松了。你用尽全力扯开绳结，双手自由的一瞬间，眼泪混着沙子流下来。不是因为疼，是因为你意识到——从这一刻起，没有人会来救你。骑士团不会，魔族不会，连女神也不会。" },
            { role: "system", text: "你摇摇晃晃站起来，踢开脚踝的铁镣，环顾四周。没有路标，没有水源，只有无尽的荒原和远处模糊的黑色山影。山影后，似乎有零星的火光闪烁——是劫匪营地？还是虚空异变的难民营？" },
            { role: "system", text: "在岩石缝隙中，你发现了一把半埋在沙里的破剑：剑刃布满缺口，剑柄缠着干瘪的皮革，但至少是武器。" },
            { role: "system", text: "你捡起它，剑身冰冷刺骨。你深吸一口气，嘶哑地对自己说了一句：" },
            { role: "user", text: "……我还活着。就算要死，也要死得像个人。" },
            { role: "system", text: "身后，虚空裂隙的方向传来一声非人的咆哮。沙尘暴正缓缓逼近。你别无选择，只能握紧剑柄，朝着那遥远的火光前进。" }
        ]
    },

    // ============================================================
    // 5. 魔族祭品 (单人 - 逃脱)
    // ============================================================
    'demon_sacrifice': {
        id: 'demon_sacrifice',
        title: '魔窟逃脱',
        description: '你被邪教徒绑架，作为召唤魔王的祭品被扔进了地牢深处。在仪式开始前，你必须想办法逃离。',
        tags: ['单人', '惊悚', '潜行'],

        mapThemeId: 'THEME_DUNGEON',
        companionIds: [],

        playerConfig: {
            identity: '祭品',
            extraGold: 0,
            character: '神经质且极度敏感，在此刻，任何风吹草动都会让你紧绷神经。',
            appearance: '身穿单薄的祭祀白袍，已经被冷汗浸透。脖颈和手腕上有被粗暴捆绑勒出的血痕，身体因恐惧而微微颤抖。',
            core_objective: '不惜一切代价逃离邪教徒的地牢，避免成为魔王复活的祭品。',
        },

        items: [
            // 1. 动态物品：镣铐碎片
            {
                id: "dyn_special_shackle",
                name: "断裂的魔纹镣铐",
                type: "SPECIAL",
                quality: "BLUE",
                count: 1,
                effect_type: "NONE",
                type_desc: "逃脱证明",
                description: "刻有法师封印符文的镣铐碎片。\n虽然已经断裂，但断口处仍散发着令人不适的魔力波动。\n这是你从必死命运中逃离的勋章。"
            }
        ],

        scripts: [
            { role: "system", text: "黑暗。潮湿。铁锈与腐肉的味道，混杂着魔雾特有的甜腥。" },
            { role: "system", text: "你被倒吊在生锈的铁链上，脚踝处的镣铐已经磨破皮肉，鲜血一滴一滴落在下方的符文地面，激起细微的紫色烟雾。" },
            { role: "system", text: "喉咙被塞了块浸过麻药的破布，嘴里全是血腥味和霉味。头脑昏沉，但求生本能让你勉强保持清醒。" },
            { role: "system", text: "墙壁上嵌着发光的虚空晶石，投下诡异的紫光。映照出地牢的惨状：铁笼里蜷缩着其他『祭品』，有的已半融化成肉泥，有的还在抽搐低语。" },
            { role: "远处", text: "……主上……血月已升……仪式可以开始了……" },
            { role: "system", text: "低沉的咏唱声从石阶上方传来，伴随着沉重的脚步和金属拖地的声音。空气开始震颤，符文地面亮起血红色的脉络，直冲你的心脏。" },
            { role: "system", text: "你拼命扭动身体，试图让倒吊的姿势让血液流回大脑。手腕被反绑的绳索里混了荆棘藤，稍微一动就刺得更深，鲜血顺着手臂倒流进袖子。" },
            { role: "system", text: "但你还是咬紧牙，用指甲一点点抠着绳结。脑海中回荡着绑架前的记忆：下城区的黑市，你无意中听到『魔王遗藏碎片』的传闻，便被这些疯子盯上。" },
            { role: "上方祭司", text: "伟大的虚空之主啊……请接受这具卑微的容器……让您的意志通过鲜血重生！" },
            { role: "system", text: "咏唱声越来越响，地面符文如活物般蠕动。你感觉心脏被一只无形的手攥紧，视野开始扭曲——幻觉中，魔族的阴影在低语：『契约吧……力量……永生……』" },
            { role: "system", text: "就在这时——绳结终于松了一丝。你剧烈喘息，用尽全力一挣。啪——绳子断裂。你整个人摔落在冰冷的石板上，嘴里堵着的布也被震落。" },
            { role: "system", text: "你剧烈咳嗽，吐出一口带血的唾沫，然后用尽全力爬向最近的阴影：一个堆满骨骸的凹槽。骨头间，竟有一把生锈的祭祀匕首。" },
            { role: "system", text: "你抓起它，匕首刃口还残留着干涸的血迹。远处祭司的笑声戛然而止：" },
            { role: "祭司", text: "……嗯？怎么回事？！祭品……逃了？！" },
            { role: "system", text: "火把的光亮和脚步声开始朝石阶下方移动。地牢深处传来铁栅门的吱呀声——守卫醒了。你知道，只剩不到一分钟。握紧匕首，你钻进骨堆，等待机会。" }
        ]
    },

    // ============================================================
    // 6. 城市贵族 (单人 - 经营)
    // ============================================================
    'city_noble': {
        id: 'city_noble',
        title: '落魄贵族',
        description: '家道中落的你变卖了最后的家产，来到了混乱的下城区。你想在这里重新建立属于你的家族荣耀。',
        tags: ['单人', '贸易', '探索'],

        mapThemeId: 'THEME_CITY',
        companionIds: ['noble_sister', 'noble_maid'],

        playerConfig: {
            identity: '没落贵族',
            extraGold: 1000, // 开局启动资金较多
            character: '高傲、精明，即使落魄也不愿放下贵族的自尊，擅长用言语而非刀剑解决问题。',
            appearance: '即使天鹅绒外套磨破了袖口，你的仪态依然挺拔。皮肤白皙保养得当，与下城区肮脏的环境格格不入。',
            core_objective: '利用手中的启动资金在下城区黑市立足，积累财富重建家族。',
        },

        items: [
            // 1. 静态物品：作为贵族最后的体面，带一瓶高级货
            { staticId: 'potion_hybrid_low', count: 1 },

            // 2. 动态物品：家族印章戒指
            {
                id: "dyn_acc_noble_signet",
                name: "家族纹章戒指",
                type: "ACCESSORY",
                quality: "BLUE",
                count: 1,
                description: "一枚纯金打造的印章戒指，戒面刻着家族的家徽（现已无人问津）。\n当你在下城区展示它时，人们或许会多看你一眼——出于敬意，或是贪婪。",
                stats: {
                    maxMp: 20,    // 贵族教育带来的魔力感知
                    speed: 2,     // 交涉反应速度? (象征性)
                    // 实际上这是一个偏向社交/剧情的装备
                }
            },

            // 3. 动态物品：地契残卷
            {
                id: "dyn_lore_land_deed",
                name: "烧焦的地契残卷",
                type: "SPECIAL",
                quality: "PURPLE",
                count: 1,
                effect_type: "NONE",
                type_desc: "家族遗产",
                description: "家族宅邸的地契——虽然那座宅邸已经在大火中化为灰烬。\n这张羊皮纸是你夺回荣耀的合法依据，如果你能活到那一天的话。"
            }
        ],

        scripts: [
            { role: "system", text: "马车在鹅卵石路上颠簸了整整一天，终于在黄昏时停下。车轮碾过污水坑，溅起混着魔雾的污秽水花。" },
            { role: "车夫", text: "到了，老爷。下城区，黑鸦广场。再往前就是魔雾重灾区了，想死别拉着我的马。" },
            { role: "system", text: "车夫粗暴地将行李箱扔下车。一只戴着洁白手套的手稳稳地在半空接住了沉重的皮箱——贝拉面无表情地将箱子放下，转身展开了轮椅。" },
            { role: "贝拉", text: "（冷冷地瞥了车夫一眼）……粗鲁的下等人。主人，请扶小姐下来。" },
            { role: "system", text: "你小心翼翼地将塞西莉亚抱下马车，放在轮椅上。她脸色苍白如纸，用手帕捂着嘴，刚才的颠簸让她有些喘不过气。" },
            { role: "塞西莉亚", text: "咳咳……对不起，哥哥……我又拖累你们了……这里的空气，好浑浊……" },
            { role: "system", text: "你为她拢紧了披肩，抬头看向四周。天空被永恒的灰云笼罩，空气中弥漫着烤肉、污水、劣质烟草和魔雾特有的甜腐味。" },
            { role: "system", text: "周围是拥挤的街道：醉汉、流莺、抱着畸形儿的乞妇……他们贪婪或麻木的目光落在你们三人身上——落魄的贵族少爷、病弱的银发少女、穿着考究的女仆，这组合在下城区显得格格不入。" },
            { role: "路边醉汉", text: "哟～这是哪家的小少爷来体验生活？带的妞儿倒是不错，要是那个病秧子死了，不如让这女仆陪大爷……" },
            { role: "system", text: "寒光一闪。醉汉的话还没说完，一把银晃晃的餐刀已经贴着他的脸颊钉在了后面的木柱上，切断了他的一缕头发。" },
            { role: "贝拉", text: "（推了推眼镜）下次瞄准的就是你的舌头。滚。" },
            { role: "system", text: "醉汉吓得连滚带爬地跑了。贝拉若无其事地收回飞刀，推着轮椅，为你开辟出一条道路。" },
            { role: "user", text: "走吧。去那是看起来唯一能住人的地方——『铁锚旅店』。" },
            { role: "system", text: "推开旅店的门，烟雾、酒气和低语声扑面而来。大厅里的佣兵们停止了交谈，目光肆无忌惮地打量着你们。" },
            { role: "system", text: "你走到柜台前，将家族戒指重重拍在木板上。柜台后的老板娘眯起眼睛，视线在戒指、塞西莉亚的轮椅和贝拉的女仆装之间来回游移。" },
            { role: "老板娘", text: "啧，拖家带口的落魄凤凰？这戒指成色不错……但这儿可不是你们这种娇生惯养的人该待的地方。" },
            { role: "user", text: "我要一间最干净的房间，朝阳，通风要好。我妹妹受不了烟味和潮气。剩下的钱，这就当预付金。" },
            { role: "老板娘", text: "（收起戒指，吹了声口哨）要求还真多……行吧，三楼顶头那间。另外附赠个情报：今晚黑市拍卖魔族血晶，听说那东西对治疗『魔雾侵蚀症』有奇效——如果你是为了这丫头来的话。" },
            { role: "system", text: "听到“魔族血晶”，原本虚弱的塞西莉亚猛地抓住了你的衣袖，眼中闪过一丝惊恐。" },
            { role: "塞西莉亚", text: "哥哥……不要……太危险了……我们剩下的钱不多了……" },
            { role: "贝拉", text: "（俯身整理塞西莉亚的裙摆）请放心，小姐。只要是主人的意志，哪怕是魔王的宫殿，贝拉也会为您扫清道路。" },
            { role: "system", text: "你反握住妹妹冰凉的手，看着她担忧的眼睛，内心只剩下一个念头：哪怕要在泥潭里打滚，也要让她们活下去，重铸家族的荣光。" },
            { role: "system", text: "楼上传来女人的娇喘和魔族低吼。贝拉面无表情地捂住了塞西莉亚的耳朵。你深吸一口气，带着她们走向那扇通往未来的门。" }
        ]
    }
};

// 默认使用的开场 ID (兜底用)
export const DEFAULT_OPENING_ID = 'graveyard_awakening';

// 工具函数：获取指定开场配置
export function getOpeningConfig(id) {
    return OPENINGS[id] || OPENINGS[DEFAULT_OPENING_ID];
}