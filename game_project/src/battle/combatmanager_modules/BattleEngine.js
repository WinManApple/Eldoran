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
            const potentialTargets = manager.state.actors.filter(a => a.isPlayer !== actor.isPlayer && a.hp > 0);
            if (potentialTargets.length > 0) target = potentialTargets[0];
            else return;
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

        if (skill.effect === 'heal') {
            const amt = skill.healAmount || Math.floor(target.maxHp * 0.3);
            target.hp = Math.min(target.maxHp, target.hp + amt);
            manager.addLogEntry(`${actor.name} 治疗 ${target.name} +${amt} HP`, 'heal');
        } else {
            const result = actor.attackTarget(target, skill);
            handleCombatResult(manager, actor, target, result, skill);
        }
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
 */
function handleCombatResult(manager, actor, target, result, skill = null) {
    if (result.dodged) {
        manager.addLogEntry(`${target.name} 闪避！`, 'system');
        return;
    }

    const skillName = skill ? skill.name : "普通攻击";
    let logType = 'damage';
    // 基础日志文本
    let logMessage = `${actor.name} ${skillName} 命中 ${target.name}，造成 ${result.damage} 伤害`;

    // 🟢 1. 处理属性克制 (红色说明)
    if (result.isAdvantage) {
        logMessage += ` <span style="color: #ff4444; font-weight: bold;">(克制!)</span>`;
    }

    // 🟢 2. 处理暴击 (金色说明)
    if (result.critical) {
        logMessage += ` <span style="color: #ffcc00; font-weight: bold;">(暴击!!)</span>`;
        logType = 'critical'; // 设置为暴击类型，可配合 CSS 播放额外特效
    }

    logMessage += "！";

    // 发送最终组装的日志
    manager.addLogEntry(logMessage, logType);
    
    // --- 🟢 核心新增：状态应用日志 ---
    if (result.effectSuccess && skill) {
        if (skill.type === 'STUN') {
            manager.addLogEntry(` <span style="color: #ffcc00;">[效果]</span> ${target.name} 陷入了 眩晕！`, 'system');
        } else if (skill.type === 'DOT') {
            const dotName = skill.effect.dotType || '持续伤害';
            manager.addLogEntry(` <span style="color: #2ecc71;">[效果]</span> ${target.name} 感染了 ${dotName}！`, 'system');
        } else if (skill.type === 'ACTIVE_BUFF') {
            manager.addLogEntry(` <span style="color: #3498db;">[效果]</span> ${target.name} 获得状态提升！`, 'buff');
        }
    }

    // 触发视觉特效
    if (typeof manager.triggerShakeEffect === 'function') manager.triggerShakeEffect(target.id);
    
    // 统计数据累加
    if (actor.isPlayer) manager.state.totalDamageDealt += result.damage;
    else manager.state.totalDamageTaken += result.damage;
}

/**
 * 6. 回合结束清理
 */
async function endTurnPhase(manager) {
    manager.state.turn++;
    manager.addLogEntry(`=== 第 ${manager.state.turn} 回合 ===`, 'system');
    
    manager.state.actors.forEach(actor => {
        if (actor.hp > 0) {
            // 🟢 结算 DOT 并获取伤害数值
            const dotDamage = actor.updateEffects(); 
            
            // 🟢 如果有伤害，打印日志
            if (dotDamage > 0) {
                manager.addLogEntry(` ${actor.name} 受到持续伤害 -${dotDamage} HP`, 'damage');
            }
            
            actor.isDefending = false;
        }
    });
    
    manager.state.fleeFailed = false;
    await sleep(waitTime);
    manager.startInputPhase();
}