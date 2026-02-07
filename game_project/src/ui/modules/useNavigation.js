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

// src/ui/modules/useNavigation.js
import { computed, watch } from '../../../lib/vue.esm-browser.js';
import { store, RESOLUTIONS } from './store.js';
import { PartyManager } from '../../systems/PartyManager.js';
import { ChatData } from './ChatData.js';
import { Chat_Memory } from '../../LLM/memory/Chat_Memory.js';
import { DEFAULT_OPENING_ID } from '../../config/Opening.js';
/**
 * ==========================================
 * 导航与视图控制模块 (Navigation & View Control)
 * ==========================================
 * 职责：
 * 1. 管理菜单栈 (Menu Stack) 与层级跳转。
 * 2. 控制 Phaser 游戏画布的显示与隐藏。
 * 3. 监听游戏状态 (Ingame) 并动态调整网页背景色。
 * 4. 处理游戏启动、暂停、返回标题等核心流程。
 */
export function useNavigation() {

    // ==========================================
    // 1. 核心状态计算
    // ==========================================
    
    // 判断当前是否处于游戏状态
    // (只要当前是 HUD、暂停菜单，或栈中包含这些状态，都算作"游戏中")
    const isIngame = computed(() => {
        return store.currentMenu === 'none' || 
               store.currentMenu === 'pause' || 
               store.menuStack.includes('none');
    });

    // ==========================================
    // 2. 基础导航原语 (Primitives)
    // ==========================================

    // 进入新菜单 (入栈)
    const navigateTo = (targetMenu) => {
        console.log(`[UI] 导航: ${store.currentMenu} -> ${targetMenu}`);
        store.menuStack.push(store.currentMenu); // 记录当前位置
        store.currentMenu = targetMenu;
    };

    // 返回上一级 (出栈)
    const navigateBack = () => {
        if (store.menuStack.length > 0) {
            const prev = store.menuStack.pop();
            console.log(`[UI] 返回: ${prev}`);
            store.currentMenu = prev;
        } else {
            console.warn("[UI] 栈为空，强制返回主菜单");
            returnToTitle();
        }
    };

    // ==========================================
    // 3. 游戏流控制 (Game Flow)
    // ==========================================

    /**
     * 辅助：控制 Phaser 画布可见性
     * (解决"界面重叠"的核心：不玩游戏时隐藏画布，露出背景视频)
     */
    const setGameCanvasVisible = (visible) => {
        const canvas = document.querySelector('#game-container canvas');
        if (canvas) {
            canvas.style.visibility = visible ? 'visible' : 'hidden';
        }
    };

    // 开始游戏
    const startGame = (payload = null) => { 
        console.log("🚀 [UI] 启动游戏流程...", payload ? `开局ID: ${payload.openingId}` : "默认/读档");

        // 场景 1: 新游戏 (传入了 payload)
        if (payload) {
            console.log("✨ 执行新游戏初始化...");

            // 🟢 [新增] 动态开局数据适配 (Adapter Layer)
            // 如果检测到 dynamicData，说明这是来自 LLM 生成的开局
            if (payload.dynamicData) {
                console.log("[UI] 正在装载动态开局数据...");
                // 重构 openingData，使其包含各 Manager 所需的所有动态数据
                payload.openingData = {
                    // 1. 基础数据 (playerConfig, items, scripts)
                    ...payload.dynamicData.openingData,
                    // 2. 动态队友配置 (PartyManager 已在每一步适配此字段)
                    companionData: payload.dynamicData.companionData,
                    // 3. 动态地图主题 (MapManager 需要直接读取此对象，而非查表)
                    mapTheme: payload.dynamicData.mapTheme
                };
            }
            
            // 1. 创建队伍 (PartyManager 现在能识别 payload.openingData.companionData)
            const initialParty = PartyManager.createInitialParty(payload.openingData); 
            store.party = initialParty;
            
            // 1.5 覆盖玩家自定义名字
            if (store.party[0] && payload.playerName) {
                store.party[0].name = payload.playerName;
            }
            
            if (payload.difficultyParams && store.config.battle) {
                Object.assign(store.config.battle.Difficulty, payload.difficultyParams);
                console.log("[UI] 难度法则已应用:", store.config.battle.Difficulty);
            }
            
            // 2. 加载开场剧本 UI
            // 🟢 [修改] 分支逻辑：区分静态 ID 加载与动态脚本注入
            if (payload.dynamicData) {
                console.log("[UI] 注入动态剧本...");
                // 动态模式：直接使用生成好的 scripts 数组
                // 注意：ChatData 需要新增 loadScripts 方法，或我们假设它有类似能力
                if (ChatData.loadScripts) {
                    ChatData.loadScripts(payload.dynamicData.openingData.scripts);
                } else if (ChatData.loadManualScripts) {
                    ChatData.loadManualScripts(payload.dynamicData.openingData.scripts);
                }
                
                // 内存模块注入 (如果支持)
                if (Chat_Memory.importDynamicData) {
                    Chat_Memory.importDynamicData(payload.dynamicData);
                }
            } else {
                // 静态模式：通过 ID 查表 (原逻辑)
                ChatData.loadOpening(payload.openingId);
                Chat_Memory.importOpening(payload.openingId);
            }

            // 开启“剧情锁” (强制播放开场)
            store.isOpeningSequence = true;

            // 立即打开对话框 (否则玩家看不到开场白)
            store.isDialogueActive = true;

            // 3. 初始化世界 (MapManager 将接收包含 mapTheme 对象的 openingData)
            if (window.mapManager) {
                window.mapManager.initNewGame(payload.openingData); 
            }


        }
        // 场景 2: 读档 (无 payload，且已有 party)
        else if (store.party && store.party.length > 0) {
            console.log("📂 恢复存档状态...");
            // 读档不需要 initNewGame，直接进入
        }
        // 场景 3: 异常兜底
        else {
            console.warn("⚠️ 未知启动状态，执行默认初始化");
            const defaultParty = PartyManager.createInitialParty(null);
            store.party = defaultParty;
            window.mapManager?.initNewGame(null);
        }

        // --- 通用启动逻辑 ---
        if (window.game && window.game.scene) {
           window.game.scene.start('ExplorationScene'); 
        }

        store.currentMenu = 'none'; // 进入 HUD
        store.isIngame = true;
        setGameCanvasVisible(true);
        console.log("🎬 游戏场景已启动");
    };

    // 返回标题画面
    const returnToTitle = () => {
        console.log("[UI] 返回标题画面");
        store.menuStack = [];
        store.currentMenu = 'main'; // 切换回主菜单 UI
        
        store.isIngame = false;

        // 1. 隐藏游戏画布
        setGameCanvasVisible(false);

        // 2. 停止游戏场景 (节省性能)
        if (window.game) {
            const scene = window.game.scene.getScene('ExplorationScene');
            // 如果场景正在运行，就把它停掉
            if (scene && scene.scene.isActive()) {
                scene.scene.stop();
            }
        }
    };

    // 打开暂停菜单 (仅游戏内有效)
    const openPauseMenu = () => {
        if (store.currentMenu === 'none') {
            navigateTo('pause');
        }
    };

    // 继续游戏 (关闭暂停)
    const resumeGame = () => {
        // 如果当前在 pause，且栈顶是 none，pop 即可
        if (store.currentMenu === 'pause') {
            navigateBack();
        } else {
            // 兜底逻辑
            store.currentMenu = 'none';
            store.menuStack = [];
        }
    };

    // 打开设置 (通用)
    const openSettings = () => {
        navigateTo('settings');
    };
    
    // 打开任务板的通用关闭方法
    const closeMenu = () => {
        navigateBack();
    };

    // ==========================================
    // 4. 环境与设置控制
    // ==========================================

    // 应用分辨率
    const applyResolution = (index) => {
        store.settings.resolutionIdx = index;
        const res = RESOLUTIONS[index];
        console.log(`[UI] 切换分辨率: ${res.width}x${res.height}`);
        try { window.resizeTo(res.width, res.height); } catch(e){}
    };

    // 监听 isIngame 变化，动态修改网页底色
    // 游戏外 -> 黑色 (为了看视频)
    // 游戏内 -> 羊皮纸色 (为了填满空隙)
    watch(isIngame, (inGame) => {
        if (inGame) {
            document.body.style.backgroundColor = '#f0d292'; // 羊皮纸色
        } else {
            document.body.style.backgroundColor = '#000000'; // 纯黑
        }
    }, { immediate: true });

    return {
        isIngame,
        navigateTo,
        navigateBack,
        startGame,
        returnToTitle,
        openPauseMenu,
        resumeGame,
        openSettings,
        closeMenu,
        applyResolution,
        setGameCanvasVisible // 暴露给 App.js 的 onMounted 使用
    };
}