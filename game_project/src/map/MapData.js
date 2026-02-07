/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/map/MapData.js

// ==========================================
// 1. 枚举常量定义 (Enums)
// ==========================================

/**
 * 地图节点类型
 * 决定了节点图标、颜色以及触发的事件类型
 */
export const NodeType = {
    ROOT:       'ROOT',       // 营地/撤离点
    COMBAT:     'COMBAT',     // 战斗
    // --- 细化后的事件类型 ---
    EVENT_CHOICE: 'EVENT_CHOICE', // 情况1: 抉择系统
    EVENT_H:      'EVENT_H',      // 情况2: H互动系统
    EVENT_QUEST:  'EVENT_QUEST',
    // -----------------------
    RESOURCE:   'RESOURCE',   // 机遇
    SHOP:       'SHOP',       // 商店
    REST:       'REST',       // 旅馆/休息点
    // 拆分后的传送门类型
    PORTAL_NEXT_FLOOR:   'PORTAL_NEXT_FLOOR',   // 深层入口 (前往下一层)
    PORTAL_NEXT_CHAPTER: 'PORTAL_NEXT_CHAPTER', // 章节出口 (前往新地图)

    LOCATION: 'LOCATION' // [新增] 地标/地点节点 (用于环境叙事，无特殊功能)
    
};

/**
 * 节点迷雾状态
 * 决定了节点在 UI 上如何显示以及是否可交互
 */
export const NodeState = {
    LOCKED:     'LOCKED',     // 🔒 迷雾中 (不可见/问号)
    REVEALED:   'REVEALED',   // 👁️ 可见 (显示图标，可点击)
    VISITED:    'VISITED',    // ✅ 已访问 (灰色，通常不可再次点击)
    CURRENT:    'CURRENT'     // 📍 玩家当前所在位置
};

// ==========================================
// 2. 核心数据类 (MapNode)
// ==========================================

export class MapNode {
    /**
     * @param {Object} config - 初始化配置对象
     */
    constructor(config) {
        // --- 基础拓扑信息 (骨架) ---
        this.id = config.id;                // 唯一标识符 (如 "n1_2")
        this.type = config.type || NodeType.EVENT_H;
        this.name = config.name || "未知区域";
        this.layerIndex = config.layerIndex || 0; // 所在的层级 (0, 1, 2...)
        
        // --- 连接关系 ---
        // 存储后续节点的 ID 列表 (有向图的边)
        this.nextNodes = config.nextNodes || []; 
        
        // --- 运行时状态 ---
        // 默认为 LOCKED，除非是入口
        this.state = config.state || NodeState.LOCKED;
        
        // --- 渲染坐标 (由布局算法计算填充) ---
        // 我们不使用物理引擎，但需要 x,y 来画图
        // 优先使用传入的 config.x/y，如果没有传则默认为 0
        this.x = config.x !== undefined ? config.x : 0;
        this.y = config.y !== undefined ? config.y : 0;

        // --- 子地图/传送配置 ---
        // 如果 type === PORTAL，这里存储目标子地图的信息
        this.portalTarget = config.portalTarget || null; 
        
        // --- 内容负载 (Lazy Load) ---
        // 标记是否已经由 LLM 生成了详细内容
        this.isGenerated = false;
        
        // 针对不同事件细化的 Payload 结构
        this.payload = {
            description: "",    // 通用环境描述

            // 情况1: 抉择数据 (由 LLM 预生成)
            choiceData: {
                scenario: "",   // 场景描述
                options: []     // { text, result, effect }
            },
            
            // 情况2: H互动 (仅预留名称，内容实时生成)
            hInteraction: {
                title: "",      // H事件名称
                isCompleted: false
            },
            
            // 情况3: 支线任务 (预生成对话，确认后再挂载地图)
            questData: {
                dialogue: [],   // 预生成的对话列表
                targetSubMap: null, // 接受后生成的支线地图ID
                isAccepted: false
            },
            
            main_line_map: null // 结构参考 MapGenerator 的 config，如 { themeId, name, distribution... }
        };
    }

    /**
     * 1. 判断是否允许移动到该节点
     * (用于 UI 点击检测：只要不是迷雾中的未知节点，都可以点)
     */
    get isTraversable() {
        // LOCKED = 迷雾中不可见
        // REVEALED = 新节点
        // VISITED = 旧节点
        // CURRENT = 当前位置
        return this.state !== NodeState.LOCKED; 
    }

    /**
     * 2. 判断到达该节点时，是否需要触发事件/战斗
     * (用于游戏逻辑判断)
     */
    get shouldTriggerEvent() {
        // 情况 A: 这是一个新节点 (REVEALED)
        // 必然触发 (不论是战斗、剧情还是捡东西)
        if (this.state === NodeState.REVEALED) return true;

        // 情况 B: 这是一个老节点 (VISITED)
        // 通常剧情和战斗只触发一次，但“功能性设施”每次去都能用
        if (this.state === NodeState.VISITED) {
            // 定义哪些类型的节点是可以重复互动的
            const repeatableTypes = [
                NodeType.SHOP,      // 商店买东西
                NodeType.REST,      // 旅馆回血
                NodeType.ROOT    // 记忆节点 (回父地图)
            ];
            return repeatableTypes.includes(this.type);
        }

        // 其他情况 (比如点自己 CURRENT) 不触发
        return false;
    }
}