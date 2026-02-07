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

// src/ui/modules/useCombat.js
import { store, addLog, resetStore } from './store.js';
import { useNavigation } from './useNavigation.js'; 
import { Chat_Memory } from '../../LLM/memory/Chat_Memory.js';

// 使用 try-import 模式避免循环引用导致 Crash
import { ChatData } from './ChatData.js';

export function useCombat() {
    
    const { setGameCanvasVisible } = useNavigation();

    const handleBattleEnd = async (result) => {

        console.log("%c[DEBUG] handleBattleEnd 被触发!", "color: red; font-size: 20px; font-weight: bold;");
        
        // 1. 第一优先级：强制关闭战斗 UI
        store.combat.isActive = false;

        const context = store.combat.context || {};
        
        try {
            // 2. 胜利处理逻辑
            if (result.outcome === 'victory') {
                const player = store.playerState;

                // --- A. 发放奖励 ---
                if (result.gold > 0) {
                    player.gold += result.gold;
                    if (store.resources) store.resources.gold = player.gold;
                }
                if (result.exp > 0) {
                    player.gainExp(result.exp);
                    store.playerStats.level = player.level;
                    store.playerStats.exp = player.exp;
                    store.playerStats.maxHp = player.maxHp;
                }
                
                // 🟢 修复：处理物品放入逻辑
                if (result.items && result.items.length > 0) {
                    console.log("🎁 [useCombat] 准备发放物品:", result.items);
                    result.items.forEach(itemOrId => {
                        console.log("   -> 添加:", itemOrId);
                        player.addItemToInventory(itemOrId, 1);
                    });
                    console.log("🎒 [useCombat] 发放后背包状态:", player.inventory);
                }
                
                // 同步状态
                store.playerStats.hp = player.hp;
                store.playerStats.mp = player.mp;
                addLog(`战斗胜利！获得 金币:${result.gold} 经验:${result.exp}`);

                // --- B. 记忆与日志 ---
                const enemyNames = store.combat.enemies ? store.combat.enemies.map(e => e.name).join("、") : "敌人";
                const currentTime = store.worldState ? store.worldState.timeDisplay : "未知时间";
                const currentLocation = store.worldState ? store.worldState.mapName : "未知地点";
                // 删除: currentMapId 变量定义 (不再需要)

                // 删除: Node_Memory.addCombatRecord 调用代码块

                if (context.source === 'script_encounter') {
                    if (ChatData && typeof ChatData.appendSystemLog === 'function') {
                        // UI注入时间与地点的格式化日志
                        const victoryText = `> [${currentTime} @ ${currentLocation}] [战斗胜利] 经过一番苦战，你成功击败了 ${enemyNames}。`;
                        // 它会将系统日志追加到上一个气泡中，并且使用正确的 [{ role: 'system', text: ... }] 格式
                        if (ChatData && typeof ChatData.appendSystemToLatest === 'function') {
                            ChatData.appendSystemToLatest(victoryText);
                        } else {
                            // 兜底：如果新方法不存在（极低概率），再回退到旧方法
                            ChatData.appendSystemLog(victoryText);
                        }
                        // 同步写入 LLM 记忆
                        // 使用当前激活的频道 (通常是 main)，或者硬编码 'main'
                        const targetChannel = ChatData.activeChannelId || 'main';
                        Chat_Memory.appendSystemLog(targetChannel, victoryText);
                    }
                }

                // --- C. 路由跳转 ---
                if (context.source === 'script_encounter') {
                    console.log("[DEBUG] 返回对话界面");
                    store.isDialogueActive = true; 
                } 
                else if (context.source === 'choice_event') {
                    // 🟢 修复：检查是否需要彻底结束事件
                    const returnStage = context.returnStageId;
                    
                    // 如果标记为 __EVENT_COMPLETE__，说明战斗就是该分支的结局，直接关闭抉择 UI
                    if (!returnStage || returnStage === '__EVENT_COMPLETE__') {
                        console.log("[DEBUG] 剧情战斗结束，事件完结，关闭抉择层。");
                        store.choice.isActive = false;
                        
                        // 确保彻底清理 ChoiceSystem 的内部引用（如 timer, script data）
                        if (window.ChoiceSystem && typeof window.ChoiceSystem.close === 'function') {
                            window.ChoiceSystem.close();
                        }
                        
                        // 恢复游戏主画面可见性
                        store.currentMenu = 'none';
                        setGameCanvasVisible(true);
                    } else {
                        // 只有明确指定了下一阶段（例如战败分支、或者战后对话），才切回抉择界面
                        console.log(`[DEBUG] 返回抉择界面，跳转阶段: ${returnStage}`);
                        store.choice.isActive = true;
                        
                        // 尝试自动渲染下一阶段
                        if (window.ChoiceSystem && typeof window.ChoiceSystem.renderStage === 'function') {
                            window.ChoiceSystem.renderStage(returnStage);
                        }
                    }
                }
                else {
                    // 🟢 [新增] 1. 注入战斗胜利消息 (针对地图战斗 map_node)
                    if (ChatData && typeof ChatData.appendSystemLog === 'function') {
                        // 使用之前定义好的变量
                        const victoryText = `> [${currentTime} @ ${currentLocation}] [战斗胜利] 经过一番苦战，你成功击败了 ${enemyNames}。`;
                        
                        // A. UI 显示
                        // 它会将系统日志追加到上一个气泡中，并且使用正确的 [{ role: 'system', text: ... }] 格式
                        if (ChatData && typeof ChatData.appendSystemToLatest === 'function') {
                            ChatData.appendSystemToLatest(victoryText);
                        } else {
                            // 兜底：如果新方法不存在（极低概率），再回退到旧方法
                            ChatData.appendSystemLog(victoryText);
                        }
                        
                        // B. 记忆写入 (使用当前地图对应的频道)
                        const targetChannel = ChatData.activeChannelId || 'main';
                        if (Chat_Memory) {
                            Chat_Memory.appendSystemLog(targetChannel, victoryText);
                        }
                    }

                    // 🟢 2. 原有的地图返回逻辑
                    console.log("[DEBUG] 返回地图探索");
                    if (window.mapManager && store.combat.battleId && typeof window.mapManager.resolveCombat === 'function') {
                        window.mapManager.resolveCombat(store.combat.battleId, 'victory');
                    }
                    store.currentMenu = 'none';
                    setGameCanvasVisible(true);
                }

            } 
            // 3. 逃跑处理
            else if (result.outcome === 'escaped') {
                addLog("成功逃离了战斗。");
                store.playerStats.hp = store.playerState.hp;
                store.playerStats.mp = store.playerState.mp;

                if (context.source === 'script_encounter') {
                    store.isDialogueActive = true;
                    // 新增: 获取当前时间与地点 (因为上方变量作用域在 if 块内，这里需要重新获取)
                   const currentTime = store.worldState ? store.worldState.timeDisplay : "未知时间";
                    const currentLocation = store.worldState ? store.worldState.mapName : "未知地点";
                    
                    const escapeText = `> [${currentTime} @ ${currentLocation}] [战斗结束] 你选择了逃跑。`;

                    // UI 日志
                    if (ChatData) ChatData.appendSystemLog(escapeText);

                    // 🟢 [新增] 同步写入 LLM 记忆
                    const targetChannel = ChatData.activeChannelId || 'main';
                    Chat_Memory.appendSystemLog(targetChannel, escapeText);
                    
                } 
                else if (context.source === 'choice_event') {
                    // 🟢 修复：检查是否需要彻底结束事件
                    const returnStage = context.returnStageId;
                    
                    // 如果标记为 __EVENT_COMPLETE__，说明战斗就是该分支的结局，直接关闭抉择 UI
                    if (!returnStage || returnStage === '__EVENT_COMPLETE__') {
                        console.log("[DEBUG] 剧情战斗结束，事件完结，关闭抉择层。");
                        store.choice.isActive = false;
                        
                        // 确保彻底清理 ChoiceSystem 的内部引用（如 timer, script data）
                        if (window.ChoiceSystem && typeof window.ChoiceSystem.close === 'function') {
                            window.ChoiceSystem.close();
                        }
                        
                        // 恢复游戏主画面可见性
                        store.currentMenu = 'none';
                        setGameCanvasVisible(true);
                    } else {
                        // 只有明确指定了下一阶段（例如战败分支、或者战后对话），才切回抉择界面
                        console.log(`[DEBUG] 返回抉择界面，跳转阶段: ${returnStage}`);
                        store.choice.isActive = true;
                        
                        // 尝试自动渲染下一阶段
                        if (window.ChoiceSystem && typeof window.ChoiceSystem.renderStage === 'function') {
                            window.ChoiceSystem.renderStage(returnStage);
                        }
                    }
                }
                else {
                    // [新增] 地图探索时的逃跑处理：触发“撤退”逻辑
                    console.log("[useCombat] 玩家逃跑，执行战术撤退...");
                    
                    if (window.mapManager && window.mapManager.navigation) {
                        // 调用我们在 MapNavigation.js 里新写的 retreat()
                        window.mapManager.navigation.retreat();
                    }

                    store.currentMenu = 'none';
                    setGameCanvasVisible(true);
                }

            } 
            // 4. 失败处理
            else if (result.outcome === 'defeat_load') {
                store.currentMenu = 'saves'; 
            } else if (result.outcome === 'defeat_main_menu') {
                resetStore();              
                setGameCanvasVisible(false); 
            }

        } catch (err) {
            console.error("%c[DEBUG] 发生严重错误:", "color: red; font-size: 16px;", err);
            store.currentMenu = 'none';
            setGameCanvasVisible(true);
        } finally {
            // 清理数据
            store.combat.enemies = [];
            store.combat.battleId = null;
            store.combat.context = null;
        }
    };

    return {
        handleBattleEnd
    };
}