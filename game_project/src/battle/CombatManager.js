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
 * src/battle/CombatManager.js
 * 战斗管理器主入口（重构版）
 * 职责：持有战斗状态，作为子模块的调度中枢
 */

import { GameDatabase } from '../config/GameDatabase.js';
import { store } from '../ui/modules/store.js';

// 导入模块化子系统
import * as State from './combatmanager_modules/BattleState.js';
import * as Renderer from './combatmanager_modules/BattleRenderer.js';
import * as Input from './combatmanager_modules/BattleInput.js';
import * as Engine from './combatmanager_modules/BattleEngine.js';

export class CombatManager {
    constructor() {
        this.state = null;
        this.onComplete = null;
        this.eventHandlers = {}; // 存储事件引用以便销毁
        
        this.skillsData = GameDatabase.Skills;
        this.itemsData = GameDatabase.Items;
    }

    /**
     * === 1. 战斗启动入口 ===
     */
    startBattle(playerData, enemyData, callback) {
        console.log("=== 战斗系统启动 (Modular Mode) ===");
        this.onComplete = callback;
        
        //  捕获战斗上下文 (用于结算时判断来源与地点)
        // 必须在启动瞬间锁定，因为 store.combat.context 可能会随 UI 变化
        this.context = store.combat.context || {};

        // 初始化基础状态对象
        this.state = {
            initialPlayerData: playerData,
            initialEnemyData: enemyData,
            turn: 1,
            phase: 'init',
            finalResult: null,
            actors: [],
            commandQueue: [],
            actionOrder: [],
            currentPlayer: null,
            pendingCommand: null,
            totalDamageDealt: 0,
            totalDamageTaken: 0,
            itemsUsed: 0,
            fleeFailed: false,
            earnedExp: 0,
            earnedGold: 0,
            earnedItems: [],
        };

        // 步骤 A: 实例化角色 (支持 Mode 3 动态注入)
        State.initializeCharacters(this, playerData, enemyData);

        // 步骤 B: UI 初始渲染
        Renderer.renderBattlefield(this);
        Renderer.initEnemyTooltips(this);

        // 步骤 C: 事件绑定
        Input.bindEvents(this);

        // 🟢 核心修改：根据战斗来源控制“逃跑”按钮
        const fleeBtn = document.getElementById('flee-btn');
        if (fleeBtn) {
            // 读取上下文 (由 ChoiceSystem 注入)
            const context = store.combat.context || {};
            
            // 如果是抉择事件触发的战斗，隐藏逃跑按钮
            if (context.source === 'choice_event') {
                fleeBtn.style.display = 'none';
                this.addLogEntry("【警告】此战无法逃避！", 'system');
            } else {
                fleeBtn.style.display = 'block'; // 普通战斗恢复显示
            }
        }

        // 步骤 D: 同步数据至 Store 并开启回合
        store.combat.enemies = this.state.actors.filter(a => !a.isPlayer);
        this.updateCharacterUI();
        this.addLogEntry('战斗开始！', 'system');
        
        this.startInputPhase();
    }

    /**
     * === 2. 核心流程委派 (Engine) ===
     */
    startInputPhase() {
        // 1. 逻辑与时间轴重置
        this.state.phase = 'input';
        this.state.commandQueue = []; 
        Engine.calculateSpeedAndOrder(this);
        Renderer.renderTimeline(this);

        // 2. UI 状态指示器重置
        document.getElementById('turn-count').textContent = this.state.turn;
        const indicator = document.getElementById('phase-indicator');
        if (indicator) {
            indicator.textContent = "等待指令";
            indicator.style.color = "#66ccff";
        }

        // 3. 全局清理卡片样式与标识
        document.querySelectorAll('.player-card, .enemy-card').forEach(card => {
            card.classList.remove('active');
            card.classList.remove('hit-effect'); 
            card.classList.remove('shake-effect'); 
        });

        // 清理状态标签
        document.querySelectorAll('.status-badge').forEach(el => el.style.display = 'none');

        // 4. 自动处理眩晕玩家
        this.state.actors.forEach(actor => {
            if (actor.isPlayer && actor.hp > 0 && actor.isStunned) {
                this.state.commandQueue.push({ actorId: actor.id, type: 'stunned', targetId: null });
                const badge = document.querySelector(`#${actor.id}-card .status-badge`);
                if (badge) {
                    badge.textContent = "眩晕";
                    badge.style.display = 'block';
                    badge.style.backgroundColor = "#888888";
                }
            }
        });

        // 5. 激活首位玩家
        const activePlayer = this.state.actors.find(a => a.isPlayer && a.hp > 0 && !a.isStunned);
        if (activePlayer) {
            this.selectPlayer(activePlayer.id);
        } else {
            this.updateCurrentActorInfo();
        }
    }

    async executeTurn() {
        await Engine.executeTurn(this);
    }

    /**
     * === 3. 交互逻辑委派 (Input) ===
     */
    selectPlayer(actorId) {
        if (this.state.phase !== 'input') return;

        const actor = this.state.actors.find(a => a.id === actorId);
        if (!actor || !actor.isPlayer || actor.hp <= 0) return;
        
        if (actor.isStunned) {
            this.addLogEntry(`${actor.name} 处于眩晕，无法下达指令`, 'system');
            return;
        }

        this.state.currentPlayer = actor;

        document.querySelectorAll('.player-card').forEach(c => c.classList.remove('active'));
        const card = document.getElementById(`${actorId}-card`);
        if (card) card.classList.add('active');
        
        this.updateCurrentActorInfo();
        this.enablePlayerActions();
    }

    playerUseSkill(skillData) {
        Input.playerUseSkill(this, skillData);
    }

    registerCommand(cmd) {
        Input.registerCommand(this, cmd);
    }

    /**
     * === 4. UI 渲染委派 (Renderer) ===
     */
    updateCharacterUI() {
        Renderer.updateCharacterUI(this);
    }

    updateSkillPanel() {
        Renderer.updateSkillPanel(this);
    }

    triggerShakeEffect(actorId) {
        Renderer.triggerShakeEffect(actorId);
    }

    /**
     * === 5. 状态与结算委派 (State) ===
     */
    checkBattleEnd() {
        return State.checkBattleEnd(this);
    }

    endBattle(result) {
        State.endBattle(this, result);
    }

    finishBattle(customOutcome = null) {
        State.finishBattle(this, customOutcome);
    }

    resetAndRestart() {
        const p = this.state.initialPlayerData;
        const e = this.state.initialEnemyData;
        const cb = this.onComplete;
        this.cleanup();
        this.startBattle(p, e, cb);
    }

    cleanup() {
        Input.cleanup(this);
        document.getElementById('battle-end').classList.remove('active');
    }

    /**
     * === 6. 辅助工具函数 ===
     */
    addLogEntry(text, type) {
        const log = document.getElementById('battle-log');
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.innerHTML = text;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
    }

    updateCurrentActorInfo() {
        const infoBox = document.getElementById('current-player-info');
        const startBtn = document.getElementById('start-turn-btn');
        const replanBtn = document.getElementById('replan-btn');
        
        const livingPlayers = this.state.actors.filter(a => a.isPlayer && a.hp > 0);
        const isAllReady = livingPlayers.every(p => this.state.commandQueue.some(c => c.actorId === p.id));
        
        if (isAllReady && livingPlayers.length > 0) {
            infoBox.innerHTML = "<span style='color:#ffcc44'>全员就绪</span><br>点击开始战斗";
            startBtn.style.display = 'block';
            replanBtn.style.display = 'block';
            return;
        }

        const actor = this.state.currentPlayer;
        if (actor) {
            startBtn.style.display = 'none';
            replanBtn.style.display = 'none';

            const presetCmd = this.state.commandQueue.find(c => c.actorId === actor.id);

            if (presetCmd) {
                const actionText = this.parseCommandToText(presetCmd);
                infoBox.innerHTML = `<span style="color: #00cc00;">[已预设]</span><br>${actor.name} 准备${actionText}`;
            } else {
                infoBox.innerHTML = `<strong>${actor.name}</strong> 请下达指令`;
                infoBox.style.color = "#66ccff";
            }
        }
    }

    parseCommandToText(cmd) {
        const target = this.state.actors.find(a => a.id === cmd.targetId);
        const targetName = target ? `<span style="color: #ffaa00;">${target.name}</span>` : "";

        switch (cmd.type) {
            case 'attack':
                return `对 ${targetName} 进行普通攻击`;
            case 'defend':
                return `进入防御姿态`;
            case 'skill':
                const skill = (typeof cmd.skillData === 'object') ? cmd.skillData : this.skillsData[cmd.skillData];
                return `使用 <span style="color: #8888ff;">${skill ? skill.name : '技能'}</span> 对 ${targetName} 进行攻击`;
            case 'item':
                const item = this.itemsData[cmd.itemId];
                return `对 ${targetName} 使用 <span style="color: #aaffaa;">${item ? item.name : '道具'}</span>`;
            case 'stunned':
                return `因眩晕无法行动`;
            default:
                return `执行动作`;
        }
    }

    enablePlayerActions() {
        ['attack-btn', 'skill-btn', 'item-btn', 'defend-btn', 'flee-btn'].forEach(id => {
            const btn = document.getElementById(id);
            if(btn) btn.disabled = false;
        });
    }

    disablePlayerActions() {
        ['attack-btn', 'skill-btn', 'item-btn', 'defend-btn', 'flee-btn'].forEach(id => {
            const btn = document.getElementById(id);
            if(btn) btn.disabled = true;
        });
    }

    updateItemPanel() {
        Renderer.updateItemPanel(this);
    }

    /**
     * 获取队伍共享背包的持有者 (通常是 1 号玩家)
     */
    getPartyInventoryHolder() {
        return this.state.actors.find(a => a.isPlayer);
    }

    playerUseItem(itemId) {
        const player = this.state.currentPlayer;
        const inventoryHolder = this.getPartyInventoryHolder(); 

        if (!inventoryHolder || !inventoryHolder.sourceModel || !inventoryHolder.sourceModel.hasItem(itemId)) {
            this.addLogEntry('道具不足', 'system');
            return;
        }

        document.getElementById('item-panel').classList.remove('active');
        
        this.state.pendingCommand = { 
            type: 'item', 
            itemId: itemId, 
            targetType: 'ally' 
        };
        
        this.addLogEntry(`${player.name} 准备使用 ${this.itemsData[itemId].name}，请选择目标...`, 'system');
        Input.setTargetingMode(this, 'ally');
    }

    restartPlanning() {
        Input.restartPlanning(this);
    }

    renderLoot() {
        const list = document.getElementById('loot-list');
        list.innerHTML = '';
        
        if (this.state.earnedExp > 0) list.innerHTML += `<div class="loot-item exp"><span>经验</span><span>+${this.state.earnedExp}</span></div>`;
        if (this.state.earnedGold > 0) list.innerHTML += `<div class="loot-item gold"><span>金币</span><span>+${this.state.earnedGold}</span></div>`;
        
        this.state.earnedItems.forEach(itemData => {
            let name = "未知物品";
            let quality = "GREEN";

            // 🟢 兼容逻辑：判断是 动态对象 还是 静态ID
            if (typeof itemData === 'object' && itemData !== null) {
                // 如果是动态对象，直接读取其属性
                name = itemData.name || itemData.id;
                quality = itemData.quality || "GREEN";
            } else {
                // 如果是字符串 ID，去数据库查表
                const dbItem = GameDatabase.Items[itemData] || GameDatabase.Equipment[itemData];
                if (dbItem) {
                    name = dbItem.name;
                    quality = dbItem.quality;
                } else {
                    name = itemData; // 兜底显示 ID
                }
            }

            // 根据品质着色（可选，增加视觉反馈）
            const color = this.getQualityColor ? this.getQualityColor(quality) : "#fff";
            list.innerHTML += `<div class="loot-item item"><span>物品</span><span style="color:${color}">${name}</span></div>`;
        });
    }

    /**
     * 获取战斗发生的地点名称
     * 优先从上下文(context.nodeId)查找，解决抉择/脚本触发时的地点偏差问题
     * (供 BattleState.js 结算注入使用)
     */
    getBattleLocationName() {
        // 1. 尝试从上下文获取 nodeId (这是触发源)
        const nodeId = this.context ? this.context.nodeId : null;
        
        if (nodeId && window.mapManager && window.mapManager.currentMap) {
            // 在当前地图节点列表中查找
            const node = window.mapManager.currentMap.nodes.find(n => n.id === nodeId);
            if (node) {
                return node.name;
            }
        }

        // 2. 如果没找到，或没有上下文，回退到全局 Store 的显示名称 (玩家当前站立点)
        if (store.worldState && store.worldState.nodeName) {
            return store.worldState.nodeName;
        }

        return "未知区域";
    }

    /**
     * === [NEW] 静态启动入口 ===
     * 供外部系统（如 MapNavigation, ChoiceSystem）直接调用以唤起战斗
     * @param {Array} enemies - 敌人数据列表
     * @param {Object} context - 战斗上下文 { source: 'map_node'|'script', nodeId: '...', ... }
     * @returns {boolean} 是否成功发起
     */
    static requestBattle(enemies, context = {}) {
        if (!enemies || enemies.length === 0) {
            console.warn("[CombatManager] ❌ 无法启动战斗：敌人列表为空");
            return false;
        }

        console.log(`[CombatManager] 🚀 请求启动战斗 | 来源: ${context.source} | 敌人数量: ${enemies.length}`);

        // 1. 填充全局 Store (这将触发 Vue 的 watch/computed)
        store.combat.context = context;
        // 如果没有提供 battleId，则生成一个临时的，或者使用 nodeId
        store.combat.battleId = context.nodeId || `battle_${Date.now()}`;
        store.combat.enemies = enemies;

        // 2. 激活战斗 UI 开关
        // CombatOverlay 组件检测到此为 true 后会自动挂载并实例化 CombatManager
        store.combat.isActive = true;

        // 3. 环境控制
        // 隐藏地图 Canvas，避免背景干扰
        if (window.uiStore) {
            window.uiStore.gameCanvasVisible = false;
        }

        return true;
    }
    
}