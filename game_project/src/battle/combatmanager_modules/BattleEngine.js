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

/**
 * src/battle/combatmanager_modules/BattleEngine.js
 * 负责战斗的核心执行逻辑：AP排序、异步流程控制、指令解析与AI决策
 * 
 */
import { GameDatabase } from '../../config/GameDatabase.js';
import { store } from '../../ui/modules/store.js'

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const waitTime = store.config.battle.Settings.animationSpeed;

/**
 * 1. 计算行动力并排序
 */
export function calculateSpeedAndOrder(manager) {
    manager.state.actors.forEach(actor => {
        if (actor.hp > 0) {
            actor.calculateActionPoints();
        } else {
            actor.actionPoints = -1;
        }
    });

    manager.state.actionOrder = [...manager.state.actors]
        .filter(a => a.hp > 0)
        .sort((a, b) => b.actionPoints - a.actionPoints);
}

/**
 * 2. 核心执行引擎
 */
export async function executeTurn(manager) {
    manager.state.phase = 'execution';
    
    if (typeof manager.disablePlayerActions === 'function') manager.disablePlayerActions();
    document.getElementById('phase-indicator').textContent = "战斗执行中...";
    document.getElementById('phase-indicator').style.color = "#ff4444";

    // 🟢 新增：Try-Catch 块，防止任何脚本错误导致游戏卡死
    try {
        for (const actor of manager.state.actionOrder) {
            if (actor.hp <= 0) continue;
            if (manager.state.phase === 'ended') break;

            // UI 焦点切换
            document.querySelectorAll('.player-card, .enemy-card').forEach(c => c.classList.remove('active'));
            const card = document.getElementById(`${actor.id}-card`);
            if (card) card.classList.add('active');

            let command;
            if (actor.isPlayer) {
                if (manager.state.fleeFailed) {
                    manager.addLogEntry(`${actor.name} 陷入混乱！`, 'system');
                    await sleep(waitTime * 0.5);
                    continue;
                }
                command = manager.state.commandQueue.find(c => c.actorId === actor.id) || 
                          { actorId: actor.id, type: 'defend' };
            } else {
                command = generateEnemyCommand(manager, actor);
            }

            await sleep(waitTime * 0.5);
            await processCommand(manager, command); // 执行
            
            // 刷新 UI
            if (typeof manager.updateCharacterUI === 'function') {
                manager.updateCharacterUI(manager);
            }

            // 死亡缓冲检查
            const enemiesAlive = manager.state.actors.some(a => !a.isPlayer && a.hp > 0);
            const playersAlive = manager.state.actors.some(a => a.isPlayer && a.hp > 0);

            if (!enemiesAlive || !playersAlive) {
                await sleep(waitTime * 1.2); 
                if (manager.checkBattleEnd(manager)) break; 
            }
            
            await sleep(waitTime * 0.8);
        }
    } catch (error) {
        // 🟢 捕获错误，防止卡死
        console.error("❌ 战斗执行阶段发生致命错误:", error);
        manager.addLogEntry(`系统错误: ${error.message}`, 'system');
    }

    if (manager.state.phase !== 'ended') {
        endTurnPhase(manager);
    }
}

/**
 * 3. 指令解析器 (🟢 重点修复区域)
 */
export async function processCommand(manager, cmd) {
    const actor = manager.state.actors.find(a => a.id === cmd.actorId);
    let target = cmd.targetId ? manager.state.actors.find(a => a.id === cmd.targetId) : null;

    if (actor && target && actor.id !== target.id) { // 排除对自己施法的情况
        const isSameFaction = actor.isPlayer === target.isPlayer;
        
        // 临时解析技能（如果是技能指令）来判断意图
        let isSupportSkill = false;
        if (cmd.type === 'skill') {
            const tempSkill = (typeof cmd.skillData === 'object') ? cmd.skillData : GameDatabase.Skills[cmd.skillData];
            if (tempSkill && tempSkill.targetType === 'ally') {
                isSupportSkill = true;
            }
        }

        // 判定：如果同阵营 且 不是辅助技能 -> 判定为误伤逻辑，强制重定向
        if (isSameFaction && !isSupportSkill) {
            // console.warn(`[BattleEngine] 阻止了 ${actor.name} 对友军 ${target.name} 的攻击，正在重定向...`);
            
            // 寻找敌对阵营的活人
            const validTargets = manager.state.actors.filter(a => a.isPlayer !== actor.isPlayer && a.hp > 0);
            
            if (validTargets.length > 0) {
                target = validTargets[Math.floor(Math.random() * validTargets.length)];
                // 隐式修正 cmd 里的 id，虽然下面逻辑主要用 target 对象
                cmd.targetId = target.id; 
            } else {
                // 如果没有敌人了（战斗结束边缘），直接中止
                return;
            }
        }
    }

    if (cmd.type === 'stunned') {
        manager.addLogEntry(`${actor.name} 眩晕中...`, 'system');
        return;
    }

    if (cmd.type === 'attack' || cmd.type === 'skill') {
        if (!target || target.hp <= 0) {
            // 1. 判断原本的意图是“有益(找队友)”还是“有害(找敌人)”
            let isFriendlyAction = false;

            if (cmd.type === 'skill') {
                // 安全获取技能数据（支持 ID 字符串或动态对象）
                const skillData = cmd.skillData;
                const skill = (typeof skillData === 'object') 
                    ? skillData 
                    : GameDatabase.Skills[skillData];

                // 如果是针对盟友的技能（治疗/Buff），标记为友好动作
                if (skill && skill.targetType === 'ally') {
                    isFriendlyAction = true;
                }
            }

            // 2. 根据意图筛选合法的存活目标
            const potentialTargets = manager.state.actors.filter(a => {
                const isAlive = a.hp > 0;
                // 判断阵营关系
                const isSameFaction = (a.isPlayer === actor.isPlayer);
                
                // 如果是友好动作，找同阵营活人；如果是攻击，找敌对阵营活人
                return isAlive && (isFriendlyAction ? isSameFaction : !isSameFaction);
            });

            // 3. 执行重定向
            if (potentialTargets.length > 0) {
                // 随机选择一个新目标
                target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
                
                // 更新指令中的 targetId，保持数据一致性
                cmd.targetId = target.id;
                
                manager.addLogEntry(`${actor.name} 原定目标已倒下，转而对 ${target.name} 行动`, 'system');
            } else {
                // 场上没有符合条件的目标了
                manager.addLogEntry(`${actor.name} 茫然地停下了动作（失去目标）`, 'system');
                return;
            }
        }
    }

    // 分支处理
    if (cmd.type === 'attack') {
        const result = actor.attackTarget(target);
        handleCombatResult(manager, actor, target, result);
    } 
    else if (cmd.type === 'skill') {
        const skill = (typeof cmd.skillData === 'object') ? cmd.skillData : GameDatabase.Skills[cmd.skillData];
        const baseMpCost = (skill.cost && skill.cost.mp) ? skill.cost.mp : 0;
        const actualMpCost = Math.floor(baseMpCost * store.config.battle.Mechanics.mpCostMultiplier);
        if (actualMpCost > 0) actor.mp = Math.max(0, actor.mp - actualMpCost);

        const result = actor.attackTarget(target, skill);
        handleCombatResult(manager, actor, target, result, skill);

    } 
    else if (cmd.type === 'defend') {
        actor.isDefending = true;
        manager.addLogEntry(`${actor.name} 防御姿态`, 'system');
    }
    // 🟢 道具逻辑：共享背包扣除
    else if (cmd.type === 'item') {
        const item = manager.itemsData[cmd.itemId] || GameDatabase.Items[cmd.itemId];
        if (!item) return;

        // 🟢 修复点：查找真正的背包持有者进行扣除
        const inventoryHolder = manager.getPartyInventoryHolder(); // 获取队长
        
        if (inventoryHolder && inventoryHolder.sourceModel && typeof inventoryHolder.sourceModel.removeItemFromInventory === 'function') {
            inventoryHolder.sourceModel.removeItemFromInventory(cmd.itemId, 1);
        } else {
            console.warn(`无法扣除道具 ${cmd.itemId}: 未找到背包持有者`);
        }
        
        manager.state.itemsUsed++;

        // 效果执行 (增加 NaN 检查)
        if (['RESTORE_HP_PERCENT', 'RESTORE_MP_PERCENT', 'RESTORE_BOTH_PERCENT'].includes(item.effect_type)) {
            let healHp = 0;
            let healMp = 0;
            const val = item.value || 0; // 防止 NaN

            if (item.effect_type.includes('HP') || item.effect_type.includes('BOTH')) {
                healHp = Math.floor(target.maxHp * val);
            }
            if (item.effect_type.includes('MP') || item.effect_type.includes('BOTH')) {
                healMp = Math.floor(target.maxMp * val);
            }

            if (healHp > 0) target.hp = Math.min(target.maxHp, target.hp + healHp);
            if (healMp > 0) target.mp = Math.min(target.maxMp, target.mp + healMp);

            const msgParts = [];
            if (healHp > 0) msgParts.push(`HP+${healHp}`);
            if (healMp > 0) msgParts.push(`MP+${healMp}`);
            manager.addLogEntry(`${actor.name} 使用 ${item.name}，${msgParts.join(' / ')}`, 'heal');
        } 
        else if (item.effect_type === 'BUFF_STAT') {
            let type = 'unknown';
            // 安全检查：防止 item.stat 为空导致 includes 报错
            const statName = item.stat || ''; 
            if (statName.includes('atk')) type = 'attack';
            else if (statName.includes('def')) type = 'defense';
            else if (statName.includes('speed')) type = 'speed';
            else if (statName.includes('crit')) type = 'critRate';

            if (typeof target.applyBuff === 'function') {
                target.applyBuff({
                    type: type,
                    value: item.value, 
                    duration: item.duration || 3,
                    level: 1
                });
                manager.addLogEntry(`${actor.name} 对 ${target.name} 使用 ${item.name}，状态提升！`, 'buff');
            }
        }
    }
}

/**
 * 4. 敌人 AI 决策 (🟢 修复：增强目标识别，防止误伤友军)
 */
export function generateEnemyCommand(manager, enemy) {
    if (enemy.isStunned) return { actorId: enemy.id, type: 'stunned' };
    
    // 获取存活的阵营列表
    const alivePlayers = manager.state.actors.filter(a => a.isPlayer && a.hp > 0);
    const aliveAllies = manager.state.actors.filter(a => !a.isPlayer && a.hp > 0);

    // 如果玩家全灭，这就没必要计算了（虽然 executeTurn 会处理）
    if (alivePlayers.length === 0) return { actorId: enemy.id, type: 'defend' };

    // 筛选可用技能
    const availableSkills = (enemy.skills || []).filter(sData => {
        const s = (typeof sData === 'object') ? sData : GameDatabase.Skills[sData];
        // 增加安全检查 s && ...
        if (!s) return false;
        const cost = (s.cost?.mp || 0) * store.config.battle.Mechanics.mpCostMultiplier;
        return enemy.mp >= cost;
    });

    let cmd = { actorId: enemy.id, type: 'attack' };

    // 50% 概率尝试使用技能
    if (availableSkills.length > 0 && Math.random() < 0.5) {
        const skillData = availableSkills[Math.floor(Math.random() * availableSkills.length)];
        const skill = (typeof skillData === 'object') ? skillData : GameDatabase.Skills[skillData];
        
        cmd.type = 'skill';
        cmd.skillData = skillData;
        
        // 🟢 目标选择逻辑修正
        if (skill.targetType === 'ally') {
            // 辅助技能：优先给受伤最重的友军（或者自己）
            // 简单起见：随机选择一个存活的友军
            if (aliveAllies.length > 0) {
                cmd.targetId = aliveAllies[Math.floor(Math.random() * aliveAllies.length)].id;
            } else {
                cmd.targetId = enemy.id; // 兜底给自己
            }
        } else {
            // 进攻技能：随机选择一个玩家
            cmd.targetId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
        }
    }

    // 如果是普通攻击，或者技能逻辑没能设定目标
    if (cmd.type === 'attack' || !cmd.targetId) {
        cmd.type = 'attack'; // 确保类型回退为攻击
        cmd.targetId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
    }

    return cmd;
}

/**
 * 5. 战斗结果反馈
 * 🟢 [修复] 修正了特效触发位置和重复统计问题
 */
function handleCombatResult(manager, actor, target, result, skill = null) {
    if (result.dodged) {
        manager.addLogEntry(`${target.name} 闪避！`, 'system');
        return;
    }

    if (result.damage > 0) {
        const skillName = skill ? skill.name : "普通攻击";
        let logType = 'damage';
        let logMessage = `${actor.name} ${skillName} 命中 ${target.name}，造成 ${result.damage} 伤害`;

        if (result.isAdvantage) {
            logMessage += ` <span style="color: #ff4444; font-weight: bold;">(克制!)</span>`;
        }

        if (result.critical) {
            logMessage += ` <span style="color: #ffcc00; font-weight: bold;">(暴击!!)</span>`;
            logType = 'critical';
        }

        logMessage += "！";
        manager.addLogEntry(logMessage, logType);
        
        // 统计数据累加 (仅在有伤害时)
        if (actor.isPlayer) manager.state.totalDamageDealt += result.damage;
        else manager.state.totalDamageTaken += result.damage;

        // 🟢 [修复] 正确位置：仅在造成实质伤害时，触发受击震动特效
        // 必须放在 damage > 0 的判断块内部！
        if (typeof manager.triggerShakeEffect === 'function') {
            manager.triggerShakeEffect(target.id);
        }
    }
    
    // --- 状态应用日志 (支持复合技能) ---
    if (result.effectDetails && result.effectDetails.length > 0) {
        
        result.effectDetails.forEach(outcome => {
            // 1. 如果生效了
            if (outcome.isSuccess) {
                if (outcome.type === 'STUN') {
                    manager.addLogEntry(` <span style="color: #ffcc00;">[效果]</span> ${target.name} 陷入了 眩晕！`, 'system');
                } 
                else if (outcome.type === 'DOT') {
                    manager.addLogEntry(` <span style="color: #2ecc71;">[效果]</span> ${target.name} 感染了 ${outcome.name}！`, 'system');
                } 
                else if (outcome.type === 'BUFF') {
                    if (outcome.name === '属性削弱') {
                        manager.addLogEntry(` <span style="color: #aa66cc;">[效果]</span> ${target.name} ${outcome.name}！`, 'buff');
                    } else {
                        manager.addLogEntry(` <span style="color: #3498db;">[效果]</span> ${target.name} ${outcome.name}！`, 'buff');
                    }
                }
                else if (outcome.type === 'HEAL') {
                    manager.addLogEntry(` <span style="color: #44ff44;">[治疗]</span> ${target.name} 恢复了 ${outcome.value} 点生命`, 'heal');
                }
            } 
            // 2. 如果失败了 (概率未命中)
            else {
                // 使用灰色或暗淡颜色表示失效
                manager.addLogEntry(` <span style="color: #888;">[抵抗]</span> ${target.name} 抵抗了 ${outcome.name}效果`, 'system');
            }
        });
    }
}

/**
 * 6. 回合结束清理
 */
async function endTurnPhase(manager) {
    manager.state.turn++;
    manager.addLogEntry(`=== 第 ${manager.state.turn} 回合 ===`, 'system');
    
    let anyDotDamage = false; // 用于标记是否有DOT发生，可选

    manager.state.actors.forEach(actor => {
        if (actor.hp > 0) {
            // 🟢 结算 DOT 并获取伤害数值
            const dotDamage = actor.updateEffects(); 
            
            // 🟢 如果有伤害，打印日志
            if (dotDamage > 0) {
                manager.addLogEntry(` ${actor.name} 受到持续伤害 -${dotDamage} HP`, 'damage');
                anyDotDamage = true;
                
                // 建议：可以在这里触发一下受击震动，视觉效果更好
                if (typeof manager.triggerShakeEffect === 'function') {
                    manager.triggerShakeEffect(actor.id);
                }
            }
            
            actor.isDefending = false;
        }
    });

    // ✅ [核心修复] 立即刷新 UI，让血条在进入下一回合的等待前就发生变化
    if (typeof manager.updateCharacterUI === 'function') {
        manager.updateCharacterUI();
    }
    
    manager.state.fleeFailed = false;
    
    // 这里的 waitTime 是回合间的停顿，现在血条会在这个停顿*之前*就更新
    await sleep(waitTime);
    
    manager.startInputPhase();
}