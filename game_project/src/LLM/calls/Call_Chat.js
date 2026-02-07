/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/LLM/calls/Call_Chat.js

import { Game_Manager } from '../Game_Manager.js';
import { Chat_Memory } from '../memory/Chat_Memory.js';
import { Npc_Memory } from '../memory/Npc_Memory.js';
import { store, addLog } from '../../ui/modules/store.js';
import { Party_Memory } from '../memory/Party_Memory.js';

import { Plot_Memory } from '../memory/Plot_Memory.js';
import { Player_Memory } from '../memory/Player_Memory.js';

import { TAG as Tag_Chat } from '../actions/Action_Chat.js';

import { H_Memory } from '../memory/H_Memory.js';

import { H_State_Memory } from '../memory/H_State_Memory.js';

import { H_STATE_CONFIG } from './Configuration_Table.js';

import { GameDatabase } from '../../config/GameDatabase.js';

/**
 * 聊天请求调用脚本 (Call Chat) - v2.2 修复版
 * 修复内容：
 * 1. 强制初始化频道，解决 User_Input/Chat_History 丢失问题
 * 2. 增强 H 数据提取逻辑，增加 Debug 日志
 */
export const Call_Chat = {

    // 必须添加这个 CONFIG 属性，供 Action_Chat.js 调用
    CONFIG: {
        RETENTION_RECENT_CHAT: 5, // 默认兜底值
        RETENTION_SUMMARY: 3      // 默认兜底值
    },

    async requestChat(userText, channelName, channelType, channelId = 'main') {
        console.log(`[Call_Chat] 正在构建请求 | 频道: ${channelId}`);

        // 将 store 中的配置同步到全局 CONFIG
        // 这样 Action_Chat 在执行清理时就能读取到最新的设置
        this.CONFIG.RETENTION_RECENT_CHAT = store.config.ai.chat.retentionRecent || 5;
        this.CONFIG.RETENTION_SUMMARY = store.config.ai.chat.retentionSummary || 3;

        const CHAT_CONFIG = {
            MAX_RECENT_INTERACTIONS: store.config.ai.chat.maxRecentInteractions,
            MAX_SUMMARIES: store.config.ai.chat.maxSummaries,
            RETENTION_RECENT_CHAT: store.config.ai.chat.retentionRecent,
            RETENTION_SUMMARY: store.config.ai.chat.retentionSummary
        };

        const playerName = store.playerStats.name || "User";
        const currentTime = store.worldState.timeDisplay;

        // =================================================
        // 1. 写入玩家最新输入 (关键修复)
        // =================================================
        // 🔴 修复：使用 _getChannel 强制获取或创建频道
        // 原来的 getChannelData 如果返回 undefined，会导致输入无法写入
        const channelData = Chat_Memory._getChannel(channelId, channelType || 'MAIN');
        
        if (channelData) {
            const newEntry = {
                timestamp: Date.now(),
                user: playerName,
                userText: userText, 
                reply: {
                    time_count: currentTime,
                    content: {}
                }
            };
            // 写入记忆
            channelData.history.recent_chat.push(newEntry);
            console.log(`[Call_Chat] ✅ 已写入用户输入: "${userText}"`);
        } else {
            console.error(`[Call_Chat] ❌ 致命错误：无法初始化频道 ${channelId}`);
        }

        // =================================================
        // 2. 🚦 计算控制信号
        // =================================================
        const controlSignals = {
            require_summary: false,
            require_grand_summary: false
        };

        if (channelData) {
            // 🟢 [核心修正] 只读取当前频道 (channelData) 的历史记录长度
            // 确保不会因为其他频道的聊天而误触发本频道的总结
            const h = channelData.history;
            
            if (h.recent_chat.length >= CHAT_CONFIG.MAX_RECENT_INTERACTIONS) {
                controlSignals.require_summary = true;
            }
            if (h.summary.length >= CHAT_CONFIG.MAX_SUMMARIES) {
                controlSignals.require_grand_summary = true;
            }
        }

        // =================================================
        // 3. 搜集上下文数据
        // =================================================
        
        // 3.1 基础记忆
        let nodeMemData = {};
        let currentMapId = null;
        if (window.mapManager && window.mapManager.currentMap) {
            currentMapId = window.mapManager.currentMap.mapId;
        }

        const npcMemData = Npc_Memory.serialize();
        const partyMemData = Party_Memory.serialize();

        // 3.2 剧情记忆
        let plotData = null;
        if (currentMapId) {
            plotData = Plot_Memory.getChapterData(currentMapId);
        }

        // 3.3 玩家状态
        const playerStateData = Player_Memory.getPartyData();

        // 3.4 女性角色 H 属性 (增强版)
        const femaleHData = [];
        
        // 🔴 调试：检查 store.hData 是否存在
        if (!store.hData) {
            console.warn("[Call_Chat] ⚠️ store.hData 未初始化或为空");
        } else {
            console.log("[Call_Chat] store.hData Keys:", Object.keys(store.hData));
        }

        if (playerStateData && playerStateData.length > 0) {
            playerStateData.forEach(member => {
                // 🔴 修复：更宽松的性别判断 (转大写)
                const sex = member.sex ? member.sex.toUpperCase() : 'UNKNOWN';
                
                if (sex === 'FEMALE') {
                    // 尝试获取 H 数据，这里我们并没有在store.js里创建这一数据结构，只是一个空实现
                    // 注意：store.hData 的 key 必须与 member.player_ID 一致
                    let hState = store.hData ? store.hData[member.player_ID] : null;
                    
                    // 2. 如果 ID 没找到数据 (可能 ID 丢失)，尝试遍历 hData 用名字匹配 (兜底策略)
                    if (!hState && store.hData && !member.player_ID) {
                        console.warn(`[Call_Chat] ID丢失，尝试通过名字匹配 H 数据...`);
                        const allHStates = Object.values(store.hData);
                        // 假设 PartyManager 初始化时 hState.id 与 member.id 一致，这里只能盲猜或者跳过
                        // 由于 hState 内部通常不存 name，这里仅作 ID 检查的补充
                    }

                    if (hState) {
                        // 🟢 新增：从记忆模块获取该 ID 的历史记录
                        // 参考 Call_H_Interaction.js 的 _buildFemaleHistoryStr 实现
                        const realHHistory = H_Memory.getMemories(member.player_ID) || [];

                        femaleHData.push({
                            id: member.player_ID,
                            name: member.name,
                            affection: hState.affection || 0,
                            depravity: hState.depravity || 0,
                            position_development_degree: hState.parts || {
                                mouth: 0, vagina: 0, anus: 0, clitoris: 0, 
                                breasts: 0, nipples: 0, uterus: 0
                            },
                            // 🟢 修改：使用 H_Memory 获取的数据
                            H_History: realHHistory
                        });
                        console.log(`[Call_Chat] ✅ 捕获女性 H 数据: ${member.name} (历史条数: ${realHHistory.length})`);
                    } else {
                        console.warn(`[Call_Chat] ⚠️ 未找到 ${member.name} (${member.player_ID}) 的 H 数据`);
                    }
                }
            });
        }

        // 3.5 收集地图已发现节点 (Map Nodes) - v2.3 格式化重构
        let formattedNodeStr = "无法获取地图数据";
        
        if (window.mapManager && window.mapManager.currentMap) {
            const nodes = window.mapManager.currentMap.nodes || [];
            // 直接调用新方法，传入节点数组和之前获取的 playerStateData (包含队伍信息)
            formattedNodeStr = this._formatMapNodes(nodes, playerStateData);
        }

        // 3.6 地点信息
        let currentNodeName = store.worldState.mapName || "未知区域";
        if (window.mapManager && window.mapManager.currentMap) {
            const cm = window.mapManager.currentMap;
            const currentNode = cm.nodes.find(n => n.id === cm.currentNodeId);
            if (currentNode) {
                currentNodeName = currentNode.name;
            }
        }

        // =================================================
        // 🟢 4. 构建格式化字符串 (核心迁移)
        // =================================================
        
        // 4.1 玩家状态字符串
        const playerStateStr = this._buildPlayerStateStr(playerStateData);

        // 4.2 女性 H 指导字符串
        const femaleInstrStr = this._buildFemaleInstructionsStr(femaleHData);

        // 4.3 聊天历史字符串
        const chatHistoryStr = this._buildChatHistoryStr(channelData);

        // =================================================
        // 🟢 [新增] 数据分流：获取纯净历史 (供总结任务专用)
        // =================================================
        // 调用 Chat_Memory 新增的专用接口
        const historyRecentStr = Chat_Memory.getRecentChatOnly(channelId);
        const historySummaryStr = Chat_Memory.getSummaryHistoryOnly(channelId);

        // 4.4 地点字符串
        const locationStr = `${store.worldState.mapName || "未知区域"} - ${currentNodeName} [${store.worldState.timeDisplay}]`;

        // 4.5 剧情字符串 (直接转换 JSON 或处理为空)
        const plotStr = (plotData && plotData.stages) ? JSON.stringify(plotData.stages, null, 2) : "当前处于自由探索阶段，暂无特殊剧情强制要求。";

        // 5. 组装 Payload (扁平化传输)
        const payload = {
            command: "CHAT",
            
            expectedTags: [Tag_Chat],

            params: {
                targetChannelId: channelId,
                // 传递预处理好的字符串
                playerStateStr: playerStateStr,
                femaleInstrStr: femaleInstrStr,
                chatHistoryStr: chatHistoryStr,
                historyRecentStr: historyRecentStr,     // -> 给 <Summary> 标签填空
                historySummaryStr: historySummaryStr,   // -> 给 <Grand_Summary> 标签填空

                locationStr: locationStr,
                mapNodeStr: formattedNodeStr, // 复用已有的 map_nodes_formatted 逻辑
                plotStr: plotStr,
                
                // 辅助数据
                userInputStr: userText || "(无输入)",
                
                // 传递其他必要数据
                control: controlSignals,
                
                // 保留部分原始数据以备不时之需 (可选，视后端是否完全依赖字符串)
                partyData: partyMemData,
                npcData: npcMemData
            }
        };

        // 🟢 最终检查日志 (适配新结构)
        console.log("[Call_Chat] Payload Preview:", {
            hasChatHistoryStr: !!payload.params.chatHistoryStr,
            chatStrLen: payload.params.chatHistoryStr?.length,
            userInput: payload.params.userInputStr,
            femaleInstrLen: payload.params.femaleInstrStr?.length
        });

        Game_Manager.sendRequest(payload);
        addLog("📤 互动请求已发送...");
    },

    /**
     * 内部方法：格式化地图节点数据为 Prompt 专用文本
     * @param {Array} nodes - 原始节点数组
     * @param {Array} partyData - 队伍数据(用于查找H对象名字)
     */
    _formatMapNodes(nodes, partyData) {
        if (!nodes || nodes.length === 0) return "当前区域暂无已知节点信息。";

        const unexplored = [];
        const explored = [];

        // 1. 遍历与分类
        nodes.forEach(node => {
            // 基础信息
            const baseInfo = {
                "名称": node.name || "未知区域",
                "描述": (node.payload && node.payload.description) ? node.payload.description : "无描述",
                "类型": node.type
            };

            // 状态判断
            if (node.state === 'REVEALED') {
                // === 未探索节点 (需要详细内容) ===
                let contentStr = "";
                const p = node.payload || {};

                switch (node.type) {
                    case 'COMBAT':
                        const enemyNames = (p.enemies || []).map(e => e.name).join(', ');
                        contentStr = `进入触发战斗，存在敌人: ${enemyNames || '未知敌人'}`;
                        break;
                    
                    case 'EVENT_CHOICE':
                    case 'EVENT_QUEST':
                    case 'PORTAL_NEXT_FLOOR':
                    case 'PORTAL_NEXT_CHAPTER':
                        // 序列化 choice_scenes，处理可能为空的情况
                        const scenes = p.choice_scenes ? JSON.stringify(p.choice_scenes) : "{}";
                        contentStr = `进入时触发抉择系统，下面是具体场景:${scenes}`;
                        break;

                    case 'RESOURCE':
                        contentStr = "资源节点，玩家进入可以直接获得资源";
                        break;

                    case 'SHOP':
                        contentStr = "商店，可以在这里购买物品道具等";
                        break;

                    case 'REST':
                        contentStr = "休息处，玩家可以在这里休息";
                        break;

                    case 'EVENT_H':
                        // 查找角色名
                        const targetId = p.charId;
                        let targetName = "未知角色";
                        if (partyData && targetId) {
                            const member = partyData.find(m => m.player_ID === targetId || m.id === targetId);
                            if (member) targetName = member.name;
                        }
                        const evtName = p.eventName || "未知事件";
                        contentStr = `玩家进入时触发H互动，${targetName}为互动对象，事件为${evtName}`;
                        break;

                    case 'ROOT':
                        contentStr = "根节点，玩家进入时可以回到前面的地图(如果存在地图)";
                        break;

                    default:
                        contentStr = "未知类型的节点";
                        break;
                }

                // 注入内容
                baseInfo["节点内容"] = contentStr;
                unexplored.push(JSON.stringify(baseInfo, null, 0)); // 紧凑JSON字符串

            } else if (node.state === 'VISITED' || node.state === 'CURRENT' || node.state === 'COMPLETED') {
                // === 已探索节点 (仅基础信息) ===
                explored.push(JSON.stringify(baseInfo, null, 0));
            }
        });

        // 2. 组装最终文本
        let finalStr = "";
        
        if (unexplored.length > 0) {
            finalStr += "未探索节点:\n" + unexplored.join(",\n") + "\n";
        }
        
        if (explored.length > 0) {
            // 如果有未探索节点，加个换行隔开
            if (unexplored.length > 0) finalStr += "\n";
            finalStr += "已探索节点:\n" + explored.join(",\n");
        }

        return finalStr || "当前区域所有节点均不可见。";
    },
    
    /**
     * 🟢 [最终修正版] 构建玩家状态字符串
     * 核心修正：直接读取 store.party，确保动态技能对象不丢失
     */
    _buildPlayerStateStr(ignoredPlayers) { // 👈 忽略
        // 1. 安全检查
        if (!store || !store.party || store.party.length === 0) return "暂无玩家数据";
        
        const rawParty = store.party;

        // 2. 构建每个角色的基础状态
        const memberLines = rawParty.map(p => {
            const level = p.level || 1;
            const nextExp = Math.pow(level, 2) + 400;
            
            const s = p.stats || {};
            const pDef = s.def || 0;
            const mDef = s.res_magic ? (s.res_magic * 10) : pDef; 
            const avgDef = Math.floor((pDef + mDef) / 2);

            // === A. 装备提取 ===
            const eq = p.equipment || {};
            const n = (slot) => {
                const val = eq[slot];
                if (!val) return null;
                let itemData = null;
                if (typeof val === 'string') {
                    itemData = GameDatabase.Equipment[val];
                } else if (typeof val === 'object') {
                    itemData = val;
                }
                if (!itemData || !itemData.name) return null;
                const qualityStr = itemData.quality ? `(${itemData.quality})` : "";
                return `${itemData.name}${qualityStr}`;
            };

            const wpn = n('weapon');
            const armors = [n('head'), n('chest'), n('hands'), n('legs'), n('boots')].filter(Boolean);
            const accs = [n('accessory_1'), n('accessory_2')].filter(Boolean);
            
            const eqParts = [];
            if (wpn) eqParts.push(`武器: ${wpn}`);
            if (armors.length > 0) eqParts.push(`防具: ${armors.join(', ')}`);
            if (accs.length > 0) eqParts.push(`饰品: ${accs.join(', ')}`);
            const equipStr = eqParts.length > 0 ? eqParts.join(" | ") : "无当前装备";

            // === B. 🟢 技能提取 (直接读取 p.skills.learned) ===
            const rawSkills = (p.skills && p.skills.learned) ? p.skills.learned : [];
            
            const skillTexts = rawSkills.map(skill => {
                // 静态 ID
                if (typeof skill === 'string') {
                    const dbSkill = GameDatabase.Skills[skill];
                    return dbSkill ? `${dbSkill.name}[${dbSkill.desc || ''}]` : skill;
                }
                // 动态对象
                else if (typeof skill === 'object' && skill !== null) {
                    const name = skill.name || "未知技能";
                    // 优先 description (调试截图里的字段)
                    const desc = skill.description || skill.desc || "无描述";
                    return `${name}[${desc}]`;
                }
                return null;
            }).filter(Boolean);

            const skillStr = skillTexts.length > 0 ? skillTexts.join(", ") : "无";

            const dataObj = {
                "名字": p.name || "未知",
                "性别": p.sex || "提取失败请依据名字猜测",
                "身份": p.identity || "未知",
                "外貌": p.appearance || "外貌平平",
                "玩家id": p.player_ID || p.id || "unknown",
                "属性": `等级${level}, HP ${p.HP || p.hp}/${p.HP || p.maxHp}, MP ${p.MP || p.mp}/${p.MP || p.maxMp}, 攻击力${p.attack_power || (p.baseStats?.atk)}, 防御力${avgDef}(均值), 升到下一级需要${nextExp}经验`,
                "当前装备": equipStr,
                "掌握技能": skillStr
            };
            
            return JSON.stringify(dataObj, null, 0);
        }).join("\n");

        // 3. 提取队伍共享的特殊收藏
        let sharedSpecialStr = "无";
        if (store.party[0]) {
            const runtimeLeader = store.party[0]; 
            const inventory = runtimeLeader.inventory; 

            if (Array.isArray(inventory)) {
                const specialItemsRows = [];
                inventory.forEach(item => {
                    if (item.type === 'SPECIAL' && item.isExposedToLLM === true) {
                        const cleanDesc = (item.description || item.desc || "无描述").replace(/[\r\n]+/g, ' ');
                        const safeName = item.name || "未知物品";
                        specialItemsRows.push(`|${safeName}|${cleanDesc}|`);
                    }
                });
                
                if (specialItemsRows.length > 0) {
                    const header = "|物品名称|物品描述|";
                    sharedSpecialStr = header + "\n" + specialItemsRows.join("\n");
                }
            }
        }

        const sharedLine = JSON.stringify({
            "队伍持有特殊收藏": sharedSpecialStr
        }, null, 0);

        return memberLines + "\n" + sharedLine;
    },

    /**
     * 构建女性 H 指导字符串 (动态增强版)
     * 支持从记忆读取个性化描述 + 性癖展示
     */
    _buildFemaleInstructionsStr(femaleList) {
        if (!femaleList || femaleList.length === 0) return "当前无女性队员，无需生成指导。";

        // 🟢 内部通用解析器：保持不变，但 ruleSet 现在由外部传入
        const resolveStatus = (val, ruleSet) => {
            const num = Math.floor(val || 0);
            let rule = ruleSet.find(r => num < r.max);
            if (!rule && ruleSet.length > 0) rule = ruleSet[ruleSet.length - 1];
            const desc = rule ? rule.text : "未知状态";
            return `(当前值:${num}) ${desc}`;
        };

        const instructions = femaleList.map(f => {
            const charId = f.id; // 确保传入的对象里有 id

            // =========================================================
            // 🟢 [核心修改] 从 H_State_Memory 获取该角色专属的动态规则
            // =========================================================
            const affRules = H_State_Memory.getRuleSet(charId, 'Long_Term', 'AFFECTION');
            const depRules = H_State_Memory.getRuleSet(charId, 'Long_Term', 'DEPRAVITY');
            const partRules = H_State_Memory.getRuleSet(charId, 'Long_Term', 'PARTS');

            // 🟢 [新增] 获取性癖/特性标签
            const sexualityTags = H_State_Memory.getSexuality(charId) || [];

            // A. 处理基础属性 (传入动态规则 affRules, depRules)
            const affText = resolveStatus(f.affection, affRules);
            const depText = resolveStatus(f.depravity, depRules);

            // B. 处理身体部位 (传入动态规则 partRules)
            const partsAction = {};
            if (f.position_development_degree) {
                Object.entries(f.position_development_degree).forEach(([part, val]) => {
                    partsAction[part] = resolveStatus(val, partRules);
                });
            }

            return {
                id: f.id,
                name: f.name,
                // 🟢 [新增] 性癖板块
                sexuality: sexualityTags.length > 0 ? sexualityTags : ["暂无特殊性癖"],
                
                affection_action: affText,
                depravity_action: depText,
                other_action: partsAction,
                h_history: f.H_History || ["暂无互动记录"]
            };
        });

        return JSON.stringify(instructions, null, 2);
    },

    /**
     * 🟢 [新增] 构建聊天历史字符串
     */
    _buildChatHistoryStr(chatData) {
        if (!chatData || !chatData.history) return "无历史记录";
        const h = chatData.history;
        let text = "";

        // 1. 宏观 (支持数组列表与旧版对象)
        if (h.grand_summary) {
            let grandContent = "";
            
            if (Array.isArray(h.grand_summary)) {
                // 新版：数组结构 -> 拼接所有历史篇章
                if (h.grand_summary.length > 0) {
                    grandContent = h.grand_summary.map(g => `- ${g.content}`).join("\n");
                }
            } else if (h.grand_summary.content) {
                // 旧版兼容：对象结构
                grandContent = h.grand_summary.content;
            }

            if (grandContent) {
                // 标签从 [宏观背景] 变更为 [过往篇章记录] 以适应列表形式
                text += `[过往篇章记录]:\n${grandContent}\n\n`;
            }
        }
        // 2. 阶段
        if (h.summary && h.summary.length > 0) {
            text += `[前情提要]:\n${h.summary.map(s => `- ${s.content}`).join('\n')}\n\n`;
        }
        // 3. 近期 (排除最后一条，因为它是最新的 User Input)
        const recent = h.recent_chat || [];
        if (recent.length > 1) { 
            text += `[近期对话]:\n`;
            const pastChats = recent.slice(0, -1);
            
            pastChats.forEach(entry => {
                if(entry.userText) text += `User: ${entry.userText}\n`;
                
                if (entry.reply && entry.reply.content) {
                    if (Array.isArray(entry.reply.content)) {
                        entry.reply.content.forEach(msg => {
                            if (msg.role === 'system') {
                                text += `(System: ${msg.text})\n`;
                            } else {
                                text += `${msg.role}: ${msg.text}\n`;
                            }
                        });
                    } else {
                        Object.entries(entry.reply.content).forEach(([role, msg]) => {
                            if (role !== 'system') text += `${role}: ${msg}\n`;
                        });
                    }
                }
            });
        } else {
            text += "(暂无近期对话历史)";
        }
        return text;
    }
};