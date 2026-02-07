/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

import { store } from './modules/store.js';
import { useSaveSystem } from './modules/useSaveSystem.js';
import { useNavigation } from './modules/useNavigation.js'; // 🟢 1. 引入导航模块

export default {
    name: 'TransitionModal',
    setup() {
        const saveSys = useSaveSystem();
        const { navigateTo } = useNavigation(); // 🟢 2. 获取导航方法
        
        // 确认操作
        const confirm = () => {
            if (store.transition.onConfirm) {
                store.transition.onConfirm();
            } else {
                store.transition.isActive = false;
            }
        };

        // 打开存档界面
        const openSave = async () => {
            console.log("[TransitionModal] 呼出存档菜单...");
            
            if (saveSys.refreshSaveList) {
                await saveSys.refreshSaveList();
            }
            
            // 🔴 修改前: store.currentMenu = 'saves'; (这会导致栈为空)
            // 🟢 修改后: 使用标准导航入栈
            // 这会将当前的 'none' 状态压入栈中，点击返回时就能回到游戏界面
            navigateTo('saves');
        };

        return { store, confirm, openSave };
    },
    template: `
    <div v-if="store.transition && store.transition.isActive" class="modal-mask">
        <div class="modal-box cyber-theme">
            <div class="modal-header">
                <span class="warning-icon">⚠</span>
                <h3>{{ store.transition.title }}</h3>
            </div>
            
            <div class="modal-content">
                <p>{{ store.transition.message }}</p>
            </div>
            
            <div class="modal-actions">
                <button v-if="store.transition.showSave" 
                        class="cyber-btn secondary" 
                        @click="openSave">
                    📂 存 档
                </button>
                
                <button class="cyber-btn primary" @click="confirm">
                    ➡ 确认推进
                </button>
            </div>
        </div>
    </div>
    `
};