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
                    
                    <div class="stat-row"><span>暴击:</span><span id="${actor.id}-crit">${Math.floor(actor.critRate * 100)}%</span></div>
                    
                    <div class="stat-row" title="物理抗性 / 魔法抗性">
                        <span>抗性:</span>
                        <span id="${actor.id}-res" style="font-size: 0.85em; display: flex; gap: 5px;">--</span>
                    </div>
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
                    
                    <div class="stat-row"><span>属性:</span><span id="${actor.id}-element">${actor.element || '无'}</span></div>
                    
                    <div class="stat-row">
                        <span>抗性:</span>
                        <span id="${actor.id}-res" style="font-size: 0.85em; display: flex; gap: 5px;">--</span>
                    </div>
                </div>
                <div class="enemy-debuff" id="${actor.id}-debuffs">正常</div>
            `;
            enemyContainer.appendChild(card);
        }
    });
}

/**
 * 辅助：格式化抗性显示 (标准版)
 * 逻辑：
 * - 负数 (-) = 抗性 = 减伤 (绿色)
 * - 正数 (+) = 弱点 = 增伤 (红色)
 */
function formatResText(physRes, magicRes) {
    const formatSingle = (val, typeName) => {
        // 1. 安全检查：确保 val 是有效数字且不为 0（防止除以零），默认为 1.0 (无修正)
        const resValue = (val !== undefined && val !== null && !isNaN(val)) ? Math.max(0.1, val) : 1.0;
        
        // 2. 计算实际伤害倍率 (倒数)
        const multiplier = 1 / resValue;
        
        // 3. 计算相对于 1.0 的偏移百分比
        // diff < 0 代表减伤，diff > 0 代表增伤
        const diff = multiplier - 1;
        const pct = Math.round(Math.abs(diff) * 100);
        
        // 如果差异极小（小于1%），则视为正常承伤
        if (pct < 1) return null; 

        // 4. 判定显示文案与颜色
        if (diff < 0) {
            // 伤害倍率小于 1.0 -> 伤害减少 (绿色)
            return `<span style="color: #44ff44; cursor: help;" 
                    title="${typeName}抗性值: ${resValue.toFixed(2)}，有效降低了承受伤害">
                    ${typeName}:伤害减少 ${pct}%
                    </span>`;
        } else {
            // 伤害倍率大于 1.0 -> 伤害增加 (红色)
            return `<span style="color: #ff4444; cursor: help;" 
                    title="${typeName}抗性值: ${resValue.toFixed(2)}，使该类型伤害变得致命">
                    ${typeName}:伤害增加 ${pct}%
                    </span>`;
        }
    };

    const pText = formatSingle(physRes, '物理');
    const mText = formatSingle(magicRes, '魔法');

    if (!pText && !mText) return '<span style="color: #666;">--</span>';
    
    return [pText, mText].filter(t => t).join(' ');
}

/**
 * 2. 更新角色实时数值 (血条、蓝条、属性文本、抗性状态)
 */
export function updateCharacterUI(manager) {
    manager.state.actors.forEach(actor => {
        const id = actor.id;
        
        // === 1. 更新通用部分 (HP & 攻击力) ===
        
        // 更新血条宽度
        const hpFill = document.getElementById(`${id}-hp-fill`);
        if (hpFill) {
            const hpPct = Math.max(0, Math.min(100, (actor.hp / actor.maxHp) * 100));
            hpFill.style.width = `${hpPct}%`;
        }
        
        // 更新血量文本
        const hpText = document.getElementById(`${id}-hp-text`);
        if (hpText) {
            hpText.textContent = `${actor.hp}/${actor.maxHp}`;
        }
        
        // 更新攻击力数值
        const atkEl = document.getElementById(`${id}-attack`);
        if (atkEl) {
            atkEl.textContent = actor.atk;
        }

        // 🟢 [新增] 统一更新抗性 (玩家和敌人共用逻辑)
        // 这里的 HTML 结构需要在 renderBattlefield 中预先创建好
        const resEl = document.getElementById(`${id}-res`);
        if (resEl) {
            // 使用辅助函数生成带颜色的 HTML
            resEl.innerHTML = formatResText(actor.res_phys, actor.res_magic);
        }

        // === 2. 更新玩家特有部分 (MP & 暴击) ===
        if (actor.isPlayer) {
            // 更新 MP 条
            const mpFill = document.getElementById(`${id}-mp-fill`);
            if (mpFill) {
                const mpPct = Math.max(0, Math.min(100, (actor.mp / actor.maxMp) * 100));
                mpFill.style.width = `${mpPct}%`;
            }
            
            const mpText = document.getElementById(`${id}-mp-text`);
            if (mpText) {
                mpText.textContent = `${actor.mp}/${actor.maxMp}`;
            }

            // 更新暴击率
            const critEl = document.getElementById(`${id}-crit`);
            if (critEl) {
                critEl.textContent = `${Math.floor(actor.critRate * 100)}%`;
            }
        }

        // === 3. 更新状态文本 (Buffs/Debuffs/Stun/Dead) ===
        const buffEl = actor.isPlayer ? document.getElementById(`${id}-buffs`) : document.getElementById(`${id}-debuffs`);
        
        if (buffEl) {
            if (actor.hp <= 0) {
                buffEl.textContent = "倒地";
                buffEl.style.color = "#888";
            } else if (actor.isStunned) {
                buffEl.textContent = "眩晕";
                buffEl.style.color = "#ffcc00";
            } else if (actor.buffs.length > 0 || actor.debuffs.length > 0) {
                // 简单的状态摘要显示
                const buffNames = actor.buffs.map(b => "⬆️"); // 增益显示向上箭头
                const debuffNames = actor.debuffs.map(b => "⬇️"); // 减益显示向下箭头
                const dotNames = actor.dots.length > 0 ? ["🔥"] : []; // DOT 显示火

                const allStatus = [...buffNames, ...debuffNames, ...dotNames];
                buffEl.textContent = allStatus.length > 0 ? allStatus.join(' ') : "正常";
                buffEl.style.color = "#fff";
            } else {
                buffEl.textContent = "正常";
                buffEl.style.color = "#aaa";
            }
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