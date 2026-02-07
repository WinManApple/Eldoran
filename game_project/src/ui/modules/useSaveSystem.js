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

// src/ui/modules/useSaveSystem.js
import { store, addLog } from './store.js';
// 引入 CharacterModel 用于读档时重建对象
import { CharacterModel } from '../../systems/PlayerState.js';
// 引入新对话数据库
import { ChatData } from './ChatData.js'; 
// 引入女性角色H属性与H互动详细数据
import { HState } from '../../systems/HInteractionSystem/H_State.js';
import { H_Data } from './H_Data.js';

// 引入Memory系列数据
import { Plot_Memory } from '../../LLM/memory/Plot_Memory.js';
import { Chat_Memory } from '../../LLM/memory/Chat_Memory.js';
import { Npc_Memory } from '../../LLM/memory/Npc_Memory.js'; 
import { Party_Memory } from '../../LLM/memory/Party_Memory.js';
import { H_Memory } from '../../LLM/memory/H_Memory.js';
import { H_State_Memory } from '../../LLM/memory/H_State_Memory.js';

/**
 * ==========================================
 * 存档系统逻辑模块 (Save System Logic)
 * ==========================================
 * 职责：
 * 1. 负责与后端 StorageManager 进行 RPC 通信。
 * 2. 处理游戏数据的序列化 (Save) 与反序列化 (Load)。
 * 3. 管理存档列表的刷新与显示格式化。
 */

// 🔒 内部辅助：智能查找存储管理器 (保持不变)
const getGameStorage = () => {
    if (window.gameStorage) return window.gameStorage;
    try {
        if (window.parent && window.parent.gameStorage) return window.parent.gameStorage;
    } catch (e) {}
    try {
        if (window.opener && window.opener.gameStorage) return window.opener.gameStorage;
    } catch (e) {}
    try {
        if (window.top && window.top.gameStorage) return window.top.gameStorage;
    } catch (e) {}
    console.error("[SaveSystem] ❌ 未找到 StorageManager 实例");
    return null;
};

export function useSaveSystem() {

    // ==========================================
    // 1. 列表管理 (保持不变)
    // ==========================================
    const refreshSaveList = async () => {
        let realSaves = [];
        const storage = getGameStorage();
        if(storage) {
            try {
                const list = await storage.getList();
                if(Array.isArray(list)) realSaves = list;
                addLog("✅ 存档列表已同步");
            } catch(e) { console.error("获取存档失败", e); }
        }

        const combinedList = [];
        for (let i = 1; i <= 20; i++) {
            const existing = realSaves.find(s => {
                const id = s.metadata ? s.metadata.slot_id : s.slot_id;
                return String(id) === String(i);
            });
            
            if (existing) {
                combinedList.push({
                    slot_id: i,
                    name: (existing.metadata && existing.metadata.name) || existing.name || "未知存档",
                    timestamp: (existing.metadata && existing.metadata.timestamp) || existing.timestamp || "未知时间",
                    location: (existing.metadata && existing.metadata.location) || existing.location || "未知地点",
                    _rawData: existing 
                });
            } else {
                combinedList.push({ slot_id: i, name: `--- 空 插 槽 ${i} ---`, timestamp: null, location: "无数据" });
            }
        }
        store.saveSystem.manualList = combinedList;
    };

    const selectSaveSlot = (save) => {
        store.saveSystem.selectedId = save.slot_id;
        store.saveSystem.previewData = save;
    };

    const switchSaveMode = (mode) => {
        store.saveSystem.mode = mode;
        store.saveSystem.selectedId = null;
        store.saveSystem.previewData = null;
    };

    // ==========================================
    // 2. 保存逻辑 (Serialize)
    // ==========================================
    
    const executeSave = async () => {
        let slotId = store.saveSystem.selectedId;
        if (!slotId && store.saveSystem.mode === 'manual') {
            const firstEmpty = store.saveSystem.manualList.find(s => !s.timestamp);
            slotId = firstEmpty ? firstEmpty.slot_id : 1;
        }

        const storage = getGameStorage();
        if (!storage) { addLog("❌ 存档服务未连接"); return false; }

        addLog(`正在保存到插槽 ${slotId}...`);

        try {
            const worldData = window.mapManager ? window.mapManager.serialize() : null;
            
            // 🟢 [新增] 获取精确位置数据
            const locationData = {
                mapId: window.mapManager ? window.mapManager.activeMapId : null,
                nodeId: (window.mapManager && window.mapManager.currentMap) ? window.mapManager.currentMap.currentNodeId : null,
                // 用于元数据显示 (例如: "幽暗森林 - 营地")
                display: window.uiStore ? `${window.uiStore.worldState.mapName} - ${window.uiStore.worldState.nodeName || '未知'}` : "未知区域"
            };

            // 🟢 [新增] 获取摄像机数据包
            // 直接调用我们刚刚在 Map3DCamera 里写的 serialize()
            // 使用 window.currentMapCamera 是最稳健的方式 (由 ExplorationScene 暴露)
            const cameraData = window.currentMapCamera ? window.currentMapCamera.serialize() : null;

            // 构建原始数据对象
            const rawGameData = {
                metadata: {
                    slot_id: slotId,
                    timestamp: new Date().toLocaleString(),
                    name: `Lv.${store.playerStats.level} ${store.playerStats.name}`,
                    location: store.activeQuest.title,
                    character: store.playerStats.name,
                    level: store.playerStats.level,
                },

                party: store.party.map(member => member.serialize()),

                gameTime: store.gameTime, // 游戏时间

                // 保存全局配置 (战斗难度、AI参数等)
                config: store.config,

                //  补充任务系统数据
                story: { 
                    active_quest: { ...store.activeQuest }, // 原有的
                    
                    // [新增] 支线与历史记录
                    side_quests: store.sideQuests || [], // 简单的 UI 列表
                    quest_system: store.questSystem || { // 核心数据结构
                        mainLine: [],
                        sideLine: [],
                        history: []
                    }
                },

                map: worldData,
                
                // 保存摄像机字段
                camera: cameraData,

                // 🟢 核心修改：保存 ChatData 的全频道数据
                dialogue: { 
                    channels: ChatData.channels,           // 所有频道及其历史
                    activeChannelId: ChatData.activeChannelId, // 当前处于哪个频道
                    visibleBubbleCount: ChatData.visibleBubbleCount
                },

                hSystem: {
                    // 1. 序列化所有女性角色的 H 属性 (hData)
                    states: store.hData || {}, 
                    // 2. [新增] 序列化 UI 互动历史 (玩家看)
                    data: H_Data.serialize(),
                    // 3. [新增] 序列化 LLM 长期记忆 (AI 看)
                    memory: H_Memory.serialize()
                },
                
                // Memory系列
                plotMemory: Plot_Memory.serialize(),
                chatMemory: Chat_Memory.serialize(),
                npcMemory: Npc_Memory.serialize(),
                partyMemory: Party_Memory.serialize(),
                hStateMemory: H_State_Memory.serialize(),

                system: { version: "1.0" } // 版本号
            };

            const gameData = JSON.parse(JSON.stringify(rawGameData));
            const success = await storage.save(slotId, gameData);

            if (success) {
                addLog("✅ 存档保存成功");
                await refreshSaveList();
                return true;
            }
            return false;
        } catch (err) {
            addLog(`❌ 保存出错: ${err.message}`);
            return false;
        } 
    };

    // ==========================================
    // 3. 读取逻辑 (Deserialize)
    // ==========================================

    const executeLoad = async () => {
        const slotId = store.saveSystem.selectedId;
        if(!slotId) return false;

        addLog(`📂 正在读取 Slot-${slotId}...`);

        try {
            const storage = getGameStorage();
            const fullData = await storage.load(slotId);
            
            if(fullData) {
                // A. 恢复玩家数据(恢复全队数据)
                if (fullData.party && Array.isArray(fullData.party)) {
                    // 如果存档里有 party 数组，直接映射回 CharacterModel 实例
                    store.party = fullData.party.map(data => new CharacterModel(data));
                } 
                else if (fullData.player) {
                    // 兼容旧存档: 如果只有 player，就把它作为队长，其他人丢失 (或由 PartyManager 后续补全)
                    store.party = [new CharacterModel(fullData.player)];
                    addLog("⚠️旧版存档: 仅恢复了队长数据", 'warning');
                }
                
                // 🟢 新增：恢复游戏时间
                if (fullData.gameTime) {
                    Object.assign(store.gameTime, fullData.gameTime);
                }

                // 🟢 [新增] 恢复全局配置
                if (fullData.config) {
                    // 我们采用分模块合并策略，确保旧存档缺少某些新配置项时，能保留默认值
                    // 1. 恢复战斗配置
                    if (fullData.config.battle) {
                        // 深度合并 difficulty, rng, mechanics 等子对象
                        Object.keys(fullData.config.battle).forEach(key => {
                            if (store.config.battle[key]) {
                                Object.assign(store.config.battle[key], fullData.config.battle[key]);
                            }
                        });
                    }
                    // 2. 恢复 AI 配置
                    if (fullData.config.ai) {
                        Object.assign(store.config.ai, fullData.config.ai);
                    }
                    // 3. 恢复地图配置
                    if (fullData.config.map) {
                        Object.assign(store.config.map, fullData.config.map);
                    }
                    console.log("⚙️ 个性化配置已加载");
                }

                // B. 恢复剧情状态
                if(fullData.story) {
                    Object.assign(store.activeQuest, fullData.story.active_quest);
                    
                    //  恢复任务系统
                    if (fullData.story.side_quests) {
                        store.sideQuests = fullData.story.side_quests;
                    }
                    if (fullData.story.quest_system) {
                        // 使用 Object.assign 确保 store.questSystem 的响应性不丢失
                        // 或者逐个数组替换
                        store.questSystem.mainLine = fullData.story.quest_system.mainLine || [];
                        store.questSystem.sideLine = fullData.story.quest_system.sideLine || [];
                        store.questSystem.history  = fullData.story.quest_system.history  || [];
                    }
                }
                
                // C. 恢复地图世界
                if (fullData.map && window.mapManager) {
                    // 1. 调用 MapSerializer 进行反序列化 (这是你上传的那个文件的逻辑)
                    // 注意：deserialize 是同步的，执行完后 window.mapManager.registry.maps 就已经有数据了
                    window.mapManager.deserialize(fullData.map);
                    
                    // 注入摄像机恢复数据
                    // 我们将数据挂载到 pendingCameraState，等待 ExplorationScene.refreshMap() 被触发时读取
                    // 这实现了 SaveSystem 与 3D 渲染逻辑的解耦
                    if (fullData.camera) {
                        window.mapManager.pendingCameraState = fullData.camera;
                        console.log("📷 摄像机数据已装载，等待场景重绘...");
                    }

                    // 2. 恢复位置指针 (针对新旧存档的兼容处理)
                    if (fullData.playerLocation) {
                        const { mapId, nodeId } = fullData.playerLocation;
                        if (mapId) window.mapManager.switchMap(mapId);
                        if (nodeId && window.mapManager.currentMap) {
                            window.mapManager.currentMap.currentNodeId = nodeId;
                        }
                    } else {
                        // 旧存档兼容：MapSerializer 恢复后，currentMap 应该已经有了，
                        // 我们直接信任存档里记录的 activeMapId 和内部的 currentNodeId
                        console.log("[Load] 旧存档模式：信任 MapSerializer 恢复的数据");
                    }

                    // ============================================================
                    // 🟢 [修正版] 仅仅同步显示，绝不修改数据
                    // ============================================================
                    
                    // 延迟 200ms：确保在 [UI] 启动游戏流程 (useNavigation.js) 执行完毕后再刷新
                    // 之前的 50ms 可能太短，被后续的初始化覆盖了
                    setTimeout(() => {
                        console.group("🖥️ [Load UI Sync] 最终画面同步");
                        
                        if (window.mapManager.currentMap && window.uiStore) {
                            const currentMap = window.mapManager.currentMap;
                            // 获取存档中记录的当前位置
                            const currentNodeId = currentMap.currentNodeId;
                            const currentNode = currentMap.nodes.find(n => n.id === currentNodeId);

                            console.log(`定位目标: Map=${currentMap.name}, Node=${currentNode ? currentNode.name : '未知'}`);

                            // ❌ [删除] 绝对不要修改 state！
                            // if (currentNode) currentNode.state = 2; <--- 删掉这行，信任存档数据

                            // 1. 强制覆盖 HUD 文本 (解决 "正在定位..." 问题)
                            if (window.uiStore.worldState) {
                                window.uiStore.worldState.mapName = currentMap.name || "未知区域";
                                window.uiStore.worldState.nodeName = currentNode ? currentNode.name : "未知位置";
                            }
                            
                            // 2. 同步任务目标显示
                            if (window.uiStore.activeQuest && currentNode) {
                                // 只有当显示还是默认值时才覆盖
                                if (!window.uiStore.activeQuest.target || window.uiStore.activeQuest.target.includes('正在定位')) {
                                     window.uiStore.activeQuest.title = currentMap.name;
                                     window.uiStore.activeQuest.target = currentNode.name;
                                }
                            }

                            // 3. 强制触发 Phaser 渲染 (让 3D 摄像机对准当前节点)
                            window.uiStore.tempMapData = Date.now();
                            
                            console.log("✅ UI 已根据存档数据强制刷新");
                        }
                        console.groupEnd();
                    }, 200); // 增加到 200ms，避开 useNavigation 的初始化
                    // ============================================================
                }

                // 🟢 D. 核心修改：恢复多频道对话记录
                if (fullData.dialogue && fullData.dialogue.channels) {
                    // 1. 恢复所有频道历史
                    ChatData.channels = fullData.dialogue.channels;
                    // 2. 恢复上次停留的频道
                    ChatData.activeChannelId = fullData.dialogue.activeChannelId || 'main';
                    // ✨ 3. 新增：恢复气泡显示进度
                    // 如果存档里有记录进度，则恢复；如果是旧存档(undefined)，默认显示所有(9999)，避免老玩家重点
                    if (fullData.dialogue.visibleBubbleCount !== undefined) {
                        ChatData.visibleBubbleCount = fullData.dialogue.visibleBubbleCount;
                    } else {
                        // 兼容旧存档：直接全部展开，避免还要一个个点
                        ChatData.visibleBubbleCount = 9999; 
                    }
                    addLog("📡 神经通讯记录已同步");
                } else {
                    // 兼容旧存档：如果没找到新结构，初始化一个空的主线
                    ChatData.registerChannel('main', '主线通讯', 'MAIN');
                }

                // [核心新增] 恢复 H 系统持久化数据
                if (fullData.hSystem) {
                    // 1. 恢复 H 属性
                    const restoredStates = {};
                    const statesData = fullData.hSystem.states || {};
                    for (let charId in statesData) {
                        restoredStates[charId] = new HState(charId, statesData[charId]);
                    }
                    store.hData = restoredStates;

                    // 🟢 [补丁] 重新链接到队伍成员身上 (Re-link)
                    if (store.party && Array.isArray(store.party)) {
                        store.party.forEach(member => {
                            if (store.hData[member.id]) {
                                member.hStatus = store.hData[member.id];
                            }
                        });
                    }

                    // 2. [新增] 恢复 UI 互动历史
                    // 注意：fullData.hSystem.data 对应 H_Data.serialize() 的返回值
                    if (fullData.hSystem.data) {
                        H_Data.deserialize(fullData.hSystem.data);
                    } else {
                        // 兼容旧存档，初始化为空
                        H_Data.deserialize(null);
                    }

                    // 3. [新增] 恢复 LLM 长期记忆
                    if (fullData.hSystem.memory) {
                        H_Memory.deserialize(fullData.hSystem.memory);
                    } else {
                        H_Memory.deserialize(null);
                    }
                }

                // 恢复设计情节与任务
                if (fullData.plotMemory) {
                    Plot_Memory.deserialize(fullData.plotMemory);
                }
                // 恢复对话记忆
                if (fullData.chatMemory) {
                    Chat_Memory.deserialize(fullData.chatMemory);
                } else {
                    // 兼容旧存档：如果没有 chatMemory，初始化为空
                    Chat_Memory.deserialize({}); 
                }

                // 恢复 NPC 档案
                if (fullData.npcMemory) {
                    Npc_Memory.deserialize(fullData.npcMemory);
                } else {
                    Npc_Memory.deserialize({}); // 兼容旧存档
                }

                // 恢复队友记忆
                if (fullData.partyMemory) {
                    Party_Memory.deserialize(fullData.partyMemory);
                } else {
                    Party_Memory.deserialize({}); // 兼容旧存档
                }

                // 恢复动态 H 描述模板
                if (fullData.hStateMemory) {
                    H_State_Memory.deserialize(fullData.hStateMemory);
                } else {
                    // 兼容旧存档：初始化为空，依靠后续逻辑补全
                    H_State_Memory.deserialize({}); 
                }

                // 兼容性检查：确保当前队伍中的每位女性角色都有 H 描述模板
                // 如果是旧存档，或者有新加入的角色数据缺失，这里会补全
                if (store.party && Array.isArray(store.party)) {
                    store.party.forEach(member => {
                        // 宽松判断性别
                        const sex = member.sex ? member.sex.toUpperCase() : 'UNKNOWN';
                        if (sex === 'FEMALE') {
                            // initForCharacter 内部会自动检查是否存在，存在则跳过，安全高效
                            H_State_Memory.initForCharacter(member.id);
                        }
                    });
                }

                addLog("✅ 记忆回溯成功");
                return true;
            }
            return false;
        } catch(e) {
            addLog("❌ 读取失败: " + e.message);
            return false;
        } 
    };

    // ==========================================
    // 4. 删除逻辑 (保持不变)
    // ==========================================
    const executeDelete = async () => {
        const slotId = store.saveSystem.selectedId;
        if(!slotId) return;
        try {
            const storage = getGameStorage();
            if (storage) {
                const success = await storage.delete(slotId);
                if(success) {
                    store.saveSystem.previewData = null;
                    await refreshSaveList();
                    addLog("🗑️ 存档已删除");
                }
            }
        } catch(e) { addLog("❌ 删除异常: " + e.message); }
        
    };

    return { refreshSaveList, selectSaveSlot, switchSaveMode, executeSave, executeLoad, executeDelete };
}