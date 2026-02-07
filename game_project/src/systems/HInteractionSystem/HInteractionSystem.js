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

// src/systems/HInteractionSystem/HInteractionSystem.js
import { reactive } from '../../../lib/vue.esm-browser.js';
import { store, addLog as globalAddLog } from '../../ui/modules/store.js';
import { H_Data } from '../../ui/modules/H_Data.js';
import { Call_H_Interaction } from '../../LLM/calls/Call_H_Interaction.js';
import { ChatData } from '../../ui/modules/ChatData.js';
import { Chat_Memory } from '../../LLM/memory/Chat_Memory.js';

//  属性限制配置表 (方便后续调整平衡性)
// stepMax: 单条指令最大增幅 (防止 LLM 抽风一次加100)
// sessionMax: 单次互动累计最大增幅 (防止刷属性)
const ATTRIBUTE_LIMITS = [
    { keys: ['affection', 'depravity'], stepMax: 5, sessionMax: 50 },
    { keys: ['parts'], stepMax: 5, sessionMax: 30 } // 针对 parts 下的每一个部位独立计算
];

/**
 * ==========================================
 * H 互动系统核心 (HInteractionSystem)
 * ==========================================
 * 职责：
 * 1. 状态机：管理互动流程 (初始化 -> 等待输入 -> 处理脚本 -> 等待抉择 -> 结算)。
 * 2. 脚本播放器：解析 LLM 返回的分段式 Interaction 脚本树。
 * 3. 执行器：执行脚本中的 Action 指令，修改短期与长期属性。
 */
export const HInteractionSystem = reactive({
    
    // ==========================================
    // 1. 系统状态 (State)
    // ==========================================
    
    isActive: false,       // 界面总开关
    targetCharIds: [],     // [变更] 改为数组，存储所有互动对象 ID
    activeCharId: null,    // [新增] 当前 UI 聚焦显示的 ID (用于多P切换查看)
    settlementResult: null, // 存储 { summary, evaluation: { score, comment, rewards } }
    /**
     * 当前运行状态
     * - 'IDLE': 空闲/关闭
     * - 'INITIALIZING': 正在初始化 (等待 Opening)
     * - 'WAITING_FOR_USER': 脚本播放完毕，等待玩家输入文本动作
     * - 'PROCESSING': 正在请求 LLM 或处理数据
     * - 'WAITING_FOR_CHOICE': 脚本暂停，等待玩家点击选项按钮
     * - 'SETTLEMENT': 正在结算
     */
    status: 'IDLE',

    // --- 资源控制 ---
    actionCount: 9999,     // 剩余行动力 (归零时强制结算)

    // --- 评分统计 ---
    totalScore: 0,         // 累积得分
    scoredTurnCount: 0,    // 获得评分的回合数

    // --- 短期变量 (互动时的临时状态) ---
    statsMap: {},          // [变更] 改为 Map 结构: { charId: { stamina: 100, ... } }

    // --- 脚本播放器数据 ---
    currentScript: null,   // 存储 LLM 返回的完整 interaction 对象
    currentChoices: [],    // 当前呈现在 UI 上的选项列表

    // ==========================================
    // 2. 生命周期管理 (Lifecycle)
    // ==========================================

    /**
     * [Phase 1] 启动互动
     * @param {string|Array} charIds - 女性角色 ID 或 ID数组
     * @param {string} eventName - 事件名称
     * @param {Object} options - [新增] 额外配置 (如 context, locationOverride 等)
     */
    startInteraction(charIds, eventName, options = {}) {
        // [变更] 支持传入数组或单字符串
        const ids = Array.isArray(charIds) ? charIds : [charIds];
        console.log(`[H-System] 启动互动: ${ids.join(', ')}`);
        
        // 1. 校验数据 (确保所有 ID 都有数据)
        const validIds = ids.filter(id => store.hData && store.hData[id]);
        if (validIds.length === 0) {
            globalAddLog(`❌ 无法互动：找不到对应角色的 H 数据`);
            return;
        }

        // --- 🟢 新增：自动获取环境信息 (时间 + 地点) ---
        // A. 获取时间 (直接读取 store 的格式化时间)
        const timeNow = store.worldState.timeDisplay || "未知时间";

        // B. 获取地点 (格式: 大地图名 - 节点名)
        let locationStr = "未知领域";
        
        if (window.mapManager && window.mapManager.currentMap) {
            const curMap = window.mapManager.currentMap;
            const mapName = curMap.name || "未知区域";
            
            // 在 nodes 数组中查找当前节点
            let nodeName = "未知节点";
            if (Array.isArray(curMap.nodes)) {
                const currentNode = curMap.nodes.find(n => n.id === curMap.currentNodeId);
                if (currentNode) {
                    nodeName = currentNode.name;
                }
            }
            locationStr = `${mapName} - ${nodeName}`;
        }

        // 2. 重置系统状态
        this.targetCharIds = validIds;
        this.activeCharId = validIds[0]; // [新增] 默认聚焦第一个人

        // 🟢 将自动获取的信息存入上下文，供 Call 使用
        this.context = {
            time: timeNow,
            location: locationStr,
            eventName: eventName || "遭遇"
        };
        this.isActive = true;
        this.status = 'INITIALIZING';
        this.actionCount = 9999; // 暂时硬编码、
        this.currentScript = null;
        this.currentChoices = [];
        this.totalScore = 0;
        this.scoredTurnCount = 0;   
        // 3. 重置短期属性 (为每个人初始化独立状态)
        this.statsMap = {};
        this.sessionAccumulator = {}; // 🟢 [新增] 重置会话累积量

        validIds.forEach(id => {
            this.statsMap[id] = {
                stamina: 100, sanity: 100, pleasure: 0, excitement: 0, shame: 100
            };
            // 🟢 [新增] 初始化该角色的累积记录
            this.sessionAccumulator[id] = {
                affection: 0, 
                depravity: 0, 
                parts: {} // 部位开发独立记录
            };
        });

        // 4. 开启数据记录会话 (仅记录第一个 ID 作为 Session 索引)
        // 🟢 [修改] 将 options 中的 context 透传给 H_Data
        H_Data.startSession(validIds[0], eventName, options.context);

        // 🟢 [新增] 发起初始化请求，向 LLM 索要 Opening
        Call_H_Interaction.requestInteraction(null, 'INIT');
    },

    /**
     * [Phase 1.5] 处理开场白 (由 Action_H_Interaction 调用)
     * @param {Object} openingData - LLM 返回的 opening 对象 { init: {...}, content: [...] }
     */
    handleOpening(openingData) {
        if (!this.isActive) return;

        // 1. 应用初始属性 (如果 LLM 指定了)
        if (openingData.init) {
            this.applyAction(openingData.init);
        }

        // 2. 写入开场剧情
        if (Array.isArray(openingData.content)) {
            openingData.content.forEach(msg => {
                // [变更] 传入 msg.name
                H_Data.addMessage(msg.role, msg.text, msg.name);
            });
        }

        // 3. 进入玩家回合
        this.status = 'WAITING_FOR_USER';
    },

    /**
     * [Phase 2] 加载并播放互动脚本 (由 Action_H_Interaction 调用)
     * @param {Object} interactionData - LLM 返回的完整脚本树
     */
    loadScript(interactionData) {
        if (!this.isActive) return;

        this.currentScript = interactionData;
        this.status = 'PROCESSING';

        // 这里的 key 约定为 "stage1.0" 作为入口
        // 如果 LLM 返回结构不同，Action 层需要适配，保证这里拿到的是树的根
        const startKey = Object.keys(interactionData)[0] || "stage1.0";
        
        this._processStage(startKey);
    },

    /**
     * [Phase 4] 结束互动
     */
    endInteraction() {
        console.log("[H-System] 互动结束");

        // ============================================================
        // 🟢 [新增] 结算信息广播 (UI + Memory)
        // ============================================================
        
        // 1. 提取 Summary 文本
        // 如果 settlementResult 存在且有 summary，则使用；否则使用默认兜底文本
        const summaryText = (this.settlementResult && this.settlementResult.summary)
            ? `【H结算】${this.settlementResult.summary}`
            : "【系统】互动结束了。";

        // 2. 确定目标频道
        // 优先获取地图系统当前绑定的频道 (确保主线/支线归属正确)
        // 如果获取不到，则回退到 ChatData 当前激活的频道
        let targetChannelId = ChatData.activeChannelId || 'main';
        
        if (window.mapManager && window.mapManager.registry && window.mapManager.registry.currentChannelId) {
            targetChannelId = window.mapManager.registry.currentChannelId;
        }

        // 3. 执行注入
        // A. UI 层：追加到聊天框底部
        // 🟢 使用新接口 appendSystemToLatest，确保格式为数组且不弹新气泡
        if (ChatData && typeof ChatData.appendSystemToLatest === 'function') {
            // 注意：appendSystemToLatest 默认操作当前激活频道
            // 在 H 结束时，玩家肯定正看着当前频道，所以通常是安全的
            ChatData.appendSystemToLatest(summaryText);
        } else {
            // 兜底兼容
            ChatData.appendSystemLog(summaryText, targetChannelId);
        }
        
        // B. 记忆层：追加到 LLM 长期记忆 (防止失忆)
        Chat_Memory.appendSystemLog(targetChannelId, summaryText);

        // ============================================================

        // 归档本次会话数据
        H_Data.archiveCurrentSession();
        
        this.isActive = false;
        this.status = 'IDLE';
        this.settlementResult = null; // 清理结算数据
        this.targetCharIds = [];
        this.activeCharId = null;
        this.statsMap = {};
        this.currentScript = null;
    },

    // ==========================================
    // 3. 脚本播放核心 (Script Player)
    // ==========================================

    /**
     * 处理脚本的一个阶段 (Stage)
     * 逻辑顺序: 执行 Action -> 渲染 Content -> 处理 Choices/Next
     * @param {string} stageKey - 阶段 ID (如 "stage2.0")
     */
    _processStage(stageKey) {
        if (!this.currentScript || !this.currentScript[stageKey]) {
            console.warn(`[H-System] 找不到阶段: ${stageKey}, 脚本意外终止`);
            // 异常保护：如果没有下一阶段，也强制让玩家输入，防止卡死
            this.status = 'WAITING_FOR_USER';
            return;
        }

        const stage = this.currentScript[stageKey];

        // --- Step 1: 执行数值变更 (Action 优先) ---
        if (stage.action) {
            this.applyAction(stage.action);
        }

        // --- Step 2: 渲染剧情内容 ---
        if (Array.isArray(stage.content)) {
            stage.content.forEach(msg => {
                // [变更] 传入 msg.name
                H_Data.addMessage(msg.role, msg.text, msg.name);
            });
        }

        // --- Step 3: 流程控制 (分支 vs 结束) ---
        // 🟢 核心逻辑在这里
        // 如果 choices 存在且有内容，说明是【分支点】，系统暂停等待点击
        if (stage.choices && Array.isArray(stage.choices) && stage.choices.length > 0) {
            // Case A: 有分支 -> 等待玩家选择
            this.currentChoices = stage.choices; 
            this.status = 'WAITING_FOR_CHOICE';
        } 
        // 🟢 如果 choices 为 null / undefined / []，说明是【演出结束】
        else {
            // Case B: 无分支 (脚本末梢) -> 回合结束
            this.currentChoices = []; // 确保清空选项
            
            // 调用结束回合逻辑 -> 这会将状态改为 'WAITING_FOR_USER'
            this._finishTurn();
        }
    },

    /**
     * [UI 调用] 玩家点击了选项
     * @param {Object} choiceObj - { label: "...", next: "..." }
     */
    handleChoice(choiceObj) {
        if (this.status !== 'WAITING_FOR_CHOICE') return;

        // 1. 记录玩家的选择 (视为玩家发言)
        H_Data.addMessage('user', choiceObj.label);

        // 2. 清空当前选项
        this.currentChoices = [];
        this.status = 'PROCESSING';

        // 3. 跳转下一阶段
        if (choiceObj.next) {
            this._processStage(choiceObj.next);
        } else {
            // 异常兜底
            this._finishTurn();
        }
    },

    /**
     * 触发结算展示 (由 Action 调用)
     * @param {Object} data - LLM 返回的 settlement 对象
     */
    triggerSettlement(data) {
        console.log("[H-System] 进入结算阶段", data);
        this.settlementResult = data;
        this.status = 'SETTLEMENT'; // 切换 UI 到结算模式
    },

    /**
     * 回合结束处理
     */
    _finishTurn() {
        // 消耗行动力
        this.actionCount--;

        // 检查是否强制结算
        if (this.actionCount <= 0) {
            this.status = 'SETTLEMENT';
            // TODO: 这里应触发 Action_H_Interaction 请求结算 summary
            globalAddLog("⌛ 精力耗尽，互动结束...");
        } else {
            // 把控制权交回给玩家输入框
            this.status = 'WAITING_FOR_USER';
        }
    },

    // ==========================================
    // 4. 执行器 (Executor)
    // ==========================================

    /**
     * 应用属性变更 (处理 Action 对象) - 增强版
     * 包含数据清洗、Step限制、Session总量限制
     */
    applyAction(actionObj) {
        if (!actionObj) return;

        // 1. 递归处理数组
        if (Array.isArray(actionObj)) {
            actionObj.forEach(item => this.applyAction(item));
            return;
        }

        // 2. 确定目标 ID
        let targetId = actionObj.id;
        if (!targetId) {
            targetId = this.activeCharId || (this.targetCharIds.length > 0 ? this.targetCharIds[0] : null);
        }

        const currentStats = targetId ? this.statsMap[targetId] : null;
        const longTermState = (targetId && store.hData) ? store.hData[targetId] : null;
        const accumulator = (targetId && this.sessionAccumulator) ? this.sessionAccumulator[targetId] : null;

        // 3. 遍历属性进行处理
        for (const [key, rawValue] of Object.entries(actionObj)) {
            if (key === 'id') continue;

            // --- A. 特殊逻辑: 时间 (Time) ---
            if (key === 'time') {
                const d = this._safeParseNumber(rawValue.day || rawValue['天']);
                const h = this._safeParseNumber(rawValue.hour || rawValue['小时']);
                const m = this._safeParseNumber(rawValue.minute || rawValue['分钟']);
                
                if (d > 0 || h > 0 || m > 0) {
                    console.log(`[H-System] ⏳ 时间流逝: ${d}d ${h}h ${m}m`);
                    if (store.update_time) store.update_time(store.gameTime, 0, 0, d, h, m);
                    this.refreshContext();
                }
                continue;
            }

            // --- B. 特殊逻辑: 评分 (Score) ---
            if (key === 'score') {
                this.totalScore += this._safeParseNumber(rawValue);
                this.scoredTurnCount++;
                continue;
            }

            // 性行为次数 (Sex Count)
            if (key === 'sexCount' || key === 'sex_count') {
                const val = this._safeParseNumber(rawValue);
                if (val > 0 && longTermState) {
                    longTermState.updateSexCount(val);
                    // 同时也记录到本局累积里，方便结算查看
                    if (accumulator) {
                        accumulator.sexCount = (accumulator.sexCount || 0) + val;
                    }
                    console.log(`[H-System] 🔢 性行为次数 +${val}`);
                }
                continue;
            }

            // 处女状态 (Virginity)
            if (key === 'isVirgin' || key === 'is_virgin') {
                // 如果 LLM 传回 false，代表破处；传回 true 代表修复/维持
                if (longTermState) {
                    longTermState.setVirginity(rawValue);
                    // 记录到累积器供调试或结算
                    if (accumulator && rawValue === false) {
                        accumulator.lostVirginity = true; 
                    }
                }
                continue;
            }

            // ================== [新增代码开始] ==================
            // --- B-2. 特殊逻辑: 高潮指令 (Cum) ---
            if (key === 'cum' && rawValue === true) {
                if (currentStats) {
                    // 1. 数值回落逻辑 (保持不变)
                    const oldVal = currentStats.pleasure;
                    // 这里是你设定的 65
                    currentStats.pleasure = Math.max(0, currentStats.pleasure - 65);
                    console.log(`[H-System] 💦 [${targetId}] 触发高潮指令: 快感 ${oldVal} -> ${currentStats.pleasure}`);

                    // ================= [新增逻辑开始] =================
                    
                    // 2. 统计高潮次数 & 发送全局通知
                    if (accumulator) {
                        // 动态增加 cumCount 计数 (如果没有则初始化为0，然后+1)
                        accumulator.cumCount = (accumulator.cumCount || 0) + 1;
                        const count = accumulator.cumCount;

                        // 获取角色显示名称
                        let charName = targetId;
                        if (store.hData && store.hData[targetId]) {
                            charName = store.hData[targetId].name || targetId;
                        }

                        // 构建提示文本
                        let logText = "";
                        if (count === 1) {
                            logText = `🌊 ${charName} 达到了高潮！`;
                        } else {
                            logText = `🌊🌊 ${charName} 达到了第 ${count} 次高潮！`;
                        }

                        // 发送全局日志 (UI会自动显示)
                        globalAddLog(logText);
                    }
                    // ================= [新增逻辑结束] =================
                }
                continue;
            }

            // --- C. 复杂对象: 部位开发 (Parts) ---
            if (key === 'parts' && typeof rawValue === 'object' && longTermState && accumulator) {
                for (const [partName, partVal] of Object.entries(rawValue)) {
                    const change = this._applyLimit(
                        'parts', 
                        partVal, 
                        accumulator.parts[partName] || 0
                    );
                    
                    if (change !== 0) {
                        // 更新 Store
                        longTermState.updatePart(partName, change);
                        // 更新累积量
                        accumulator.parts[partName] = (accumulator.parts[partName] || 0) + change;
                        console.log(`[H-System] ❤️ 部位开发 [${partName}]: +${change} (本局累积: ${accumulator.parts[partName]})`);
                    }
                }
                continue;
            }

            // --- D. 通用数值处理 (Attributes / Stats) ---
            const val = this._safeParseNumber(rawValue);
            if (val === 0) continue;

            // D-1. 短期属性 (不设 Session 限制，但限制范围 0-100)
            if (currentStats && currentStats.hasOwnProperty(key)) {
                let newVal = currentStats[key] + val;
                currentStats[key] = Math.min(100, Math.max(0, newVal));
            }
            // D-2. 长期属性 (受配置表限制)
            else if (longTermState && accumulator) {
                // 计算受限后的增量
                const change = this._applyLimit(key, val, accumulator[key] || 0);

                if (change !== 0) {
                    // 更新 Store
                    if (key === 'affection') longTermState.updateAffection(change);
                    else if (key === 'depravity') longTermState.updateDepravity(change);
                    else if (key === 'sexCount') longTermState.sexCount += change;
                    
                    // 更新累积量
                    accumulator[key] = (accumulator[key] || 0) + change;
                    console.log(`[H-System] 📈 属性更新 [${key}]: +${change} (本局累积: ${accumulator[key]})`);
                }
            }
        }
    },

    /**
     * 🟢 [新增] 辅助：安全解析数字
     */
    _safeParseNumber(val) {
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        if (typeof val === 'string') return parseFloat(val) || 0;
        return 0;
    },

    /**
     * 🟢 [新增] 辅助：计算受限后的增量
     * @param {string} key - 属性名
     * @param {number} rawVal - 原始增量
     * @param {number} currentAccumulated - 当前已累积量
     */
    _applyLimit(key, rawVal, currentAccumulated) {
        let val = this._safeParseNumber(rawVal);
        if (val <= 0) return 0; // 目前只限制正增长，减少属性通常不限制

        // 1. 查找配置
        const config = ATTRIBUTE_LIMITS.find(cfg => cfg.keys.includes(key));
        if (!config) return val; // 无配置则不限制

        // 2. 单步限制 (Step Clamp)
        let stepClamped = Math.min(val, config.stepMax);

        // 3. 总量限制 (Session Clamp)
        const roomLeft = config.sessionMax - currentAccumulated;
        if (roomLeft <= 0) {
            // console.warn(`[H-System] ⚠️ ${key} 已达本局上限 (${config.sessionMax})`);
            return 0;
        }

        return Math.min(stepClamped, roomLeft);
    },

    /**
     * [新增] 刷新上下文信息 (如时间流逝后更新显示)
     */
    refreshContext() {
        if (!this.isActive) return;

        // 重新从全局 Store 拉取最新时间
        const newTime = store.worldState.timeDisplay || "未知时间";
        
        // 更新 context
        if (this.context) {
            this.context.time = newTime;
        }
    },

});