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

// src/ui/modules/store.js
import { reactive } from '../../../lib/vue.esm-browser.js';
import { CharacterModel } from '../../systems/PlayerState.js';
import { DefaultGameConfig } from '../../config/GameConfig.js';

/**
 * ==========================================
 * 全局状态仓库 (Global Store)
 * ==========================================
 * 作用：
 * 1. 存储游戏所有的响应式数据 (Player, UI, System, Chat)。
 * 2. 提供跨组件、跨模块的数据访问能力。
 * 3. 实现了 UI 属性与角色模型的自动映射 (Getters)。
 */

// 分辨率配置常量
export const RESOLUTIONS = [
    { label: '1080p', width: 1920, height: 1080 },
    { label: '900p',  width: 1600, height: 900 },
    { label: '576p',  width: 1024, height: 576 },
    { label: '540p',  width: 960,  height: 540 },
    { label: '480p',  width: 854,  height: 480 },
    { label: '360p',  width: 360,  height: 640 }
];

export const DIFFICULTY_PRESETS = [
    null, // 0号位留空，方便索引对齐 (1-5)
    { label: "简单", desc: "割草模式，享受剧情", params: { playerDamageMultiplier: 1.5, enemyDamageMultiplier: 0.5, enemyHpMultiplier: 0.8, xpGainMultiplier: 1.5 } },
    { label: "普通", desc: "标准的冒险体验", params: { playerDamageMultiplier: 1.2, enemyDamageMultiplier: 0.8, enemyHpMultiplier: 1.0, xpGainMultiplier: 1.0 } },
    { label: "困难", desc: "敌人更具威胁", params: { playerDamageMultiplier: 1.0, enemyDamageMultiplier: 1.0, enemyHpMultiplier: 1.5, xpGainMultiplier: 1.2 } },
    { label: "痛苦", desc: "容错率极低", params: { playerDamageMultiplier: 0.8, enemyDamageMultiplier: 1.2, enemyHpMultiplier: 2.5, xpGainMultiplier: 1.5 } },
    { label: "地狱", desc: "甚至无法呼吸...", params: { playerDamageMultiplier: 0.5, enemyDamageMultiplier: 2.5, enemyHpMultiplier: 5.0, xpGainMultiplier: 2.0 } }
];

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 🟢 新增：初始化时间随机范围配置 (最小值, 最大值)
 * 对应 store.gameTime 的结构
 */
export const TIME_INIT_RANGES = {
    year: [20, 30],   // 纪元 20-30 年之间
    month: [1, 12],   // 1-12 月
    day: [1, 30],     // 1-30 日 (根据你的 update_time 逻辑，每月固定30天)
    hour: [6, 14],    // 建议限制在白天开局 (早上6点 - 下午2点)
    minute: [0, 59]   // 0-59 分
};

export const store = reactive({

    // 全局游戏配置 (初始化时深拷贝一份默认值，防止污染原始引用)
    config: JSON.parse(JSON.stringify(DefaultGameConfig)),

    // --- 🖥️ 系统与菜单状态 ---
    currentMenu: 'main', // 当前显示的菜单: 'main'|'saves'|'settings'|'none'(HUD)|'pause'
    menuStack: [],       // 导航栈 (用于多级菜单回退)
    isIngame: false,     // 是否处于游戏内
    debugMsg: "系统初始化...",
    
    // --- 🗣️ 对话系统状态 ---
    isDialogueActive: false,    // 是否显示对话框
    isOpeningSequence: false,

    // --- 🚦 AI 交互状态 (HUD 红绿灯) ---
    aiResult: 'none',       // 'none' | 'success' | 'error'
    aiStatus: {
        connectionState: 'disconnected', // 'disconnected' | 'connecting' | 'connected'
        isThinking: false,               // 是否正在等待 LLM 回复
    },
    
    // 动态开局配置容器
    dynamicOpenings: {},

    // 全局过渡/确认弹窗状态
    transition: {
        isActive: false,   // 是否显示
        title: "",         // 标题
        message: "",       // 内容
        showSave: false,   // 是否显示存档按钮
        canCancel: false,  // 是否显示取消
        onConfirm: null    // 确认回调
    },

    // --- 👥 队伍系统 ---
    // 存储真正的角色逻辑对象 (CharacterModel 实例数组)
    // 初始为空，由 PartyManager.createInitialParty() 填充
    party: [],

    /**
     * 核心 Getter：获取主角引用
     * 作用：所有 HUD 属性将基于此对象进行自动映射
     */
    // 增加 set 方法，使 playerState 支持赋值操作
    get playerState() {
        return this.party[0] || null;
    },
    set playerState(val) {
        // 当执行 store.playerState = ... 时，实际上是更新队伍的第一名成员
        this.party[0] = val;
    },
    
    // --- 🎮 游戏内玩家数据 (HUD 显示投影) ---
    /**
     * playerStats 不再存储真实数据，而是作为 playerState 的“影子”
     * 这种设计确保了 CombatManager 修改属性后，HUD 能立即自动更新
     */
    // --- 🎮 游戏内玩家数据 (HUD 显示投影) ---
    playerStats: {
        // 名字映射
        get name() { return store.playerState?.name || "未知冒险者"; },
        set name(v) { if (store.playerState) store.playerState.name = v; }, // 🟢 新增 Setter

        // 等级映射
        get level() { return store.playerState?.level || 1; },
        set level(v) { if (store.playerState) store.playerState.level = v; },

        // 生命值映射
        get hp() { return store.playerState?.hp || 0; },
        set hp(v) { if (store.playerState) store.playerState.hp = v; },

        get maxHp() { return store.playerState?.maxHp || 100; },
        set maxHp(v) { if (store.playerState) store.playerState.maxHp = v; },

        // 能量值映射
        get mp() { return store.playerState?.mp || 0; },
        set mp(v) { if (store.playerState) store.playerState.mp = v; },

        get maxMp() { return store.playerState?.maxMp || 50; },
        set maxMp(v) { if (store.playerState) store.playerState.maxMp = v; },

        // 层级映射
        get currentLayer() { return store.playerState?.currentLayer || 0; },
        set currentLayer(v) { if (store.playerState) store.playerState.currentLayer = v; },

        // 🟢 新增：战斗属性映射
        get atk() { return store.playerState?.atk || 0; },
        set atk(v) { if (store.playerState) store.playerState.atk = v; },

        get def() { return store.playerState?.def || 0; },
        set def(v) { if (store.playerState) store.playerState.def = v; },

        get critRate() { return store.playerState?.critRate || 0; },
        set critRate(v) { if (store.playerState) store.playerState.critRate = v; },

        avatar: "assets/avatars/hero_default.png"
    },

    /**
     * 资源数据映射
     */
    resources: { 
        get gold() { return store.playerState?.gold || 0; },
        set gold(v) { if (store.playerState) store.playerState.gold = v; }, // 🟢 新增 Setter
        spiritStones: 0 
    },
    
    // 游戏纪元时间
    gameTime: { 
        year: 24, 
        month: 5, 
        day: 16, 
        hour: 20, 
        minute: 13 
    },

    // 世界环境状态 (用于 UI 数据绑定)
    worldState: {
        mapName: "正在定位...",
        // 🟢 修改：将 timeDisplay 改为 Getter，实现自动格式化
        get timeDisplay() {
            const { year, month, day, hour, minute } = store.gameTime;
            const pad = (n) => String(n).padStart(2, '0');
            return `纪元 ${year}年${month}月${day}日 ${pad(hour)}:${pad(minute)}`;
        },
        environment: "default"
    },


    // ⚔️ 战斗系统状态
    combat: {
        isActive: false,   // 战斗开关
        enemies: [],       // 遭遇的敌人列表
        battleId: null     // 当前战斗节点 ID
    },

    // 抉择系统状态
    // Logic 层 (ChoiceSystem) 写这里，View 层 (ChoiceOverlay) 读这里
    choice: {
        isActive: false,       // 开关：是否显示对话框
        title: "",             // 标题：事件名称
        currentLines: [],      // 文本：当前显示的剧情文本数组
        choices: [],           // 选项：当前可点击的按钮 [{ label, index }]
        isProcessing: false    // 锁：防止连点
    },

    // --- 📜 任务与日志 ---
    systemLogs: [],          // 左下角滚动日志
    activeQuest: {           // 当前主线目标
        title: "序章：迷雾", 
        target: "探索周围环境" 
    },
    
    sideQuests: [],          // 当前已发现的支线

    questSystem: {

        isDesignMode: false,

        // 主线时间轴：存储当前章节从 Layer 0 到当前层的所有任务
        // 结构: [{ layer: 0, title: "...", description: "...", status: "active/completed" }]
        mainLine: [],

        // 支线列表：存储详细的支线信息
        // 结构: [{ id, name, life, isPinned, tasks: [] }]
        sideLine: [],

        // 历史档案：存储已通关的旧章节
        // 结构: [{ id, title, summary, progress }]
        history: []
    },

    // --- 💾 存档系统数据 ---
    saveSystem: {
        mode: 'manual',      // 'manual' | 'auto'
        selectedId: null,    // 选中的插槽 ID
        previewData: null,   // 预览信息
        manualList: [],      // 手动存档列表
        autoList: []         // 自动存档列表
    },

    // --- ⚙️ 全局设置 ---
    settings: { 
        resolutionIdx: 2, 
    },

    /**
     * 🟢 新增：时间更新核心逻辑 (进位制)
     * @param {Object} time_now - 引用 store.gameTime
     */
    update_time(time_now, year = 0, month = 0, day = 0, hour = 0, minute = 0) {
        // 1. 累加数值
        time_now.minute += minute;
        time_now.hour += hour;
        time_now.day += day;
        time_now.month += month;
        time_now.year += year;

        // 2. 处理分钟进位
        if (time_now.minute >= 60) {
            time_now.hour += Math.floor(time_now.minute / 60);
            time_now.minute %= 60;
        }

        // 3. 处理小时进位
        if (time_now.hour >= 24) {
            time_now.day += Math.floor(time_now.hour / 24);
            time_now.hour %= 24;
        }

        // 4. 处理日期进位 (假设每月固定 30 天)
        if (time_now.day > 30) {
            time_now.month += Math.floor((time_now.day - 1) / 30);
            time_now.day = ((time_now.day - 1) % 30) + 1;
        }

        // 5. 处理月份进位
        if (time_now.month > 12) {
            time_now.year += Math.floor((time_now.month - 1) / 12);
            time_now.month = ((time_now.month - 1) % 12) + 1;
        }
        
        console.log(`[Clock] 时间流逝，当前显示: ${this.worldState.timeDisplay}`);
    },

    // --- 🛠️ 临时数据 ---
    tempMapData: null,       // 地图重绘信号
    phaserStatus: "等待启动..." // Phaser 引擎状态
});

// 挂载到全局，方便非 Vue 环境 (如 Phaser 或 Manager) 访问
window.uiStore = store;

/**
 * 全局日志工具函数
 * 修改点：历史记录上限提升至 30 条
 */
export const addLog = (msg) => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    store.systemLogs.push(`[${time}] ${msg}`);
    // 将历史记录上限提升至 30 条，支持滚动查看
    if (store.systemLogs.length > 30) store.systemLogs.shift();
};

/**
 * 🟢 新增：重置全局状态
 * 作用：在退出游戏回到主菜单时调用，彻底清理内存数据
 */
export const resetStore = () => {
    // 1. 系统基础状态重置
    store.currentMenu = 'main';
    store.isIngame = false;
    store.menuStack = [];
    
    // 2. 核心数据清理：防止角色和地图节点残留
    store.party = []; // 清空队伍将自动重置 playerStats 和 resources 的映射
    
    // 3. 战斗系统状态重置
    store.combat.isActive = false;
    store.combat.enemies = [];
    store.combat.battleId = null;
    
    // 4. 环境与 UI 状态重置
    store.worldState = {
        mapName: "正在定位...",
        environment: "default"
    };
    
    // 5. 日志与对话重置
    store.systemLogs = [];
    store.isDialogueActive = false;

    //  强制关闭残留的过渡弹窗(对话时的警告窗口)
    if (store.transition) {
        store.transition.isActive = false;
        store.transition.onConfirm = null; // 清理旧回调，防止内存泄漏
        store.transition.showSave = false;
    }

    // 🟢 [新增] 彻底重置 AI 交互状态
    store.aiStatus = {
        connectionState: 'connected', // 保持连接状态
        isThinking: false             // 强制停止思考
    };
    store.aiResult = 'none';

    store.gameTime = {
        year: getRandomInt(...TIME_INIT_RANGES.year),
        month: getRandomInt(...TIME_INIT_RANGES.month),
        day: getRandomInt(...TIME_INIT_RANGES.day),
        hour: getRandomInt(...TIME_INIT_RANGES.hour),
        minute: getRandomInt(...TIME_INIT_RANGES.minute)
    };
    store.questSystem = {
    mainLine: [],
    sideLine: [],
    history: []
    };

    console.log("🧹 Store 状态已彻底重置");
};