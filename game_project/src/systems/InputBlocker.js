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

// src/systems/InputBlocker.js

import { HInteractionSystem } from './HInteractionSystem/HInteractionSystem.js';
import { useSnapshot } from '../ui/modules/useSnapshot.js';
import { RestSystem } from './RestSystem/RestSystem.js';
// 已经引入了 store
import { store } from '../ui/modules/store.js';
import { ShopSystem } from './ShopSystem/ShopSystem.js';

export class InputBlocker {
    
    /**
     * 统一判断当前是否应该锁定地图交互
     * @returns {boolean} true = 锁定 (禁止点击/拖拽), false = 允许交互
     */
    static isBlocked() {
        // 1. 检查 H 互动系统
        if (HInteractionSystem.isActive) return true;

        // // 2. 检查快照/回溯面板
        // const snapshotState = useSnapshot().state; 
        // if (snapshotState && snapshotState.isVisible) return true;

        // 3. 检查休息系统
        if (RestSystem.isOpen) return true;

        // 4. 检查抉择/剧情系统
        if (store.choice && store.choice.isActive) return true;

        // 5. 检查商店系统
        if (ShopSystem && ShopSystem.isOpen) return true;

        //  6. 检查战斗系统
        // 战斗系统通常是独占的全屏 UI
        if (store.combat && store.combat.isActive) return true;
        
        //  7. 检查剧情对话状态
        // 当 DialogueOverlay 打开时锁定
        if (store.isDialogueActive) return true;

        //  8. 检查全屏/半屏功能菜单
        // 依据 App.js 中的路由逻辑，以下菜单激活时均需锁定：
        // 'team' (队伍), 'quests' (任务), 'npc_manager' (NPC图鉴), 'h_memory' (回忆)
        // 同时包含 'saves'(存档), 'settings'(设置) 以防万一
        const blockingMenus = ['team', 'quests', 'npc_manager', 'h_memory', 'saves', 'settings', 'history_manager', 'map_manager', 'pause', 'h_state_editor'];
        if (store.currentMenu && blockingMenus.includes(store.currentMenu)) return true;

        //  9. 检查 AI 管理面板
        // 注意：需要在 App.js 打开 LLMManager 时同步设置 store.showLLMManager = true
        if (store.showLLMManager) return true;

        return false;
    }
}