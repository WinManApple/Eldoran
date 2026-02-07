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
 * src/battle/combatmanager_modules/BattleInput.js
 * 负责处理玩家的所有交互事件、目标选择逻辑与指令登记
 */
import { GameDatabase } from '../../config/GameDatabase.js';
import { store } from '../../ui/modules/store.js'

/**
 * 1. 绑定所有战斗 UI 事件
 */
export function bindEvents(manager) {
    const eh = manager.eventHandlers;

    // === 基础动作 (保留) ===
    eh.onAttackClick = () => handleActionClick(manager, 'attack');
    eh.onDefendClick = () => handleActionClick(manager, 'defend');
    eh.onFleeClick = () => handleActionClick(manager, 'flee');
    
    // === 面板控制 (保留) ===
    eh.onSkillOpen = () => {
        if (typeof manager.updateSkillPanel === 'function') manager.updateSkillPanel();
        const panel = document.getElementById('skill-panel');
        if (panel) panel.classList.add('active');
    };
    eh.onItemOpen = () => {
        if (typeof manager.updateItemPanel === 'function') manager.updateItemPanel();
        const panel = document.getElementById('item-panel');
        if (panel) panel.classList.add('active');
    };
    eh.onSkillClose = () => {
        const panel = document.getElementById('skill-panel');
        if (panel) panel.classList.remove('active');
    };
    eh.onItemClose = () => {
        const panel = document.getElementById('item-panel');
        if (panel) panel.classList.remove('active');
    };
    
    eh.onStartTurn = () => manager.executeTurn();
    eh.onReplan = () => manager.restartPlanning();
    
    // 🔴 [删除] 结算按钮绑定 
    // 原因：btn-confirm 和 btn-restart 现在由 Vue (CombatOverlay.js) 的 v-if 控制
    // 它们在战斗初始化时并不存在，不需要在这里绑定，Vue 会处理点击事件。

    // === 绑定 DOM 事件 (使用安全检查) ===
    const bind = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    };

    bind('attack-btn', eh.onAttackClick);
    bind('defend-btn', eh.onDefendClick);
    bind('flee-btn', eh.onFleeClick);
    bind('skill-btn', eh.onSkillOpen);
    bind('item-btn', eh.onItemOpen);
    bind('close-skill-panel', eh.onSkillClose);
    bind('close-item-panel', eh.onItemClose);
    bind('start-turn-btn', eh.onStartTurn);
    bind('replan-btn', eh.onReplan);

    // 🔴 [删除] btn-confirm 和 btn-restart 的绑定

    // 卡片事件 (选择玩家/敌人)
    bindCardEvents(manager);
}

/**
 * 2. 处理基础动作点击
 */
export function handleActionClick(manager, actionType) {
    // 安全检查：防止未初始化时点击报错
    if (!manager.state.currentPlayer) {
        console.warn("当前没有选中的角色，无法执行动作");
        return;
    }

    if (actionType === 'attack') {
        manager.state.pendingCommand = { type: 'attack', targetType: 'enemy' };
        manager.addLogEntry(`${manager.state.currentPlayer.name} 准备攻击... 请点击选择敌人`, 'system');
        setTargetingMode(manager, 'enemy');
    } else if (actionType === 'defend') {
        const actor = manager.state.currentPlayer;
        if (!actor) return;
        registerCommand(manager, {
        actorId: actor.id,
        type: 'defend',
        targetId: null
        });
        manager.addLogEntry(`${actor.name} 准备防御`, 'system');

    } else if (actionType === 'flee') {
        // 逃跑检查
        if (manager.state.fleeFailed) {
            manager.addLogEntry("无法再次逃跑！", 'system');
            return;
        }

        const isSuccess = Math.random() < store.config.battle.Mechanics.baseFleeChance;
        if (isSuccess) {
            manager.addLogEntry(`${manager.state.currentPlayer.name} 指挥全队撤退... 成功！`, 'system');
            manager.endBattle('escaped');
        } else {
            manager.addLogEntry(`${manager.state.currentPlayer.name} 试图撤退... 失败！`, 'system');
            manager.state.fleeFailed = true; // 标记本回合逃跑失败
            
            // 逃跑失败直接跳过回合
            // 简单的处理是让该角色防御，或者直接触发回合结束
            // 这里我们消耗该角色的行动，让他发呆
            registerCommand(manager, {
                actorId: manager.state.currentPlayer.id,
                type: 'defend', // 失败惩罚：强制防御
                targetId: null
            });
        }
    }
}

/**
 * 3. 技能使用逻辑
 */
export function playerUseSkill(manager, skillData) {
    const player = manager.state.currentPlayer;
    if (!player) return;

    const skill = (typeof skillData === 'object') ? skillData : GameDatabase.Skills[skillData];
    
    const costMp = (skill.cost && skill.cost.mp) ? skill.cost.mp : 0;
    if (player.mp < costMp) {
        manager.addLogEntry('MP不足', 'system');
        return;
    }

    const skillPanel = document.getElementById('skill-panel');
    if (skillPanel) skillPanel.classList.remove('active');

    const targetType = (skill.targetType === 'ally') ? 'ally' : 'enemy';

    manager.state.pendingCommand = { 
        type: 'skill', 
        skillData: skillData, 
        targetType: targetType 
    };
    
    manager.addLogEntry(`${player.name} 准备使用 ${skill.name}... 请点击目标`, 'system');
    setTargetingMode(manager, targetType);
}

/**
 * 4. 目标选择模式反馈
 */
export function setTargetingMode(manager, type) {
    document.body.classList.remove('targeting-enemy', 'targeting-ally');
    document.body.classList.add(`targeting-${type}`);
}

export function clearTargetingMode(manager) {
    manager.state.pendingCommand = null;
    document.body.classList.remove('targeting-enemy', 'targeting-ally');
    document.querySelectorAll('.enemy-card, .player-card').forEach(c => c.classList.remove('active'));
}

/**
 * 5. 登记并校验指令队列
 */
export function registerCommand(manager, cmd) {
    // 覆盖该角色旧指令
    manager.state.commandQueue = manager.state.commandQueue.filter(c => c.actorId !== cmd.actorId);
    manager.state.commandQueue.push(cmd);
    
    const badge = document.querySelector(`#${cmd.actorId}-card .status-badge`);
    if (badge) badge.style.display = 'block';
    
    const livingPlayers = manager.state.actors.filter(a => a.isPlayer && a.hp > 0);
    const isAllReady = livingPlayers.every(p => manager.state.commandQueue.some(c => c.actorId === p.id));
    
    if (isAllReady) {
        manager.updateCurrentActorInfo();
    } else {
        const nextActor = livingPlayers.find(p => !manager.state.commandQueue.some(c => c.actorId === p.id));
        if (nextActor) manager.selectPlayer(nextActor.id);
    }
}

/**
 * 6. 绑定卡片交互
 */
function bindCardEvents(manager) {
    // 1. 敌人卡片点击
    document.querySelectorAll('.enemy-card').forEach(card => {
        card.onclick = (e) => {
            const enemyId = e.currentTarget.id.replace('-card', '');
            
            if (manager.state.pendingCommand && manager.state.pendingCommand.targetType === 'enemy') {
                const targetActor = manager.state.actors.find(a => a.id === enemyId);
                const currentActor = manager.state.currentPlayer;

                let actionName = "普通攻击";
                if (manager.state.pendingCommand.type === 'skill') {
                    const skillData = manager.state.pendingCommand.skillData;
                    const skill = (typeof skillData === 'object') ? skillData : manager.skillsData[skillData];
                    actionName = skill ? skill.name : "技能";
                }

                manager.addLogEntry(`${currentActor.name} 准备对 ${targetActor.name} 进行 ${actionName}`, 'system');

                const cmd = {
                    actorId: currentActor.id,
                    type: manager.state.pendingCommand.type,
                    targetId: enemyId
                };
                if (manager.state.pendingCommand.skillData) {
                    cmd.skillData = manager.state.pendingCommand.skillData;
                }
                
                registerCommand(manager, cmd);
                clearTargetingMode(manager);
                manager.updateCurrentActorInfo();
            }
        };
    });

    // 2. 玩家卡片点击
    document.querySelectorAll('.player-card').forEach(card => {
        card.onclick = (e) => {
            const actorId = e.currentTarget.id.replace('-card', '');       
            
            if (manager.state.pendingCommand && manager.state.pendingCommand.targetType === 'ally') {
                const targetActor = manager.state.actors.find(a => a.id === actorId);
                const currentActor = manager.state.currentPlayer;

                let actionName = "行动";
                if (manager.state.pendingCommand.type === 'skill') {
                    const skillData = manager.state.pendingCommand.skillData;
                    const skill = (typeof skillData === 'object') ? skillData : manager.skillsData[skillData];
                    actionName = skill ? skill.name : "技能";
                } else if (manager.state.pendingCommand.type === 'item') {
                    const item = manager.itemsData[manager.state.pendingCommand.itemId];
                    actionName = item ? item.name : "道具";
                }

                manager.addLogEntry(`${currentActor.name} 准备对 ${targetActor.name} 使用 ${actionName}`, 'system');

                const cmd = {
                    actorId: currentActor.id,
                    type: manager.state.pendingCommand.type,
                    targetId: actorId
                };
                if (manager.state.pendingCommand.skillData) cmd.skillData = manager.state.pendingCommand.skillData;
                if (manager.state.pendingCommand.itemId) cmd.itemId = manager.state.pendingCommand.itemId;
                
                registerCommand(manager, cmd);
                clearTargetingMode(manager);
                manager.updateCurrentActorInfo();
            } 
            else {
                clearTargetingMode(manager);
                manager.selectPlayer(actorId);
            }
        };
    });
}

/**
 * 7. 事件清理 (生命周期销毁)
 */
export function cleanup(manager) {
    const eh = manager.eventHandlers;
    if (!eh) return;

    // 移除绑定时使用同样的 ID 列表
    const unbind = (id, handler) => {
        const el = document.getElementById(id);
        if (el && handler) el.removeEventListener('click', handler);
    };

    unbind('attack-btn', eh.onAttackClick);
    unbind('defend-btn', eh.onDefendClick);
    unbind('flee-btn', eh.onFleeClick);
    unbind('skill-btn', eh.onSkillOpen);
    unbind('item-btn', eh.onItemOpen);
    unbind('start-turn-btn', eh.onStartTurn);
    unbind('replan-btn', eh.onReplan);

    // 🔴 [删除] 移除 btn-confirm 和 btn-restart 的解绑逻辑
    // 因为我们没有绑定它们

    document.querySelectorAll('.enemy-card, .player-card').forEach(el => el.onclick = null);
}

/**
 * 新增：重新规划（战术重置）逻辑
 */
export function restartPlanning(manager) {
    manager.state.commandQueue = [];
    document.querySelectorAll('.status-badge').forEach(el => {
        el.style.display = 'none';
    });
    manager.addLogEntry('--- 战术重置，请重新下达指令 ---', 'system');
    
    manager.state.actors.forEach(actor => {
        if (actor.isPlayer && actor.hp > 0 && actor.isStunned) {
            manager.state.commandQueue.push({ actorId: actor.id, type: 'stunned', targetId: null });
            const badge = document.querySelector(`#${actor.id}-card .status-badge`);
            if (badge) {
                badge.textContent = "眩晕";
                badge.style.display = 'block';
                badge.style.backgroundColor = "#888888";
            }
        }
    });

    const firstActive = manager.state.actors.find(a => a.isPlayer && a.hp > 0 && !a.isStunned);
    if (firstActive) {
        manager.selectPlayer(firstActive.id);
    }
    
    manager.updateCurrentActorInfo();
}