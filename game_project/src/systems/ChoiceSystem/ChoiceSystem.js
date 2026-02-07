/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
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

// src/systems/ChoiceSystem.js
import { store, addLog } from '../../ui/modules/store.js';
import { ChatData } from '../../ui/modules/ChatData.js'; // 🟢 确保引入了 ChatData
import { GameDatabase } from '../../config/GameDatabase.js';
import { Chat_Memory } from '../../LLM/memory/Chat_Memory.js';

// 模块级变量，用于暂存当前正在进行的剧本数据 (不需要由 Vue 响应式追踪)
let currentScript = null;
let currentStageId = null;

export class ChoiceSystem {

    // 静态变量：用于记录上一次点击的时间戳
    static _lastClickTime = 0;

    /**
     * 启动抉择 (入口)
     * 职责：验证数据合法性，锁定 stage1.0 入口，并唤醒 UI 状态
     * @param {Object} node - 地图节点对象 (包含 payload 和 name)
     */
    static async startChoice(node, skipWait = false) {
        // 1. 数据深度校验：确保具备剧情剧本

        if (!skipWait) {
            await ChatData.waitForAllMessages();
        }

        if (!node.payload || !node.payload.choice_scenes) {
            console.error("[ChoiceSystem] 启动失败：节点缺少有效的 choice_scenes 数据");
            addLog("你凝视着这片区域，但什么也没有发生..."); //
            return;
        }

        console.log(`[ChoiceSystem] 🎬 开启事件: ${node.name}`);

        // 2. 初始化脚本上下文
        currentScript = node.payload.choice_scenes;
        
        // 3. 强制锁定规范入口 ID
        // 依据新规范，所有抉择事件必须从 "stage1.0" 开始
        const entryId = "stage1.0";
        
        if (!currentScript[entryId]) {
            console.error(`[ChoiceSystem] 格式错误：未能在剧本中找到规范入口 "${entryId}"`);
            addLog("时空似乎在这里发生了扭曲（剧本入口缺失，请使用回溯重新生成）"); //
            return;
        }

        currentStageId = entryId;

        // 4. 唤醒 UI 状态机 (写入全局响应式 Store)
        // View 层 (ChoiceOverlay) 将通过监听 isActive 自动弹出
        store.choice.title = node.name || "未知事件";
        store.choice.isActive = true;      // 激活 UI 遮罩层
        store.choice.isProcessing = false; // 重置交互锁
        store.choice.currentLines = [];    // 清空旧文本
        store.choice.choices = [];         // 清空旧选项

        // 5. 触发阶段渲染逻辑
        this.renderStage(currentStageId);
    }

    /**
     * 🟢 新增：启动支线任务链
     * 逻辑与 startChoice 完全一致，复用同一套 UI 和解析逻辑
     * @param {Object} node - 地图节点
     */
    static startQuestChain(node) {
        console.log("[ChoiceSystem] 📜 触发支线剧情:", node.name);
        // 直接复用 startChoice，因为数据结构我们约定为一致 (choice_scenes)
        this.startChoice(node);
    }

    /**
     * 渲染指定阶段到 Store
     * 作用：将 JSON 数据转化为 UI 可感知的响应式状态
     * @param {string} stageId - 阶段标识符 (如 "stage1.0")
     */
    static renderStage(stageId) {
        const stageData = currentScript[stageId];
        if (!stageData) {
            console.error(`[ChoiceSystem] 渲染失败：找不到阶段 ${stageId}`);
            this.close();
            return;
        }

        // 🟢 [核心修复]：强制同步内部逻辑指针
        // 确保 UI 渲染哪个阶段，逻辑判断就使用哪个阶段的数据
        currentStageId = stageId;

        // 1. 同步剧情文本：UI 组件将监听此数组并逐行显示
        store.choice.currentLines = stageData.lines || ["..."];
        
        // 2. 转换选项格式：确保 UI 渲染出的按钮具备正确的索引回调
        if (stageData.choices && Array.isArray(stageData.choices)) {
            store.choice.choices = stageData.choices.map((c, index) => ({
                label: c.label || "继续", //
                index: index 
            }));
        } else {
            // 如果没有选项，提供一个默认的“结束”按钮或清空
            store.choice.choices = [];
        }

        // 3. 解锁交互：允许玩家在文本渲染完成后进行点击
        // 使用 setTimeout 将解锁推迟到下一帧（或 200ms 后）
        // 这能确保当前的点击事件冒泡彻底结束后，锁才会被打开
        setTimeout(() => {
            store.choice.isProcessing = false;
        }, 300);

        console.log(`[ChoiceSystem] 📖 当前阶段: ${stageId}`);
    }

    /**
     * 处理玩家点击 (由 UI 组件回调)
     * @param {number} choiceIndex - 玩家选择的选项索引
     * @returns {boolean} 返回信号 (Signal)。默认为 false，如果 actions.signal 为 true 则返回 true。
     */
    static handleDecision(choiceIndex) {

        // 🟢 [修复 1] 物理时间锁 (防抖动)
        // 如果距离上一次点击小于 500毫秒，直接忽略
        // 这能 100% 拦截鼠标连点、微动开关弹跳、事件冒泡导致的重复调用
        const now = Date.now();
        if (now - this._lastClickTime < 500) {
            console.warn(`[ChoiceSystem] 拦截到快速连点 (间隔: ${now - this._lastClickTime}ms)`);
            return false;
        }
        this._lastClickTime = now;

        // 🟢 [修复 2] 状态锁 (保持原有的逻辑作为第二道防线)
        if (store.choice.isProcessing) {
            console.warn("[ChoiceSystem] 系统正在处理中，点击无效");
            return false;
        }
        
        const stageData = currentScript[currentStageId];
        if (!stageData || !stageData.choices) return false;

        const selectedOption = stageData.choices[choiceIndex];
        if (!selectedOption) return false;

        store.choice.isProcessing = true; 
        
        //  日志构建与写入 (Action 之前) ==========================
        try {
            // A. 获取基础信息
            const currentTime = store.worldState ? store.worldState.timeDisplay : "未知时间";
            const currentLocation = store.worldState ? store.worldState.mapName : "未知地点";
            const targetChannel = ChatData.activeChannelId || 'main'; // 自动定位当前频道

            // B. 构建三段式内容
            // 1. [前情]：把当前显示的几行剧情拼起来
            const contextText = (stageData.lines || []).join(' ');
            
            // 2. [抉择]：玩家点的按钮文字
            const choiceText = selectedOption.label || "继续";
            
            // 3. [结果]：预判反馈 (Action里是否有 message 或者是 战斗触发)
            let resultText = "";
            if (selectedOption.actions) {
                if (selectedOption.actions.message) {
                    resultText = selectedOption.actions.message;
                } else if (selectedOption.actions.trigger === 'start_combat') {
                    resultText = "触发战斗！";
                }
            }

            // C. 组装最终文本
            let logText = `> [${currentTime} @ ${currentLocation}] [情景] ${contextText}\n> [抉择] ${choiceText}`;
            if (resultText) {
                logText += `\n> [结果] ${resultText}`;
            }

            // D. 写入系统
            console.log("[ChoiceSystem] 📝 记录抉择日志:", logText);
            
            // // 写入 UI (显示给玩家看)
            if (ChatData && typeof ChatData.appendSystemToLatest === 'function') {
                ChatData.appendSystemToLatest(logText); // <--- 改为 logText
            } else {
                // 兜底：如果新方法不存在（极低概率），再回退到旧方法
                ChatData.appendSystemLog(logText);      // <--- 改为 logText
            }
            
            // 写入 记忆 (给 LLM 看)
            Chat_Memory.appendSystemLog(targetChannel, logText);

        } catch (err) {
            console.warn("[ChoiceSystem] 日志写入失败:", err);
        }
        // ==============================================================

        const nextStage = selectedOption.next;
        let signalResult = false;
        if (selectedOption.actions && selectedOption.actions.signal === true) {
            signalResult = true;
        }

        // 1. 执行动作
        if (selectedOption.actions) {
            const result = this.executeAction(selectedOption.actions, nextStage);
            
            // 🟢 [新增] 如果动作执行返回 'ABORT'，说明物品检定失败，直接终止后续跳转
            if (result === 'ABORT') {
                console.log("[ChoiceSystem] ⛔ 动作执行受阻，终止剧情跳转");
                return signalResult;
            }
        }

        // 2. 核心修复：检测是否进入了战斗模式
        // 如果 executeAction 已经激活了战斗，我们必须在此“冻结”抉择系统
        // 不要去执行 renderStage 或 close
        if (store.combat && store.combat.isActive) {
            console.log("[ChoiceSystem] 检测到战斗已激活，挂起抉择流程，等待战后回调");
            return signalResult; 
        }

        // 3. 处理显式退出指令 (next: "exit")
        // 定义：这是“拒绝/驱逐”信号，不仅关闭窗口，还要把玩家踢回上一步
        if (nextStage === 'exit') {
            console.log("[ChoiceSystem] 🔚 收到退出指令(Exit)，触发回滚并关闭");
            
            // 🟢 [新增] 调用导航模块的撤退逻辑
            // 这会将玩家移回上一个节点，并隐藏刚刚揭示的迷雾
            if (window.mapManager && window.mapManager.navigation) {
                window.mapManager.navigation.retreat();
            }

            // 🟢 必须关闭 UI
            this.close();
            return signalResult;
        }

        // 4. 只有非战斗情况下，才处理跳转或关闭
        if (nextStage && currentScript[nextStage]) {
            currentStageId = nextStage;
            this.renderStage(nextStage);
        } else {
            this.close();
        }

        return signalResult;
    }

    /**
     * 关闭系统并清理内存
     * 作用：退出事件状态，让玩家回到地图探索场景
     */
    static close() {
        // 1. 重置全局 UI 状态，触发 App.js 隐藏 Overlay
        store.choice.isActive = false;
        store.choice.currentLines = [];
        store.choice.choices = [];
        store.choice.isProcessing = false;

        // 2. 释放内部变量，等待下一次节点触发
        currentScript = null;
        currentStageId = null;

        console.log("[ChoiceSystem] 🏁 事件已安全关闭");
    }

/**
     * 执行抉择后果 (Action Executor) - 动态化适配版 v2.0
     * 核心职能：解析 actions JSON 对象，执行数值变更、物品增删、战斗触发
     * @param {Object} actions - 动作指令对象 
     */
    static executeAction(actions, nextStageId) {
        if (!actions) return;

        // 获取玩家实例
        const player = (store.party && store.party.length > 0) ? store.party[0] : store.playerState;

        if (!player) {
            console.warn("[ChoiceSystem] 无法执行动作：玩家实例不存在");
            return;
        }

        console.log("[ChoiceSystem] 执行动作指令:", actions);

        // ==========================================
        // 1. 基础数值属性 (HP/MP/Gold/Exp)
        // ==========================================
        
        // HP 处理
        if (actions.hp !== undefined) {
            if (actions.hp > 0) player.heal(actions.hp);
            else if (actions.hp < 0) player.takeDamage(Math.abs(actions.hp));
        }

        // MP 处理
        if (actions.mp !== undefined) {
            if (actions.mp > 0) player.restoreMp(actions.mp);
            else if (actions.mp < 0) player.consumeMp(Math.abs(actions.mp));
        }

        // 经验值处理
        if (actions.exp !== undefined && actions.exp > 0) {
            player.gainExp(actions.exp); 
        }

        // 🟢 [重构] 金币处理 (支持检定与阻断)
        // 兼容 actions.gold (通用) 和 actions.add_gold (旧标准)
        const goldVal = actions.gold !== undefined ? actions.gold : actions.add_gold;
        
        if (goldVal !== undefined) {
            // Case A: 获得金币 (正数)
            if (goldVal > 0) {
                player.gold += goldVal;
                addLog(`获得金币: ${goldVal}`);
            } 
            // Case B: 消耗金币 (负数) -> 触发检定
            else if (goldVal < 0) {
                const cost = Math.abs(goldVal);
                
                // 1. 调用 PlayerState 新增的 consumeGold 方法
                const success = player.consumeGold(cost);

                if (success) {
                    // 支付成功
                    addLog(`失去金币: ${cost}`);
                } else {
                    // 🔴 支付失败：触发阻断逻辑
                    console.warn(`[ChoiceSystem] 金币检定未通过: 需要 ${cost}, 拥有 ${player.gold}`);
                    addLog(`⛔ 交易失败：金币不足 (需要 ${cost})`);

                    // 2. 强制触发回滚 (Retreat)
                    // 与物品检定失败、next="exit" 保持一致的行为
                    if (window.mapManager && window.mapManager.navigation) {
                        window.mapManager.navigation.retreat();
                    }
                    
                    // 3. 关闭窗口并中止后续跳转
                    this.close();
                    return 'ABORT'; 
                }
            }
        }

        // ==========================================
        // 2. 物品管理 (支持批量与单项兼容)
        // ==========================================
        // 🟢 兼容性修复：同时支持 items 和 add_items
        const rawItems = actions.items || actions.add_items;

        if (rawItems) {
            // 🟢 归一化：将各种奇葩格式统一转为数组 [entry1, entry2...]
            
            let itemList = [];
            
            // 判断是否为 [item, count] 形式的单项数组 (避免被误拆)
            const isSingleEntryArray = Array.isArray(rawItems) && 
                                       rawItems.length === 2 && 
                                       typeof rawItems[1] === 'number';

            if (!Array.isArray(rawItems) || (rawItems.length > 0 && !Array.isArray(rawItems[0]) && isSingleEntryArray)) {
                itemList = [rawItems];
            } else {
                itemList = rawItems;
            }

            // 遍历执行
            itemList.forEach(entry => {
                let itemOrId;
                let count = 1; // 默认为 1

                // 兼容对象解构与数组解构
                if (Array.isArray(entry)) {
                    [itemOrId, count] = entry;
                } else {
                    itemOrId = entry;
                    if (itemOrId.count) count = itemOrId.count;
                }

                // 安全校验
                if (count === undefined || count === null) count = 1;

                // 🟢 [修复] 解析物品名称 (智能混合策略 v2.0)
                let finalName = "未知物品";

                // 1. 提取 ID 和 Name 候选
                let targetId = null;
                let explicitName = null;

                if (typeof itemOrId === 'object') {
                    targetId = itemOrId.id;
                    explicitName = itemOrId.name;
                } else {
                    targetId = itemOrId;
                }

                // 2. 决策树
                if (explicitName) {
                    // 情况 A: 这是一个自带名字的动态物品 (如 LLM 捏造的神器)
                    finalName = explicitName;
                } else if (targetId) {
                    // 情况 B: 只有 ID (无论是字符串还是 {id: '...'} 对象) -> 查数据库
                    const staticItem = GameDatabase.Items[targetId] || GameDatabase.Equipment[targetId];
                    if (staticItem) {
                        finalName = staticItem.name;
                    } else {
                        // 查不到数据库，保底显示 ID
                        finalName = targetId;
                    }
                } else {
                    // 情况 C: 既没名字也没 ID，纯粹的坏数据
                    finalName = "神秘物品";
                }

                if (count > 0) {
                    player.addItemToInventory(itemOrId, count);
                    // 使用解析后的中文名称
                    addLog(`获得物品: ${finalName} x${count}`);

                } else if (count < 0) {
                    const removeCount = Math.abs(count);
                    const success = player.removeItemFromInventory(itemOrId, removeCount);
                    if (success) {
                        addLog(`失去物品: ${finalName} x${removeCount}`);
                    }
                }
            });
        }

        // ==========================================
        // 2.5 物品移除 (新指令: remove)
        // ==========================================
        if (actions.remove) {
            // 归一化为数组
            const itemsToRemove = Array.isArray(actions.remove) ? actions.remove : [actions.remove];

            for (const targetName of itemsToRemove) {
                
                // 🔴 关键修正：必须调用 removeQuestItemByName (按名删除)
                // 绝对不能调用 player.removeItemFromInventory (那是按ID删除)
                const success = player.removeQuestItemByName(targetName);

                if (success) {
                    // A. 成功：记录日志
                    addLog(`失去物品: ${targetName} x1`);
                } else {
                    // B. 失败：触发阻断逻辑
                    console.warn(`[ChoiceSystem] ⛔ 物品检定不通过: 缺少 ${targetName}`);
                    addLog(`⛔ 禁止通行：缺少关键物品【${targetName}】`);
                    
                    // 触发物理回滚
                    if (window.mapManager && window.mapManager.navigation) {
                        window.mapManager.navigation.retreat();
                    }
                    
                    // 关闭窗口
                    this.close();
                    
                    // 🔴 核心：返回阻断信号 'ABORT'
                    return 'ABORT'; 
                }
            }
        }

        // ==========================================
        // 🟢 [新增] 2.6 物品检定 (新指令: check)
        // 逻辑：只检查是否存在，不消耗物品。如果不存在则阻断。
        // ==========================================
        if (actions.check) {
            const itemsToCheck = Array.isArray(actions.check) ? actions.check : [actions.check];
            
            // 🔍 [调试探针] 准备开始检定
            console.log("[Debug] 开始物品检定:", itemsToCheck);

            // ⚠️ 必须使用 for...of 循环，绝对不能用 forEach
            for (const targetName of itemsToCheck) {
                const hasItem = player.hasItemByName(targetName);
                
                if (!hasItem) {
                    // ⛔ 阻断触发点
                    console.warn(`[ChoiceSystem] ⛔ 检定失败: 背包内缺少 [${targetName}]`);
                    
                    // UI 反馈
                    addLog(`⛔ 无法通行：缺少【${targetName}】`);

                    // 1. 物理回滚
                    if (window.mapManager && window.mapManager.navigation) {
                        window.mapManager.navigation.retreat();
                    }
                    
                    // 2. 关闭窗口
                    this.close();
                    
                    // 3. 🔴 核心阻断：返回 ABORT
                    // 这一步如果不执行，下面的 message 就会打印，next 就会跳转
                    return 'ABORT'; 
                } else {
                    // console.log(`[ChoiceSystem] ✅ 检定通过: [${targetName}]`);
                }
            }
        }

        // ==========================================
        // 3. 战斗触发 (支持动态敌人配置)
        // ==========================================
        if (actions.trigger === 'start_combat') {
            // 🟢 动态适配：支持 actions.enemies (直接定义的对象列表) 或 actions.enemyId (ID 或 ID列表)
            const source = actions.enemies || actions.enemyId;
            const enemyList = Array.isArray(source) ? source : [source];
            
            const logName = (typeof enemyList[0] === 'object') ? (enemyList[0].name + "等") : enemyList[0];
            console.log(`[ChoiceSystem] ⚔️ 剧情触发战斗! Target: ${logName}`);
            addLog("⚔️ 遭遇强敌，战斗一触即发！");
            

            if (store.combat) {
                // 1. 暂时隐藏抉择窗口
                store.choice.isActive = false; 

                // 2. 配置敌人 (CombatManager 将识别这些是 ID 还是 动态对象)
                store.combat.enemies = enemyList;
                store.combat.battleId = `story_battle_${Date.now()}`;
                
                // 3. 上下文标记
                store.combat.context = {
                    source: 'choice_event',
                    returnStageId: nextStageId || "__EVENT_COMPLETE__" // 记录下个阶段以便战后恢复
                };

                store.combat.isActive = true;
            }
        }

        // ==========================================
        // 4. 支线激活
        // ==========================================
        // 🟢 [兼容性修复]：支持显式 trigger，或通过特征检测（有 questName 且有 themeId）自动识别为支线
        const isSidelineAction = actions.trigger === 'activate_sideline' || 
                                 (actions.questName && actions.themeId);

        if (isSidelineAction) {
            console.log("[ChoiceSystem] 🗺️ 玩家接受支线，开始生成子地图(兼容模式)...");
            
            const mgr = window.mapManager;
            if (mgr && typeof mgr.mountSubMap === 'function') {
                const subMapConfig = {
                    chapter: mgr.currentMap.mapId, 
                    questName: actions.questName || "神秘区域",
                    themeId: actions.themeId || "THEME_DUNGEON",
                    layerIndex: actions.layerIndex !== undefined ? actions.layerIndex : 1, 
                    edge_position: actions.edge_position || 'RIGHT',
                    
                    // 🟢 关键修复：必须加上这一行！
                    // 否则 distribution, depthRange 等参数会被丢弃，导致生成器回退到默认模板
                    ...actions 
                };

                mgr.mountSubMap(subMapConfig);
                               
                addLog(`📜 接取任务: ${subMapConfig.questName}`);

            } else {
                console.error("❌ 无法生成支线：MapManager 未初始化");
            }
        }
        
        // ==========================================
        // 🟢 [新增] 5. 章节跳转 (Next Chapter)
        // ==========================================
        if (actions.trigger === 'next_chapter') {
            console.log("[ChoiceSystem] 🌀 剧情触发新章节生成...", actions);
            
            const mgr = window.mapManager;
            // 确保导航模块存在，且我们将要在 MapNavigation 中实现 generateSpecificNextChapter 方法
            if (mgr && mgr.navigation) {
                
                // 调用导航模块的新接口 (我们稍后会在 MapNavigation.js 中实现它)
                // 直接将 actions 传过去，因为里面包含了 themeId, mapName, distribution 等配置
                mgr.navigation.generateSpecificNextChapter(actions);
                
                // 必须关闭当前抉择窗口，否则会挡住新地图的 Loading
                this.close();
                
                return; //以此结束，不再执行后续无关逻辑
            } else {
                console.error("❌ 无法跳转章节：MapManager.navigation 未就绪");
                addLog("系统错误：通往下一章的道路崩塌了...");
            }
        }

        // ==========================================
        // 5. 系统日志
        // ==========================================
        if (actions.message) {
            addLog(actions.message);
        }

    }

    

}

ChoiceSystem._lineTimers = [];

window.ChoiceSystem = ChoiceSystem;