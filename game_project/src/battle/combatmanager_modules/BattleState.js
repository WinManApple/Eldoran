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

/**
 * src/battle/combatmanager_modules/BattleState.js
 * 负责战斗状态初始化、角色实例化、奖励计算与结算逻辑
 */
import { GameDatabase } from '../../config/GameDatabase.js';
import { Combatant } from '../Combatant.js';
import { store } from '../../ui/modules/store.js';


/**
 * 1. 初始化角色对象
 */
export function initializeCharacters(manager, players, enemies) {
    manager.state.actors = [];

    // --- 实例化玩家 (🟢 新增：过滤未出战角色) ---
    // 默认 isDeployed 为 undefined 时视为 true (出战)
    const activePlayers = players.filter(p => p.isDeployed !== false);

    // --- 实例化玩家 ---
    players.forEach((p, index) => {
        let char;
        if (p.combatStats) {
            char = new Combatant(p, `player_${index + 1}`);
        } else {
            char = new Combatant(
                p.id, p.name, p.type, p.hp, p.mp, 
                p.attack, p.defense, p.level, p.element, 
                p.isPlayer, p.className,
                null, "", 
                p.skills
            );
        }
        manager.state.actors.push(char);
    });

    // --- 实例化敌人 ---
    enemies.forEach((e, index) => {
        const rawData = typeof e === 'string' ? GameDatabase.Enemies[e] : e;
        if (!rawData) return;

        const instanceData = JSON.parse(JSON.stringify(rawData));
        instanceData.id = `${rawData.id}_${index}`; 
        instanceData.type = 'enemy'; 

        const char = new Combatant(instanceData);
        manager.state.actors.push(char);
    });
}

/**
 * 2. 检查战斗是否结束
 */
export function checkBattleEnd(manager) {
    const enemiesAlive = manager.state.actors.some(a => !a.isPlayer && a.hp > 0);
    const playersAlive = manager.state.actors.some(a => a.isPlayer && a.hp > 0);

    if (!enemiesAlive) {
        endBattle(manager, 'victory');
        return true;
    } else if (!playersAlive) {
        endBattle(manager, 'defeat');
        return true;
    }
    return false;
}

/**
 * 3. 结束战斗 (进入结算状态)
 */
export function endBattle(manager, result) {
    manager.state.phase = 'ended';
    manager.state.finalResult = result;
    
    if (typeof manager.disablePlayerActions === 'function') {
        manager.disablePlayerActions();
    }
    
    // 获取原生 DOM 元素 (仅用于显示文本面板)
    const panel = document.getElementById('battle-end');
    const lootSec = document.getElementById('loot-section');

    // 清理旧状态
    if (lootSec) lootSec.style.display = 'none';

    // 更新基础统计数据
    const setSafeText = (id, val) => {
        const el = document.getElementById(id);
        if(el) el.textContent = val;
    };
    setSafeText('total-turns', manager.state.turn);
    setSafeText('total-damage', manager.state.totalDamageDealt);
    setSafeText('damage-taken', manager.state.totalDamageTaken);
    setSafeText('items-used', manager.state.itemsUsed);

    // 根据结果计算奖励
    if (result === 'victory') {
        calculateRewards(manager);
        if (typeof manager.renderLoot === 'function') manager.renderLoot();
        if (lootSec) lootSec.style.display = 'block';
    }

    // 显示黑色背景板
    if(panel) panel.classList.add('active');

    // 主动呼叫 Vue 钩子
    if (typeof manager.onBattleOver === 'function') {
        manager.onBattleOver(result);
    }
}

/**
 * 4. 计算战利品 (增强修复版)
 */
export function calculateRewards(manager) {
    manager.state.actors.forEach(actor => {
        if (!actor.isPlayer && actor.rewards) {
            // 经验与金币
            manager.state.earnedExp += Math.floor((actor.rewards.exp || 0) * store.config.battle.Difficulty.xpGainMultiplier);
            manager.state.earnedGold += actor.rewards.gold || 0;
            
            if (actor.rewards.items) {
                actor.rewards.items.forEach(drop => {
                    // 1. 计算掉落率
                    const dropChance = drop.chance !== undefined ? drop.chance : 1.0;
                    
                    if (Math.random() < dropChance) {
                        // 2. 获取掉落数量
                        const count = drop.count || 1;

                        let itemData = null;

                        // 🟢 [核心修复] 
                        // 无论来源是配置对象还是字符串，都尝试解析为【完整物品对象】
                        // 这确保传给 PlayerState 的是包含 type/stats 的富数据，
                        // 从而触发 Case A 存储逻辑，保证装备在 UI 中可见。

                        let targetId = null;

                        // 情况 A: 已经是完整的动态物品对象 (Dynamic Item)
                        // 🟢 修复：增加对 SPECIAL 类型(技能书)及含有 skillPayload 物品的放行
                        if (typeof drop === 'object' && (
                            drop.stats || 
                            drop.type === 'WEAPON' || 
                            drop.type === 'ARMOR' || 
                            drop.type === 'SPECIAL' || 
                            drop.skillPayload
                        )) {
                            itemData = drop;
                        }
                                                // 情况 B: 静态配置对象 (Config Object) -> 提取 ID
                        else if (typeof drop === 'object') {
                            targetId = drop.itemId || drop.id;
                        }
                        // 情况 C: 纯字符串 ID
                        else if (typeof drop === 'string') {
                            targetId = drop;
                        }

                        // 如果拿到了 ID，去数据库“水合” (Hydrate) 出完整数据
                        if (targetId && !itemData) {
                            itemData = GameDatabase.Items[targetId] || GameDatabase.Equipment[targetId];
                            
                            // 兜底：如果数据库没找到，就只传 ID (至少能进背包，虽然可能显示异常)
                            if (!itemData) itemData = targetId;
                        }

                        // 3. 存入奖励列表
                        if (itemData) {
                            for (let i = 0; i < count; i++) {
                                manager.state.earnedItems.push(itemData);
                            }
                            console.log(`[BattleState] 掉落处理完成:`, itemData);
                        } else {
                            console.warn("[BattleState] 无法解析掉落数据:", drop);
                        }
                    }
                });
            }
        }
    });
}

/**
 * 5. 完成并销毁战斗 (数据回写)
 */
export function finishBattle(manager, customOutcome = null) {
    console.log("[BattleState] 执行 finishBattle, 正在回写数据...");
    
    // 同步 HP/MP
    manager.state.actors.forEach(actor => {
        if (actor.isPlayer && typeof actor.syncToModel === 'function') {
            actor.syncToModel();
        }
    });

    // 确定最终结果
    const finalOutcome = customOutcome || manager.state.finalResult || 'escaped';

    const resultData = {
        outcome: finalOutcome,
        exp: manager.state.earnedExp,
        gold: manager.state.earnedGold,
        items: manager.state.earnedItems
    };
    
    if (typeof manager.cleanup === 'function') manager.cleanup();
    
    // 触发最终回调 (通知 App.js 关闭窗口)
    if (manager.onComplete) manager.onComplete(resultData);
}
