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
 * src/battle/combatmanager_modules/BattleRenderer.js
 * 负责战斗界面的动态渲染、UI 更新与视觉特效
 */
import { GameDatabase } from '../../config/GameDatabase.js';

/**
 * 1. 动态生成战场 HTML 结构
 * (已修正：恢复 HP/MP 条，并绑定正确的 atk/def_phys 属性)
 */
export function renderBattlefield(manager) {
    const playerContainer = document.getElementById('player-container');
    const enemyContainer = document.getElementById('enemy-container');
    
    playerContainer.innerHTML = '';
    enemyContainer.innerHTML = '';

    manager.state.actors.forEach(actor => {
        const card = document.createElement('div');
        card.id = `${actor.id}-card`;
        
        if (actor.isPlayer) {
            // === 玩家卡片 ===
            card.className = 'player-card';
            card.innerHTML = `
                <div class="player-name">
                    <span class="status-badge">READY</span>
                    <span id="${actor.id}-name">${actor.name}</span>
                    <span class="player-class" id="${actor.id}-class">${actor.class}</span>
                </div>
                
                <div class="hp-bar-container">
                    <div class="hp-bar">
                        <div class="hp-fill" id="${actor.id}-hp-fill" style="width: 100%;"></div>
                        <div class="hp-text" id="${actor.id}-hp-text">${actor.hp}/${actor.maxHp}</div>
                    </div>
                </div>
                
                <div class="mp-bar-container">
                    <div class="mp-bar">
                        <div class="mp-fill" id="${actor.id}-mp-fill" style="width: 100%;"></div>
                        <div class="mp-text" id="${actor.id}-mp-text">${actor.mp}/${actor.maxMp}</div>
                    </div>
                </div>

                <div class="player-stats">
                    <div class="stat-row"><span>攻击:</span><span id="${actor.id}-attack">${actor.atk}</span></div>
                    <div class="stat-row"><span>防御:</span><span id="${actor.id}-defense">${actor.def_phys}</span></div>
                    <div class="stat-row"><span>暴击:</span><span id="${actor.id}-crit">${Math.floor(actor.critRate * 100)}%</span></div>
                </div>
                <div class="buff-list" id="${actor.id}-buffs">健康</div>
            `;
            playerContainer.appendChild(card);
        } else {
            // === 敌人卡片 ===
            card.className = 'enemy-card';
            card.innerHTML = `
                <div class="enemy-name" id="${actor.id}-name">${actor.name}</div>
                
                <div class="enemy-hp-bar">
                    <div class="enemy-hp-fill" id="${actor.id}-hp-fill" style="width: 100%;"></div>
                    <div class="enemy-hp-text" id="${actor.id}-hp-text">${actor.hp}/${actor.maxHp}</div>
                </div>

                <div class="enemy-stats">
                    <div class="stat-row"><span>攻击:</span><span id="${actor.id}-attack">${actor.atk}</span></div>
                    <div class="stat-row"><span>防御:</span><span id="${actor.id}-defense">${actor.def_phys}</span></div>
                    <div class="stat-row"><span>属性:</span><span id="${actor.id}-element">${actor.element || '无'}</span></div>
                </div>
                <div class="enemy-debuff" id="${actor.id}-debuffs">正常</div>
            `;
            enemyContainer.appendChild(card);
        }
    });
}

/**
 * 2. 更新角色实时数值 (血条、蓝条、属性文本)
 */
export function updateCharacterUI(manager) {
    manager.state.actors.forEach(actor => {
        const id = actor.id;
        const hpFill = document.getElementById(`${id}-hp-fill`);
        if (!hpFill) return;

        const hpPct = (actor.hp / actor.maxHp) * 100;
        hpFill.style.width = `${hpPct}%`;
        document.getElementById(`${id}-hp-text`).textContent = `${actor.hp}/${actor.maxHp}`;
        
        if (actor.isPlayer) {
            const mpPct = (actor.mp / actor.maxMp) * 100;
            document.getElementById(`${id}-mp-fill`).style.width = `${mpPct}%`;
            document.getElementById(`${id}-mp-text`).textContent = `${actor.mp}/${actor.maxMp}`;
            document.getElementById(`${actor.id}-attack`).textContent = actor.atk;
            document.getElementById(`${actor.id}-defense`).textContent = actor.def_phys;
            document.getElementById(`${id}-crit`).textContent = `${Math.floor(actor.critRate * 100)}%`;
        }

        // 更新状态标签
        const buffEl = actor.isPlayer ? document.getElementById(`${id}-buffs`) : document.getElementById(`${id}-debuffs`);
        if (buffEl) {
            if (actor.hp <= 0) buffEl.textContent = "倒地";
            else if (actor.isStunned) buffEl.textContent = "眩晕";
            else if (actor.buffs.length > 0) {
                buffEl.textContent = actor.buffs.map(b => b.type.substring(0, 1).toUpperCase() + "↑").join(' ');
            } else buffEl.textContent = "正常";
        }
    });
}

/**
 * 3. 动态生成技能面板 (核心改进：支持 LLM 对象)
 */
export function updateSkillPanel(manager) {
    const container = document.getElementById('skill-list-container');
    container.innerHTML = '';
    
    const player = manager.state.currentPlayer;
    if (!player || !player.skills) return;

    player.skills.forEach(skillData => {
        // 安全校验：跳过空数据
        if (!skillData) return;

        let skill = null;

        // 分类处理：显式区分 静态ID 与 动态对象
        if (typeof skillData === 'string') {
            // 情况 A: 静态技能 ID -> 查数据库
            skill = GameDatabase.Skills[skillData];
        } else if (typeof skillData === 'object') {
            // 情况 B: 动态技能对象 -> 直接使用
            // (Vue 的 Proxy 对象 type 也是 'object'，这里可以直接透传)
            skill = skillData;
        }

        // 3. 数据完整性校验：防止空对象或脏数据导致渲染报错
        // 必须确保技能有 name 才能渲染
        if (!skill || !skill.name) return;

        const div = document.createElement('div');
        div.className = 'skill-option';
        const costMp = (skill.cost && skill.cost.mp) ? skill.cost.mp : 0;
        
        div.innerHTML = `
            <div class="skill-name">${skill.name}</div>
            <div class="skill-desc">${skill.desc || skill.description || "未知效果"}</div>
            <div class="skill-cost" style="color: ${player.mp >= costMp ? '#8888ff' : '#ff4444'}">
                消耗: ${costMp} MP
            </div>
        `;

        div.onclick = () => {
            if (player.mp >= costMp) manager.playerUseSkill(skillData);
        };

        if (player.mp < costMp) div.style.opacity = '0.6';
        container.appendChild(div);
    });
}

/**
 * 4. 渲染行动时间轴
 */
export function renderTimeline(manager) {
    const container = document.getElementById('timeline-bar');
    container.innerHTML = '';
    manager.state.actionOrder.forEach(actor => {
        const item = document.createElement('div');
        item.className = `timeline-item ${actor.isPlayer ? 'player' : 'enemy'}`;
        item.id = `timeline-${actor.id}`;
        item.innerHTML = `<span>${actor.name}</span>`;
        container.appendChild(item);
    });
}

/**
 * 5. 受击视觉特效
 */
export function triggerShakeEffect(actorId) {
    const card = document.getElementById(`${actorId}-card`);
    if (card) {
        card.classList.remove('shake-effect');
        void card.offsetWidth; // 触发回流重置动画
        card.classList.add('shake-effect');
    }
}

/**
 * 6. 初始化敌人描述 Tooltip
 */
export function initEnemyTooltips(manager) {
    manager.state.actors.forEach(actor => {
        if (!actor.isPlayer) {
            const card = document.getElementById(`${actor.id}-card`);
            if (card) {
                const oldTip = card.querySelector('.enemy-desc-tooltip');
                if (oldTip) oldTip.remove();

                const tip = document.createElement('div');
                tip.className = 'enemy-desc-tooltip';
                tip.textContent = actor.description || "一个充满敌意的生物。";
                card.appendChild(tip);
            }
        }
    });
}

/**
 * src/battle/combatmanager_modules/BattleRenderer.js
 * 补全：道具面板渲染逻辑
 */
export function updateItemPanel(manager) {
    const container = document.getElementById('item-list-container');
    if (!container) return;
    
    container.innerHTML = ''; 
    
    // 🟢 修改：不再获取 manager.state.currentPlayer
    // 而是获取 共享背包持有者
    const inventoryHolder = manager.getPartyInventoryHolder();

    if (!inventoryHolder || !inventoryHolder.sourceModel || !inventoryHolder.sourceModel.inventory) {
        container.innerHTML = '<div style="padding:20px; color:#888;">背包数据不可用</div>';
        return;
    }

    // 遍历持有者的背包
    inventoryHolder.sourceModel.inventory.forEach(slot => {
        const itemId = slot.id;
        const count = slot.count;
        const item = manager.itemsData[itemId]; 

        if (count > 0 && item) {
            const div = document.createElement('div');
            div.className = 'item-option';
            
            let color = '#fff';
            if (item.quality === 'GREEN') color = '#aaffaa'; 
            if (item.quality === 'BLUE') color = '#66ccff'; 
            if (item.quality === 'PURPLE') color = '#cc88ff'; 

            div.innerHTML = `
                <div class="item-name" style="color:${color}">${item.name}</div>
                <div class="item-desc">${item.desc || item.description}</div>
                <div class="item-count">数量: ${count}</div>
            `;

            div.onclick = () => {
                if (typeof manager.playerUseItem === 'function') {
                    manager.playerUseItem(itemId);
                }
            };
            container.appendChild(div);
        }
    });

    if (container.children.length === 0) {
        container.innerHTML = '<div style="padding:20px; color:#888;">背包空空如也...</div>';
    }
}