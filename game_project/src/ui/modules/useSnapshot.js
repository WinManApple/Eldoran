/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// src/ui/modules/useSnapshot.js

import { reactive } from '../../../lib/vue.esm-browser.js';
import { store, addLog } from './store.js';
import { ChatData } from './ChatData.js';
import { HInteractionSystem } from '../../systems/HInteractionSystem/HInteractionSystem.js';
import { H_Data } from './H_Data.js';
import { HState } from '../../systems/HInteractionSystem/H_State.js';

// 引入记忆模块
import { Plot_Memory } from '../../LLM/memory/Plot_Memory.js';
import { Chat_Memory } from '../../LLM/memory/Chat_Memory.js';
import { Npc_Memory } from '../../LLM/memory/Npc_Memory.js';
import { Party_Memory } from '../../LLM/memory/Party_Memory.js';
import { H_Memory } from '../../LLM/memory/H_Memory.js';
import { CharacterModel } from '../../systems/PlayerState.js';
import { H_State_Memory } from '../../LLM/memory/H_State_Memory.js';
import { Action_LLM } from '../../LLM/actions/Action_LLM.js';

// 模块级变量，用于暂存脚本执行前的纯净状态
let tempBaseline = null;

/**
 * 深拷贝工具
 */
const deepClone = (obj) => {
    if (obj === undefined || obj === null) return obj;
    try { 
        return JSON.parse(JSON.stringify(obj)); 
    } catch (e) { 
        console.error("Snapshot Clone Error:", e, obj); 
        return null; 
    }
};

// 🟢 [新增] 移植过来的相机获取工具
const getPhaserCamera = () => {
    if (window.currentMapCamera) return window.currentMapCamera;
    try {
        const scene = window.game?.scene?.getScene('ExplorationScene');
        return scene?.mapRenderer?.camera;
    } catch (e) { return null; }
};

// 快照数量限制
const snap_shot_count = 10;

// 🟢 [新增] 内部辅助：构建快照数据包 (从原 capture 中提取)
const _createSnapshotData = (label) => {
    // 🟢 [新增] 抓取相机数据 (逻辑保持不变)
    let cameraData = null;
    const cam = getPhaserCamera();
    if (cam && typeof cam.serialize === 'function') {
        cameraData = cam.serialize();
    }

    return {
        timestamp: Date.now(),
        label: label,
        
        // --- 1. Store 基础状态 ---
        store: {
            isDialogueActive: store.isDialogueActive,
            currentMenu: store.currentMenu,
            worldState: deepClone(store.worldState || {}),
            gameTime: deepClone(store.gameTime || {}),
            activeQuest: deepClone(store.activeQuest),
            playerStats: deepClone(store.playerStats || {}),
            hData: deepClone(store.hData || {}),
            party: (store.party || []).map(m => (m && typeof m.serialize === 'function') ? m.serialize() : deepClone(m))
        },
        
        // --- 2. Map ---
        map: (window.mapManager && typeof window.mapManager.serialize === 'function') 
                ? window.mapManager.serialize() 
                : null,

        camera: cameraData,
        
        location: window.mapManager ? {
            activeMapId: window.mapManager.activeMapId,
            currentNodeId: window.mapManager.currentMap ? window.mapManager.currentMap.currentNodeId : null
        } : null,
        
        // --- 3. Chat ---
        chat: {
            channels: deepClone(ChatData.channels || {}),
            activeChannelId: ChatData.activeChannelId,
            visibleBubbleCount: ChatData.visibleBubbleCount || 0
        },
        
        // --- 4. H System ---
        hSystem: {
            uiData: {
                ...(H_Data && typeof H_Data.serialize === 'function' ? H_Data.serialize() : {}),
                currentSession: deepClone(H_Data.currentSession)
            },
            runtime: {
                isActive: HInteractionSystem.isActive || false,
                status: HInteractionSystem.status || 'idle',
                targetCharIds: deepClone(HInteractionSystem.targetCharIds || []),
                activeCharId: HInteractionSystem.activeCharId,
                context: deepClone(HInteractionSystem.context || {}),
                statsMap: deepClone(HInteractionSystem.statsMap || {}),
                sessionAccumulator: deepClone(HInteractionSystem.sessionAccumulator || {}),
                actionCount: HInteractionSystem.actionCount || 0,
                totalScore: HInteractionSystem.totalScore || 0,
                currentScript: deepClone(HInteractionSystem.currentScript),
                currentChoices: deepClone(HInteractionSystem.currentChoices || []),
                settlementResult: deepClone(HInteractionSystem.settlementResult)
            }
        },
        
        // --- 5. Memory ---
        memory: {
            plot: (Plot_Memory && Plot_Memory.serialize) ? Plot_Memory.serialize() : {},
            chat: (Chat_Memory && Chat_Memory.serialize) ? Chat_Memory.serialize() : {},
            npc: (Npc_Memory && Npc_Memory.serialize) ? Npc_Memory.serialize() : {},
            party: (Party_Memory && Party_Memory.serialize) ? Party_Memory.serialize() : {},
            h: (H_Memory && H_Memory.serialize) ? H_Memory.serialize() : {},
            hState: (H_State_Memory && H_State_Memory.serialize) ? H_State_Memory.serialize() : {}
        }
    };
};

// 响应式状态
const state = reactive({
    snapshots: [], 
    isVisible: false, 
});

export const useSnapshot = () => {

    /**
     * 🟢 [新增] 初始化基准快照 (在脚本执行前调用)
     * 作用：冻结当前的纯净状态，供后续 capture 使用
     */
    const initBaseline = (scriptContent) => {
        try {
            console.log("[Snapshot] 🧊 正在冻结基准状态...");
            // 构建一份完整的数据，但不放入列表
            const baseData = _createSnapshotData("BASELINE");
            tempBaseline = {
                data: baseData,
                script: scriptContent // 记录即将执行的脚本
            };
        } catch (e) {
            console.error("[Snapshot] 基准冻结失败:", e);
        }
    };

    /**
     * 🟢 [新增] 清理基准 (在脚本执行完后调用)
     */
    const clearBaseline = () => {
        if (tempBaseline) {
            // console.log("[Snapshot] 🧊 基准状态已释放");
            tempBaseline = null;
        }
    };

    /**
     * 📸 捕获快照
     */
    const capture = (label = "系统自动保存") => {
        try {
            if (!store) return;

            // 🚫 [检查] 战斗状态禁止快照 (抉择/弹窗不禁止)
            if (store.combat?.isActive) {
                addLog("⚠️ 战斗期间无法进行快照捕获");
                return;
            }

            let finalSnapshot = null;

            // 🟢 [核心逻辑] 智能选择数据源
            if (tempBaseline) {
                // A. 如果存在基准（说明正处于脚本 await 期间）
                // 使用基准数据（纯净状态），而不是当前被脚本修改了一半的脏状态
                console.log("[Snapshot] ⚡ 检测到活跃脚本，使用基准状态进行保存");
                finalSnapshot = deepClone(tempBaseline.data);
                finalSnapshot.label = label;
                finalSnapshot.timestamp = Date.now();
                // 注入待重放的脚本
                finalSnapshot.pendingScript = tempBaseline.script;
            } else {
                // B. 普通状态：直接构建当前状态
                finalSnapshot = _createSnapshotData(label);
                console.log(`[Snapshot] 📸 完整快照已构建`);
            }

            if (finalSnapshot) {
                state.snapshots.unshift(finalSnapshot);
                if (state.snapshots.length > snap_shot_count) state.snapshots.pop();
                addLog(`快照已捕获: ${label}`);
            }

        } catch (e) {
            console.error("[Snapshot] 捕获失败:", e);
        }
    };

    /**
     * 删除快照
     */
    const remove = (index) => {
        if (state.snapshots[index]) {
            const label = state.snapshots[index].label;
            state.snapshots.splice(index, 1);
            addLog(`🗑️ 已删除快照: ${label}`);
        }
    };

    /**
     * ⏪ 回溯快照
     */
    const restore = async (index) => {
        const snap = state.snapshots[index];
        if (!snap) return false;

        console.log(`[Snapshot] ⏪ 回溯至: ${snap.label}`);
        addLog(`⏳ 时空回溯: ${snap.label}...`);

        let targetMenu = 'none';

        try {
            // 1. 恢复 Store
            if (snap.store) {
                if (typeof snap.store.isDialogueActive !== 'undefined') store.isDialogueActive = snap.store.isDialogueActive;

                if (snap.store.currentMenu) {
                    targetMenu = snap.store.currentMenu;
                }
                
                // 只读属性保护
                if(snap.store.worldState) {
                    const { timeDisplay, ...writableWorldState } = snap.store.worldState;
                    Object.assign(store.worldState, writableWorldState);
                }

                if(snap.store.gameTime) Object.assign(store.gameTime, snap.store.gameTime);
                if(snap.store.activeQuest) Object.assign(store.activeQuest, snap.store.activeQuest);
                if(snap.store.playerStats) Object.assign(store.playerStats, snap.store.playerStats);
                
                if (snap.store.hData) {
                    store.hData = {}; 
                    for (const [charId, data] of Object.entries(snap.store.hData)) {
                        store.hData[charId] = new HState(charId, data);
                    }
                }

                if (Array.isArray(snap.store.party)) {
                    store.party = snap.store.party
                        .filter(data => data)
                        .map(data => {
                            try {
                                const m = new CharacterModel(data);
                                if (store.hData && store.hData[m.id]) m.hStatus = store.hData[m.id];
                                return m;
                            } catch (err) { return null; }
                        })
                        .filter(m => m !== null);
                }

            }

            // 2. 恢复 Map 与 Camera (核心逻辑移植)
            if (snap.map && window.mapManager) {
                
                // 🟢 [Step A] 注入相机数据，防止幽灵回退
                if (snap.camera) {
                    window.mapManager.pendingCameraState = snap.camera;
                }
                
                // 🟢 [Step B] 开启全局恢复锁
                window.__RestorationContext = {
                    active: true,
                    camera: snap.camera
                };
                console.log("🔒 [Snapshot] 全局视角锁已激活");

                // [Step C] 反序列化地图
                await window.mapManager.deserialize(snap.map);
                
                // [Step D] 修正位置指针 (MapId / NodeId)
                if (snap.location && snap.location.activeMapId) {
                    window.mapManager.switchMap(snap.location.activeMapId);
                    if (window.mapManager.currentMap && snap.location.currentNodeId) {
                        window.mapManager.currentMap.currentNodeId = snap.location.currentNodeId;
                    }
                }

                // [Step E] 强制 UI 刷新与锁释放
                if (window.uiStore) {
                    window.uiStore.tempMapData = Date.now(); // 触发 ExplorationScene 刷新
                    
                    // 延迟释放锁，确保刷新完成
                    setTimeout(() => {
                        window.__RestorationContext = null;
                        console.log("🔓 [Snapshot] 全局视角锁已释放");
                        
                        // 强制再次刷新 UI 文本
                        if (window.mapManager.currentMap && window.uiStore.worldState) {
                             window.uiStore.worldState.mapName = window.mapManager.currentMap.name;
                             // ... 可以在这里加更多 UI 同步逻辑
                        }
                    }, 100);
                }
            }

            // 3. 恢复 Chat
            if (snap.chat) {
                ChatData.channels = snap.chat.channels || {};
                ChatData.activeChannelId = snap.chat.activeChannelId || 'main';
                ChatData.visibleBubbleCount = snap.chat.visibleBubbleCount || 0;
            }

            // 4. 恢复 H System
            if (snap.hSystem) {
                if (H_Data.deserialize) {
                    H_Data.deserialize(snap.hSystem.uiData);
                    if (snap.hSystem.uiData.currentSession) H_Data.currentSession = snap.hSystem.uiData.currentSession;
                }
                const rt = snap.hSystem.runtime || {};
                HInteractionSystem.isActive = !!rt.isActive;
                HInteractionSystem.status = rt.status || 'idle';
                HInteractionSystem.targetCharIds = rt.targetCharIds || [];
                HInteractionSystem.activeCharId = rt.activeCharId;
                HInteractionSystem.context = rt.context || {};
                HInteractionSystem.statsMap = rt.statsMap || {};
                HInteractionSystem.sessionAccumulator = rt.sessionAccumulator || {}; 
                HInteractionSystem.actionCount = (typeof rt.actionCount === 'number') ? rt.actionCount : 9999;
                HInteractionSystem.totalScore = rt.totalScore || 0;
                HInteractionSystem.currentScript = rt.currentScript || null;
                HInteractionSystem.currentChoices = rt.currentChoices || [];
                HInteractionSystem.settlementResult = rt.settlementResult || null;
            }

            // 5. 恢复 Memory
            if (snap.memory) {
                if(Plot_Memory.deserialize) Plot_Memory.deserialize(snap.memory.plot);
                if(Chat_Memory.deserialize) Chat_Memory.deserialize(snap.memory.chat);
                if(Npc_Memory.deserialize) Npc_Memory.deserialize(snap.memory.npc);
                if(Party_Memory.deserialize) Party_Memory.deserialize(snap.memory.party);
                if(H_Memory.deserialize) H_Memory.deserialize(snap.memory.h);
                if(H_State_Memory.deserialize) H_State_Memory.deserialize(snap.memory.hState);
            }

            // 强制重置交互状态
            // 确保回溯后，任何挂起的抉择、弹窗或战斗界面都被关闭
            // 这实现了"回到事件触发前那一刻"的效果（Promise链已断，界面需复位）
            if (store.choice) store.choice.isActive = false;
            if (store.transition) store.transition.isActive = false;
            // 如果快照数据里没有战斗状态（通常capture时拦截了战斗），这里也强制关闭
            if (store.combat && !store.combat.isActive) store.combat.isActive = false;
            
            store.currentMenu = targetMenu;

            state.isVisible = false;
            addLog("✅ 时空已重置");

            // =================================================
            // 🟢 [核心新增] 自动重放逻辑 (Auto Replay)
            // =================================================
            if (snap.pendingScript) {
                console.log("[Snapshot] 🔄 检测到挂起脚本，正在重放...");
                
                // 使用 setTimeout 将执行推迟到下一帧，确保 UI 和数据已经完全就绪
                // 且避免在 restore 的调用栈中直接触发新的 await
                setTimeout(async () => {
                    try {
                        addLog("⚡ 正在重建因果律 (脚本重放)...");
                        // 注意：这里调用 execute 会再次触发 initBaseline，这是符合预期的
                        // 因为回溯后的状态就是纯净状态，再次冻结它作为新的基准完全没问题
                        await Action_LLM.execute(snap.pendingScript);
                    } catch (e) {
                        console.error("[Snapshot] 脚本重放失败:", e);
                        addLog("❌ 因果律重建失败");
                    }
                }, 100);
            }

            return true;

        } catch (e) {
            console.error("[Snapshot] 回溯失败:", e);
            addLog(`❌ 回溯失败: ${e.message}`);
            return false;
        }
    };

    const toggleUI = () => state.isVisible = !state.isVisible;

    return { state, capture, restore, remove, toggleUI, initBaseline, clearBaseline };
};