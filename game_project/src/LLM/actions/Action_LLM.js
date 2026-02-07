/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/LLM/actions/Action_LLM.js

import { store, addLog } from '../../ui/modules/store.js';
import { HInteractionSystem } from '../../systems/HInteractionSystem/HInteractionSystem.js';
import { ChoiceSystem } from '../../systems/ChoiceSystem/ChoiceSystem.js';
import { Npc_Memory } from '../memory/Npc_Memory.js';
import { CharacterModel } from '../../systems/PlayerState.js';
import { HState } from '../../systems/HInteractionSystem/H_State.js';
import { ChatData } from '../../ui/modules/ChatData.js'; 
import { Party_Memory } from '../memory/Party_Memory.js';
import { NodeType, NodeState } from '../../map/MapData.js';

// 定义异步函数构造器，用于动态执行脚本
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

/**
 * LLM 系统指令执行器 (Action LLM)
 * 职责：解析并执行 <LLM_System_Instruction> 中的伪代码指令
 */
export const Action_LLM = {

    // 🟢 [新增] 用于存储挂起的 Promise resolve 函数
    _pendingChoiceResolve: null,

    /**
     * 执行脚本指令 (v3.0 脚本引擎版)
     * 支持完整 JS 语法: if/else, await, 变量声明
     * @param {string} scriptContent - LLM 生成的代码片段
     */
    async execute(scriptContent) {
        if (!scriptContent) return;

        console.group("[Action_LLM] ⚡ 开始执行脚本指令");

        try {
            // 1. 构建沙盒环境 (Sandbox)
            // 将所有注册的指令作为局部变量注入，使脚本可以直接调用 start_H(...) 而非 this.registry.start_H
            const scope = this.commandRegistry;
            const argNames = Object.keys(scope);
            const argValues = Object.values(scope);
            const start_combat = this.commandRegistry.start_combat;
            
            // 2. 动态构建异步函数
            // 函数体: "return (async () => { ...scriptContent... })()" 的逻辑
            const dynamicFn = new AsyncFunction(...argNames, scriptContent);

            // 3. 执行脚本
            console.log("📜 执行脚本片段:", scriptContent);
            
            // 传入具体的 API 实现
            await dynamicFn(...argValues);
            
            addLog(`⚙️ 系统指令执行完毕`);

        } catch (e) {
            console.error("❌ [Action_LLM] 脚本执行异常:", e);
            console.error("Script Content:", scriptContent);
            addLog(`⚠️ 指令执行出错: ${e.message}`);
        }

        console.groupEnd();
    },

    // ==========================================
    // 指令注册表 (Command Registry)
    // ==========================================
    commandRegistry: {

        /**
         * 1. 触发 H 系统
         * params: { charId, eventName }
         * 修正：移除时间与地点参数，直接调用 HInteractionSystem (它内部会自动获取环境信息)
         */
        start_H: async (p) => {
            // 🟢 1. 流程控制：等待阅读 + 确认
            await ChatData.waitForAllMessages();
            await Action_LLM._confirmTransition("亲密互动");

            // 🟢 2. 启动系统
            // HInteractionSystem.startInteraction(charIds, eventName)
            // 支持传入 p.charIds (数组) 或 p.charId (单字符串)
            const targets = p.charIds || p.charId;
            
            if (!targets) {
                console.warn("[Action_LLM] start_H 缺少 charId 参数");
                return;
            }

            // 🟢 [新增] 获取最近聊天上下文 (包含前情与抉择结果)
            // 这里的 5 条记录包含了 [System: 抉择结果] 以及之前的 [NPC: 对话]
            const recentLogs = ChatData.getRecentContext(5);

            HInteractionSystem.startInteraction(
                targets,
                p.eventName || "特别事件",
                { context: recentLogs } // 透传上下文给 H_Data
            );
        },

        /**
         * 2. 修改女性角色 H 属性 与 核心目标|外貌|身份 (支持多变量批处理)
         * 兼容两种格式：
         * 1. 旧格式: { charId, key: "affection", value: 10 }
         * 2. 新格式: { charId, affection: 10, depravity: 5, mouth: 2 }
         */
        set_female: async (p) => {
            if (!store.hData || !store.hData[p.charId]) {
                console.warn(`[Action_LLM] 无法修改属性，角色 ${p.charId} 不存在 H 数据`);
                return;
            }
            const hState = store.hData[p.charId];

            // 🟢 [新增] 获取角色基础实例 (用于修改外貌/身份/目标)
            const character = store.party.find(c => c.id === p.charId);

            // 内部辅助函数：执行单项属性更新
            const updateSingle = (key, rawVal) => {
                // 默认值处理：确保有值 (针对旧格式可能的缺省)
                const val = rawVal !== undefined ? rawVal : 0;

                // 🟢 [新增] --- S. 基础档案属性 (外貌/身份/目标) ---
                // 拦截特殊 Key，直接更新 CharacterModel，不走 HState
                if (['appearance', 'identity', 'core_objective', 'coreObjective', 'coreobjective'].includes(key)) {
                    if (character) {
                        // 统一映射为 CharacterModel 内部使用的 'core_objective'
                        let prop = key;
                        if (key === 'coreObjective' || key === 'coreobjective') {
                            prop = 'core_objective';
                        }
                        
                        character[prop] = rawVal;
                        addLog(`📝 ${character.name} 的 ${prop} 已更新`);
                    } else {
                        console.warn(`[Action_LLM] 无法更新基础档案，未在队伍中找到 ${p.charId}`);
                    }
                    return; // 处理完毕，直接返回
                }

                // --- A. 基础属性 (好感/堕落) ---
                if (key === 'affection') {
                    hState.updateAffection(val);
                    addLog(`❤️ ${p.charId} 的好感度发生了变化`);
                } 
                else if (key === 'depravity') {
                    hState.updateDepravity(val);
                    addLog(`🖤 ${p.charId} 的堕落度发生了变化`);
                }
                
                // --- B. 部位开发 (检测 key 是否存在于 parts 对象中) ---
                else if (hState.parts && hState.parts[key] !== undefined) {
                    hState.updatePart(key, val);
                    console.log(`[Action_LLM] 部位开发: ${key} +${val}`);
                }

                // --- C. 特殊事件: 射精结算 ---
                else if (key === 'ejaculation') {
                    hState.recordEjaculation();
                    console.log(`[Action_LLM] 触发射精结算`);
                }

                // --- D. 兜底: 其他属性 (增量/赋值) ---
                else {
                    if (hState[key] !== undefined) {
                        // 如果是数字类型，进行增量计算
                        if (typeof hState[key] === 'number') {
                            hState[key] += val;
                        } 
                        // 布尔值或字符串，保持直接赋值
                        else {
                            hState[key] = val;
                        }
                    } else {
                        // 忽略 charId，其他未知属性报警告
                        if (key !== 'charId') {
                            console.warn(`[Action_LLM] 未知的 H 属性: ${key}`);
                        }
                    }
                }
            };

            // 逻辑分流：判断是"单key模式"还是"多变量模式"
            if (p.key) {
                // ✅ 兼容旧模式: { key: "...", value: ... }
                updateSingle(p.key, p.value);
            } else {
                // ✅ 新模式: 遍历所有参数 (排除 charId)
                // 例如: { charId: "...", affection: 5, mouth: 2 }
                Object.keys(p).forEach(k => {
                    if (k !== 'charId') {
                        updateSingle(k, p[k]);
                    }
                });
            }
        },
        

        /**
         * 3. 触发抉择系统 (支持异步等待)
         * 用法: if (await start_choice({...})) { ... }
         */
        start_choice: async (p) => {

            await ChatData.waitForAllMessages();
            await Action_LLM._confirmTransition("抉择事件");

            // 🟢 智能解包：如果参数里已经包含了 choice_scenes，就直接用里面的内容
            const realScript = p.choice_scenes ? p.choice_scenes : p;

            const mockNode = {
                name: "剧情事件",
                payload: {
                    choice_scenes: realScript 
                }
            };
            
            ChoiceSystem.startChoice(mockNode, true);

            return new Promise((resolve) => {
                Action_LLM._pendingChoiceResolve = resolve;
            });
        },

        /**
         * 4. 处理战斗
         * 必须添加在这里，Action_LLM.execute 里的 new AsyncFunction 才能“看到”它
         */
        start_combat: async (p) => {
            console.log("[Action_LLM] ⚔️ 收到战斗指令:", p);
            
            // 1. 等待对话气泡走完
            await ChatData.waitForAllMessages();
            
            // 呼出"遭遇战"警告弹窗 (缓冲区)
            // 这会暂停脚本执行，直到玩家点击"确认推进"
            // 玩家此时可以利用这个间隙进行存档
            await Action_LLM._confirmTransition("遭遇战");
            
            // 2. 准备战斗数据
            // 兼容性处理：ST_Manager 传来的 p 结构是 { enemies: [...] }
            // 引用自 ST_Manager.js 中的生成逻辑
            const enemyList = p.enemies || (Array.isArray(p) ? p : []);
            
            if (!enemyList || enemyList.length === 0) {
                console.warn("[Action_LLM] 战斗指令无效：缺少 enemies 数据");
                addLog("⚠️ 只有风吹过的声音... (敌人数据缺失)");
                return;
            }

            // 3. 写入全局 Store 激活 CombatOverlay
            // 引用自 store.js 和 App.js 的 CombatOverlay 激活逻辑
            store.combat.enemies = enemyList;
            store.combat.battleId = `battle_${Date.now()}`; // 生成唯一ID
            
            // 标记上下文：告诉 CombatManager 这是“脚本触发”的战斗
            // CombatManager 会据此决定是否显示“逃跑”按钮
            store.combat.context = { 
                source: 'script_encounter' 
            };    
            
            // 4. 关闭互斥界面 (防止 UI 重叠)
            store.isDialogueActive = false;
            store.choice.isActive = false;

            // 5. 启动！(触发 Vue 的 v-if 渲染 CombatOverlay)
            store.combat.isActive = true;
            addLog("⚔️ 遭遇敌袭！战斗开始！");
        },

        /**
         *5. 修改时间
         * params: { hour: 1, minute: 30 } (变化值)
         */
        set_time: async (p) => {
            // 调用 store.update_time(oldTime, y, m, d, h, min)
            // 这里传入增量
            store.update_time(
                store.gameTime, 
                p.year || 0, 
                p.month || 0, 
                p.day || 0, 
                p.hour || 0, 
                p.minute || 0
            );
        },

        /**
         * 6. 生成/注册 NPC 记忆
         * params: { id, name, lineup, combatEffectiveness, attitude, coreObjective... }
         */
        create_NPC: async (p) => {
            // 🟢 [新增] 兼容性处理：确保 coreObjective 字段存在
            // LLM 可能会输出 snake_case (core_objective)，我们需要将其映射为 registerNPC 需要的 camelCase
            p.coreObjective = p.coreObjective || p.core_objective || p.coreobjective;
            Npc_Memory.registerNPC(p);
        },

        /**
         * 7.1 插入 NPC 互动记忆
         * params: { id: "npc_id", memory: "内容" }
         */
        set_NPC_memory: async (p) => {
            if (p.id && p.memory) {
                // 🟢 [修复] 直接调用 Npc_Memory 的接口
                Npc_Memory.addInteraction(p.id, p.memory);
                console.log(`[Action_LLM] 已记录 NPC ${p.id} 的互动: ${p.memory}`);
            } else {
                console.warn("[Action_LLM] set_NPC_memory 参数缺失:", p);
            }
        },

        /**
         * 7.2 [重构] 修改 NPC 属性 (支持好感度增量更新)
         * params: { id, attitude_to_player: -50, lineup: "敌对", ... }
         */
        set_NPC_attribute: async (p) => {
            // 1. 尝试获取 NPC 当前数据
            const npc = Npc_Memory.getNPC(p.id);

            // 2. 特殊处理：态度/好感度 (实现增量更新)
            // 如果 LLM 传入了 attitude_to_player，我们将其视为"变化值"
            if (p.attitude_to_player !== undefined) {
                let finalValue = p.attitude_to_player;

                if (npc) {
                    // 如果 NPC 已存在，则：新值 = 旧值 + 变化值
                    const current = npc.attitude_to_player || 0;
                    finalValue = current + p.attitude_to_player;
                    console.log(`[Action_LLM] NPC ${p.id} 态度变更: ${current} + (${p.attitude_to_player}) => ${finalValue}`);
                }
                
                // 🟢 [新增] 目标兼容性处理：防止 LLM 在修改属性时用了不同的大小写
                if (p.core_objective || p.coreobjective) {
                    p.coreObjective = p.coreObjective || p.core_objective || p.coreobjective;
                }

                // 3. 映射字段：Npc_Memory.registerNPC 内部接收的参数名是 'attitude'
                // 我们将计算好的最终值传给它，让它去执行"赋值"
                p.attitude = finalValue;
            }

            // 4. 执行更新
            Npc_Memory.registerNPC(p);
        },

        /**
         * 7.3 [新增] 插入 队友 交互记忆
         * params: { id: "player_2", memory: "在战斗中被玩家治愈，心生感激" }
         * 注意：仅用于已入队的队友
         */
        set_party_memory: async (p) => {
            if (p.id && p.memory) {
                // 调用我们刚刚创建的 Party_Memory 模块
                Party_Memory.addRecord(p.id, p.memory);
            }
        },

        /**
         * 8. NPC 加入队伍 (重构版：身份重塑)
         * 逻辑：NPC ID (npc_xxx) -> 销毁 -> 新队友 ID (player_xxx)
         */
        NPC_joinParty: async (p) => {
            const npcId = p.npcId;
            let npcData = Npc_Memory.getNPC(npcId);

            // 1. 自动注册检测 (防呆逻辑)
            if (!npcData && p.name) {
                console.log(`[Action_LLM] 检测到陌生 NPC ${npcId} 入队，正在自动注册...`);
                Npc_Memory.registerNPC({ id: npcId, ...p });
                npcData = Npc_Memory.getNPC(npcId);
            }

            if (!npcData) {
                console.error(`[Action_LLM] 加入队伍失败：未找到 NPC ${npcId} 的档案`);
                return;
            }

            // 2. 态度门槛校验
            const currentAttitude = npcData.attitude_to_player || 0;
            if (currentAttitude <= 0) {
                addLog(` ${npcData.base_information.name} 拒绝了你的邀请，看来你们的关系还不够好...`);
                return;
            }

            const baseInfo = npcData.base_information;

            // =================================================
            // 🟢 [核心修改] 生成新的 Player ID (三位随机数)
            // =================================================
            let newPlayerId = "";
            let uniqueFound = false;
            
            // 防止随机数撞车 (虽然概率很小)
            while (!uniqueFound) {
                const randomNum = Math.floor(Math.random() * 900) + 100; // 100 - 999
                newPlayerId = `player_${randomNum}`;
                // 检查当前队伍里是否已经有这个 ID
                const exists = store.party.some(member => member.id === newPlayerId);
                if (!exists) uniqueFound = true;
            }

            console.log(`[Action_LLM] 身份重塑: ${npcId} => ${newPlayerId}`);

            // =================================================
            // 🟢 实例化角色 (使用新 ID)
            // =================================================
            const newChar = new CharacterModel();
            newChar.id = newPlayerId; // <--- 使用 player_xxx
            // 🟢 [新增] 智能备战逻辑
            // 如果队伍未满员，自动出战；否则在后方待命
            const maxDeployed = store.config.team?.maxDeployed || 4;
            const currentActiveCount = store.party.filter(m => m.isDeployed !== false).length;
            
            if (currentActiveCount < maxDeployed) {
                newChar.isDeployed = true;
            } else {
                newChar.isDeployed = false;
            }
            newChar.name = baseInfo.name;
            newChar.sex = baseInfo.sex || 'female';
            newChar.character = baseInfo.character || "无(依据对话历史判断)";
            newChar.appearance = baseInfo.appearance || "外貌平平";
            newChar.identity = baseInfo.identity || "平民"; // 继承身份

            // 🟢 [新增] 继承核心目标
            // 优先使用 NPC 档案中的目标，如果没有则默认跟随主角
            newChar.core_objective = baseInfo.core_objective || "跟随主角";

            newChar.isPlayer = true; 

            // --- 动态等级计算 ---
            const playerLevel = store.playerStats ? store.playerStats.level : 1;
            const intensity = npcData.combat_effectiveness || 'medium';
            let multiplier = 1.0;
            if (intensity === 'high') multiplier = 1.25;
            else if (intensity === 'low') multiplier = 0.75;
            newChar.level = Math.max(1, Math.floor(playerLevel * multiplier));

            // --- H 属性迁移 (绑定到新 ID) ---
            if (newChar.sex === 'female') {
                const attitude = npcData.attitude_to_player || 0;
                const startAffection = 150 * (attitude / 100);

                const hData = {
                    affection: startAffection,
                    depravity: 0,
                    dev_chest: 0, 
                    dev_bottom: 0,
                    libido: 0
                    // 注意：这里没有继承 NPC 的 H 记录，因为 NPC 档案里通常存的是简略信息
                    // 如果 NPC 之前发生过 H，可以通过 Memory 迁移来保留印象
                };

                const hStateInstance = new HState(newChar.id, hData); // <--- 使用 newPlayerId
                if (!store.hData) store.hData = {};
                store.hData[newChar.id] = hStateInstance;
                newChar.hStatus = hStateInstance;
            }

            // --- 战斗属性计算 ---
            newChar.baseStats.atk = 10 + (newChar.level * 2);
            newChar.baseStats.def = 5 + (newChar.level * 1);
            newChar.baseStats.speed = 10 + (intensity === 'high' ? 5 : 0);
            newChar.recalculateStats();
            newChar.hp = newChar.maxHp;
            newChar.mp = newChar.maxMp;

            // --- 物品处理 ---
            if (p.items && Array.isArray(p.items)) {
                p.items.forEach(item => {
                    newChar.addItemToInventory(item, 1);
                    newChar.equipItem(item); 
                });
            }

            // =================================================
            // 🟢 [关键] 记忆迁移与旧档销毁
            // =================================================
            
            // 1. 将 NPC 的互动历史导入到 队友记忆 (Party_Memory)
            // 注意：这里传入的是 newPlayerId，把旧 NPC 的数据归档到新 ID 下
            if (npcData) {
                // 假设 Party_Memory.importFromNpc(targetPlayerId, sourceNpcData)
                Party_Memory.importFromNpc(newPlayerId, npcData);
            }

            // 2. 正式入队
            store.party.push(newChar);

            // 3. 彻底删除 NPC 档案
            Npc_Memory.deleteNPC(npcId);

            // 🟢 [修改] 区分状态的提示信息
            if (newChar.isDeployed) {
                addLog(`✨ ${newChar.name} (Lv.${newChar.level}) 已加入队伍并准备出战！`);
            } else {
                addLog(`✨ ${newChar.name} (Lv.${newChar.level}) 已加入队伍 (队伍已满，在后方待命)`);
            }
        },
        /**
         * 9. 移动玩家位置
         * params: { name: "节点名称" }
         * 逻辑：支持脚本控制的强制移动，智能判断是否需要关闭对话框触发事件
         */
        move_to_place: async (p) => {
            const targetName = p.name;
            console.log(`[Action_LLM] 收到移动指令，目标: ${targetName}`);

            // 1. 流程控制：等待前面的气泡走完 + 玩家确认
            // 确保这是一个"有意识"的动作，支持 await 流程
            await ChatData.waitForAllMessages();
            await Action_LLM._confirmTransition("区域移动");

            // 2. 获取管理器实例 (window.mapManager 在 main.js 中初始化)
            const manager = window.mapManager;
            if (!manager || !manager.currentMap) {
                console.error("[Action_LLM] 地图管理器未就绪");
                return;
            }

            // 3. 查找节点
            const targetNode = manager.currentMap.nodes.find(n => n.name === targetName);

            // --- 检查 A: 节点是否存在 ---
            if (!targetNode) {
                addLog(`⚠️ 无法移动："${targetName}" 节点不存在`);
                return; 
            }

            // --- 检查 B: 节点是否已暴露 ---
            if (targetNode.state === NodeState.LOCKED) {
                addLog("🚫 该区域被迷雾笼罩，尚未探索到");
                return;
            }

            // 4. 判定移动逻辑
            // 能够重复触发逻辑的类型：商店、旅店、根节点(撤离点)
            const repeatableTypes = [NodeType.REST, NodeType.SHOP, NodeType.ROOT];
            
            const isRepeatable = repeatableTypes.includes(targetNode.type);
            // 第一次去 (REVEALED) 或者是 可重复节点
            const shouldTriggerEvent = (targetNode.state === NodeState.REVEALED) || isRepeatable;

            if (shouldTriggerEvent) {
                // --- 情况 A: 触发逻辑 (初次探索 OR 功能设施) ---
                console.log("[Action_LLM] 移动并触发事件逻辑");
                
                // 必须关闭对话 UI，否则商店/旅店/抉择界面会被对话框遮挡
                store.isDialogueActive = false;
                
                // 调用 Navigation 的 moveToNode，它会自动处理事件触发 (_triggerNodeEvents)
                manager.moveToNode(targetNode.id);

            } else {
                // --- 情况 B: 仅改变位置 (已探索过的普通节点) ---
                console.log("[Action_LLM] 仅执行位置变更");
                
                // 移动过去 (moveToNode 会处理迷雾更新和时间流逝)
                manager.moveToNode(targetNode.id);
                
                // 显式提示
                addLog("📍 位置已改变");
            }
        },
    },

    /**
     * 🟢 [新增] 内部辅助：发起模态确认流程
     * 需要您在 UI 层 (App.vue 或 store) 监听 store.transition 并渲染弹窗
     */
    _confirmTransition(type) {
        return new Promise(resolve => {
            // 设置全局状态，呼出 UI 弹窗
            store.transition = {
                isActive: true,
                title: `即将进入${type}`,
                message: "前方将发生重大事件，建议立即存档。",
                showSave: true,   // 允许存档
                canCancel: false, // 禁止取消 (只能确认)
                
                // 玩家点击“确认”后的回调
                onConfirm: () => {
                    store.transition.isActive = false;
                    resolve(); // 脚本继续执行
                }
            };
            console.log(`[Action_LLM] 等待玩家确认进入: ${type}`);
        });
    },

};

// ==========================================
// 🔴 关键挂钩: 拦截 ChoiceSystem 的决策回调
// ==========================================
// 必须确保 ChoiceSystem 已加载。此逻辑将 UI 的点击事件连接回 LLM 的 await 处。

// 1. 备份原始方法
const _originalHandleDecision = ChoiceSystem.handleDecision;

// 2. 重写方法以注入唤醒逻辑
ChoiceSystem.handleDecision = function(index) {
    // A. 执行原始逻辑 (获取 signal 返回值)
    // 这里的 signalResult 即为我们在 ChoiceSystem.js 中修改返回的 true/false
    const signalResult = _originalHandleDecision.call(ChoiceSystem, index);

    // B. 检查是否有挂起的 LLM 脚本
    if (Action_LLM._pendingChoiceResolve) {
        console.log(`[Action_LLM] 捕获抉择信号: ${signalResult}，唤醒脚本`);
        
        // C. 唤醒脚本并传入信号值
        // 这会让 await start_choice(...) 结束并返回 signalResult
        Action_LLM._pendingChoiceResolve(signalResult);
        
        // D. 清理钩子
        Action_LLM._pendingChoiceResolve = null;
    }

    return signalResult;
};

