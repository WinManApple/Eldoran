/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/LLM/calls/Call_H_Interaction.js

import { Game_Manager } from '../Game_Manager.js';
import { HInteractionSystem } from '../../systems/HInteractionSystem/HInteractionSystem.js';
import { H_Data } from '../../ui/modules/H_Data.js';
import { H_Memory } from '../memory/H_Memory.js';
import { store } from '../../ui/modules/store.js';
import { Player_Memory } from '../memory/Player_Memory.js';
import { Party_Memory } from '../memory/Party_Memory.js';
import { H_State_Memory } from '../memory/H_State_Memory.js';

import { H_STATE_CONFIG, REWARD_CONFIG } from './Configuration_Table.js';

// 对应 Action 的 XML 标签名
const TAG = 'Task_H_Scene_Play';

// =================================================
// 1. 核心调用模块
// =================================================

export const Call_H_Interaction = {

    /**
     * 构建并发送 H 互动请求
     * @param {string|null} content - 内容
     * @param {string} requestType - 请求类型: 'NORMAL' | 'INIT' | 'END'
     */
    requestInteraction(content, requestType = 'NORMAL') {
        // 1. 基础校验 (保持不变)
        if (!HInteractionSystem.isActive) {
            console.warn("[Call_H] 系统未激活，取消请求");
            return;
        }

        // [变更] 获取多人 ID 列表
        const targetIds = HInteractionSystem.targetCharIds || [];
        if (targetIds.length === 0) {
            console.warn("[Call_H] 未指定互动目标");
            return;
        }

        console.log(`[Call_H] 正在构建互动请求 [${requestType}]... 目标: ${targetIds.join(', ')}`);
        // targetIds 已经是数组，直接使用

        // =================================================
        // 2. 核心修改：输入格式化与指导生成
        // =================================================
        let formattedInputStr = "";
        let settlementGuideStr = ""; // 🟢 新增变量

        switch (requestType) {
            case 'INIT':
                formattedInputStr = "Order_Init_System";
                break;
            
            case 'END':
                // 🟢 [还原] 保持指令纯净
                formattedInputStr = "Order_Start_Settlement";
                
                // 🟢 [新增] 独立计算并生成结算指导
                settlementGuideStr = this._buildSettlementGuide();
                break;
            
            case 'NORMAL':
            default:
                // 🟢 [修改] 强制将英文双引号替换为单引号，防止 JSON 结构崩坏
                // 同时建议处理一下反斜杠，防止用户输入 "\" 导致转义错误
                const safeText = (content || "")
                    .replace(/\\/g, '/')  // 把反斜杠变成斜杠 (可选，视需求而定)
                    .replace(/"/g, "'");  // 把双引号变成单引号

                formattedInputStr = `"user": "${safeText || '...'}"`;
                break;
        }

        // =================================================
        // 3. 数据收集 (保持不变)
        // =================================================
        const ctx = HInteractionSystem.context;
        const timePlaceStr = `地点: ${ctx.location || "未知"} | 时间: ${ctx.time || "未知"} | 事件: ${ctx.eventName || "遭遇"}`;

        const rawPartyData = Player_Memory.getPartyData() || [];
        const playerPartyStr = JSON.stringify(rawPartyData.map(p => ({
            id: p.id || p.player_ID,
            name: p.name,
            identity: p.identity || "未知",
            level: p.level || 1,
            sex: p.sex,
            stats: p.baseStats
        })), null, 0);

        const femaleHistoryStr = this._buildFemaleHistoryStr(targetIds);
        const chatHistoryStr = this._buildChatHistoryStr();
        const femaleAttributeStr = this._buildFemaleAttributeStr(targetIds);

        // =================================================
        // 4. Payload 组装
        // =================================================

        const payload = {
            command: 'H_INTERACTION',
            expectedTags: [TAG],
            params: {
                userInput: formattedInputStr,
                
                // 🟢 新增参数：只有在 END 时才有内容，其他时候为空字符串
                settlementGuide: settlementGuideStr,

                eventName: ctx.eventName || "未知事件",

                timePlace: timePlaceStr,
                playerParty: playerPartyStr,
                femaleHistory: femaleHistoryStr,
                chatHistory: chatHistoryStr,
                femaleAttribute: femaleAttributeStr
            }
        };

        Game_Manager.sendRequest(payload);
    },

    // =================================================
    // 5. 内部构建函数
    // =================================================

    /**
     * 构建女性 H 历史 (合并 H_Memory 和 Party_Memory)
     */
    _buildFemaleHistoryStr(targetIds) {
        const historyList = targetIds.map(id => {
            const charName = this._getCharName(id);
            
            // 1. 获取 H 专属记忆
            const hMemories = H_Memory.getMemories(id);
            
            // 2. 获取日常队友记忆 (用于辅助性格判断)
            const partyMem = Party_Memory.getTeammateMemory(id) || "无日常印象";

            return {
                id: id,
                name: charName,
                h_summary: hMemories.length > 0 ? hMemories : ["暂无性经历"],
                daily_impression: partyMem
            };
        });

        return JSON.stringify(historyList, null, 2);
    },

    /**
     * 构建当前对话流 (合并上下文 + 当前即时消息)
     */
    _buildChatHistoryStr() {
        // 1. 获取 H 互动产生的新消息
        const newLogs = H_Data.getCurrentLogs() || [];
        
        // 2. 🟢 [核心修复] 获取传入的上下文背景 (前情提要)
        // 从 H_Data.currentSession.context 读取
        let contextLogs = [];
        if (H_Data.currentSession && Array.isArray(H_Data.currentSession.context)) {
            contextLogs = H_Data.currentSession.context;
        }

        // 3. 🟢 合并：[背景] + [新消息]
        // 这样 LLM 既能看到之前的对话，也能看到互动后的新进展
        const combinedLogs = [...contextLogs, ...newLogs];
        
        const flow = combinedLogs.map(log => {
            let keyName = 'system'; // 默认为 system

            // A. 处理 User
            if (log.role === 'user') {
                keyName = 'user'; 
            } 
            // B. 处理 System (包含抉择结果)
            else if (log.role === 'system') {
                keyName = 'system';
            } 
            // C. 处理 AI/NPC
            else if (log.role === 'ai' || log.role === 'unknown' || !log.role) { // 兼容 context 数据可能没有 role='ai' 而是直接存了名字的情况
                if (log.name) {
                    keyName = log.name;
                } else if (log.role && log.role !== 'ai' && log.role !== 'unknown') {
                    // 如果 context 里直接存了 { role: "莉莉丝", text: "..." }
                    keyName = log.role;
                } else {
                    // 兜底 ID
                    const ids = HInteractionSystem.targetCharIds || [];
                    keyName = (ids.length === 1) ? this._getCharName(ids[0]) : "Unknown";
                }
            }

            // D. 构造对象
            return {
                [keyName]: log.text
            };
        });

        return JSON.stringify(flow, null, 2);
    },

    /**
     * 构建女性属性状态 (动态适配版)
     */
    _buildFemaleAttributeStr(targetIds) {
        const attributes = targetIds.map(id => {

            // 1. 获取源数据 (H数据 & 静态数据)
            const longTermState = store.hData ? store.hData[id] : null;
            const charStaticData = store.party.find(c => c.id === id);

            if (!longTermState) {
                return { id: id, error: "H数据丢失" };
            }

            // =========================================================
            // 🟢 [核心修改] 准备该角色的动态规则集
            // =========================================================
            // 长期规则
            const affRules = H_State_Memory.getRuleSet(id, 'Long_Term', 'AFFECTION');
            const depRules = H_State_Memory.getRuleSet(id, 'Long_Term', 'DEPRAVITY');
            const partRules = H_State_Memory.getRuleSet(id, 'Long_Term', 'PARTS');
            
            // 短期规则 (Stamina, Sanity, Pleasure, Excitement)
            const staRules = H_State_Memory.getRuleSet(id, 'Short_Term', 'STAMINA');
            const sanRules = H_State_Memory.getRuleSet(id, 'Short_Term', 'SANITY');
            const pleRules = H_State_Memory.getRuleSet(id, 'Short_Term', 'PLEASURE');
            const excRules = H_State_Memory.getRuleSet(id, 'Short_Term', 'EXCITEMENT');

            // 🟢 [新增] 获取性癖
            const sexualityTags = H_State_Memory.getSexuality(id) || [];

            // 2. 解析长期属性
            const ltResolved = {
                // 使用动态规则 affRules, depRules
                affection_action: this._resolveStatus(longTermState.affection, affRules),
                depravity_action: this._resolveStatus(longTermState.depravity, depRules),
                parts: {}
            };
            
            if (longTermState.parts) {
                for (const [part, val] of Object.entries(longTermState.parts)) {
                    // 使用动态规则 partRules
                    ltResolved.parts[part] = this._resolveStatus(val, partRules);
                }
            }

            // 3. 解析短期属性
            const shortTermStats = (HInteractionSystem.statsMap && HInteractionSystem.statsMap[id])
                ? HInteractionSystem.statsMap[id]
                : { stamina: 100, sanity: 100, pleasure: 0, excitement: 0, shame: 0 };

            const stResolved = {
                // 使用动态短期规则
                stamina: this._resolveStatus(shortTermStats.stamina, staRules),
                sanity: this._resolveStatus(shortTermStats.sanity, sanRules),
                pleasure: this._resolveStatus(shortTermStats.pleasure, pleRules),
                excitement: this._resolveStatus(shortTermStats.excitement, excRules),
                // shame 逻辑暂时保持硬编码，因为它依赖多变量复杂判断，或者后续你也可以将其重构为动态规则
                shame: this._resolveShame(shortTermStats.shame, longTermState.depravity, longTermState.AFFECTION)
            };

            // 4. 返回组装结果
            return {
                id: id,
                name: this._getCharName(id),
                appearance: charStaticData ? (charStaticData.appearance || "无描述") : "未知",
                personality: charStaticData ? (charStaticData.character || "普通性格") : "未知",
                identity: charStaticData ? (charStaticData.identity || "未知") : "未知",
                is_virgin: longTermState.isVirgin,
                
                // 🟢 [新增] 注入性癖板块
                sexuality: sexualityTags.length > 0 ? sexualityTags : ["暂无"],

                longterm: ltResolved,
                temporary: stResolved
            };
        });

        return JSON.stringify(attributes, null, 2);
    },

    // =================================================
    // 6. 辅助工具函数
    // =================================================

    /**
     * 通用状态解析器：数值 -> 描述文本
     */
    _resolveStatus(val, ruleSet) {
        const num = Math.floor(val || 0);
        // 找到第一个 "当前值 < 规则上限" 的条目
        let rule = ruleSet.find(r => num < r.max);
        // 如果都超过了(数值极大)，用最后一个
        if (!rule && ruleSet.length > 0) rule = ruleSet[ruleSet.length - 1];
        
        const desc = rule ? rule.text : "未知状态";
        return `${num} - ${desc}`;
    },

    /**
     * 羞耻度特殊解析逻辑 (依赖堕落度和好感度)
     * @param {number} shameVal      羞耻度 0~100
     * @param {number} depravityVal  堕落度 (参考之前的阶段划分)
     * @param {number} affectionVal  好感度 (参考之前的阶段划分)
     * @returns {string} 如 "78 - [中高羞耻/纯情不安/被触动] ..."
     */
    _resolveShame(shameVal, depravityVal, affectionVal) {
        const num = Math.floor(shameVal || 0);
        const dep = Math.floor(depravityVal || 0);
        const aff = Math.floor(affectionVal || 0);
        let desc = "";

        if (num <= 20) {
            // 极低羞耻 - 几乎无羞耻感，通用：开放表达，适用于傲娇（自信展示）、温柔（自然分享）
            if (aff < 150) {
                desc = "[极低羞耻/冷淡坦荡]。完全不在意被看或被说，态度中性或疏离，甚至会直接拒绝多余互动。";
            } else if (aff < 300) {
                desc = "[极低羞耻/轻度接纳]。坦然面对，偶尔直视玩家并轻微回应，表现出初步的信任和舒适。";
            } else {
                desc = "[极低羞耻/深情开放]。主动展示或挑逗玩家，使用眼神或肢体表达依恋，视暴露为亲密方式。";
            }
        } 
        else if (num <= 40) {
            // 低羞耻 - 轻微在意但可接受，通用：微红但继续，适用于冷傲（表面冷静内心微动）、知性（理性控制）
            if (dep < 150) {
                if (aff < 150) {
                    desc = "[低羞耻/自然回避]。轻微脸红但仍能直视玩家，正常对话，偶尔用手遮挡但很快适应，避免过多情感暴露。";
                } else {
                    desc = "[低羞耻/被触动自然]。脸红中带着一丝悸动，直视玩家时眼神柔和，愿意分享但仍有些许保留。";
                }
            } else {
                if (aff < 300) {
                    desc = "[低羞耻/刻意放荡矛盾]。故意用“害羞”增加情趣，假装遮挡但内心期待被看，表现出轻微的迎合。";
                } else {
                    desc = "[低羞耻/深情放荡]。用开放姿态表达爱意，脸红转为兴奋，主动靠近玩家分享亲密时刻。";
                }
            }
        } 
        else if (num <= 60) {
            // 中等羞耻 - 明显不自在，通用：不安但不完全拒绝，适用于傲娇（嘴硬遮挡）、温柔（温柔求饶）
            if (dep < 200) {
                if (aff < 200) {
                    desc = "[中等羞耻/纯情不安]。频繁用手遮挡，低头不敢直视，声音发颤，表现出犹豫和内在冲突。";
                } else {
                    desc = "[中等羞耻/心动不安]。遮挡中带着对玩家的依恋，眼神偷偷瞄玩家，声音中混杂害羞和期待。";
                }
            } else if (dep < 300) {
                if (aff < 300) {
                    desc = "[中等羞耻/矛盾萌]。一边遮挡一边不自觉迎合，嘴上说“不要看”但身体微动，表现出内在拉扯。";
                } else {
                    desc = "[中等羞耻/深情矛盾]。用矛盾行为表达爱意，遮挡后又主动靠近，眼神传达依恋和兴奋。";
                }
            } else {
                desc = "[中等羞耻/伪装羞耻]。夸张害羞来刺激互动，实际上享受被注视，适用于各种性格的调情变体。";
            }
        } 
        else if (num <= 80) {
            // 中高羞耻 - 强烈羞耻但有裂痕，通用：抗拒中混杂兴奋，适用于冷傲（强忍不露）、知性（分析但失控）
            if (dep < 200) {
                if (aff < 200) {
                    desc = "[中高羞耻/强烈抗拒]。拼命遮挡、闭眼、蜷缩，脸红到脖子，声音带着责怪或求饶，表现出强烈不适。";
                } else {
                    desc = "[中高羞耻/触动抗拒]。抗拒中对玩家产生复杂情感，蜷缩时偶尔偷看，声音中带着一丝依恋的颤抖。";
                }
            } else if (dep < 350) {
                if (aff < 300) {
                    desc = "[中高羞耻/口嫌体正直]。嘴上说“太丢人”，身体却诚实回应，露出矛盾表情，表现出拉扯感。";
                } else {
                    desc = "[中高羞耻/深情正直]。矛盾中满是爱意，身体迎合时眼神湿润，事后会寻求玩家的安慰。";
                }
            } else {
                desc = "[中高羞耻/羞耻成瘾]。越羞耻越兴奋，遮挡转为诱惑，适用于高好感时的深层依恋或低好感时的强制兴奋。";
            }
        } 
        else if (num <= 95) {
            // 高羞耻 - 接近极限，通用：崩溃边缘但有转折，适用于傲娇（泪眼汪汪嘴硬）、温柔（温柔崩溃求抱）
            if (dep < 250) {
                if (aff < 250) {
                    desc = "[高羞耻/濒临崩溃]。几乎哭出，全身发抖，拼命求“别看”，理智挣扎，表现出强烈内在冲突。";
                } else {
                    desc = "[高羞耻/心动崩溃]。崩溃中带着对玩家的渴望，流泪时眼神求助，事后会不自觉依偎。";
                }
            } else {
                if (aff < 350) {
                    desc = "[高羞耻/羞耻快感化]。羞耻转为快感，一边流泪一边回应，表现出矛盾的高潮潜力。";
                } else {
                    desc = "[高羞耻/深情快感化]。快感中满是爱意，流泪高潮后紧紧抱住玩家，表达身心交付。";
                }
            }
        } 
        else {
            // 极高羞耻 - 顶点表现，通用：完全沉浸，适用于各种性格的极端变体
            if (dep < 300) {
                if (aff < 300) {
                    desc = "[极高羞耻/纯情极限]。意识模糊，只剩呜咽和求饶，羞耻压倒一切，表现出彻底的不适和抗拒。";
                } else {
                    desc = "[极高羞耻/痴迷极限]。极限羞耻中混杂深爱，呜咽转为呢喃爱意，事后极度黏人。";
                }
            } else {
                desc = "[极高羞耻/羞耻顶点快感]。羞耻达顶峰触发最强高潮，事后回味并期待更多，表现出成瘾般的依赖。";
            }
        }

        return `${num} - ${desc}`;
    },

    /**
     * 根据 ID 获取角色名
     */
    _getCharName(id) {
        if (store.party) {
            const char = store.party.find(c => c.id === id);
            if (char) return char.name;
        }
        // 兜底尝试从 HData 获取 (如果不存 name 可能会失败)
        return id;
    },

    /**
     * 🟢 [新增] 构建结算指导文本
     * 根据 System 中的评分计算均分，并匹配奖励规则
     */
    _buildSettlementGuide() {
        // 1. 安全计算均分(多人共享评分)
        let avgScore = 0;
        if (HInteractionSystem.scoredTurnCount > 0) {
            avgScore = HInteractionSystem.totalScore / HInteractionSystem.scoredTurnCount;
        }
        
        // 保留一位小数
        const finalScore = parseFloat(avgScore.toFixed(1));

        // 2. 匹配规则
        // 引用 REWARD_CONFIG.TIERS
        let guide = REWARD_CONFIG.TIERS.find(tier => finalScore >= tier.min);
        
        // 兜底
        if (!guide) guide = REWARD_CONFIG.TIERS[REWARD_CONFIG.TIERS.length - 1];

        // 3. 生成最终文本
        // 格式示例: "评分均分: 92.5\n指导: [优秀]。奖励建议: 4倍自身经验 + 1本强力技能书"
        const guideText = `当前评分均分: ${finalScore}\n系统指导: ${guide.text}`;
        
        console.log(`[Call_H] 生成结算指导: ${guideText}`);
        return guideText;
    }

};