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

// src/map/mapmanager_modules/MapNavigation.js

// 引入依赖
import { NodeType, NodeState } from '../MapData.js';
import { MapGenerator } from '../MapGenerator.js';
import { MapTheme } from '../../config/MapThemes.js'; 
import { addLog } from '../../ui/modules/store.js';
import { store } from '../../ui/modules/store.js';

// 引入 LLM 调用
import { Game_Manager } from '../../LLM/Game_Manager.js';
import { Call_Map_Named } from '../../LLM/calls/Call_Map_Named.js';
import { Call_Plot_Design } from '../../LLM/calls/Call_Plot_Design.js';
import { Call_Node_Generate } from '../../LLM/calls/Call_Node_Generate.js';

// 引入对话 UI 数据与 LLM 记忆模块
import { ChatData } from '../../ui/modules/ChatData.js';
import { Chat_Memory } from '../../LLM/memory/Chat_Memory.js';

// 引入系统 (用于拦截器判断或触发)
// 战斗系统
import { CombatManager } from '../../battle/CombatManager.js';
// 抉择系统
import { ChoiceSystem } from '../../systems/ChoiceSystem/ChoiceSystem.js';
// H互动系统
import { HInteractionSystem } from '../../systems/HInteractionSystem/HInteractionSystem.js';
// 商店系统
import { ShopSystem } from '../../systems/ShopSystem/ShopSystem.js';
// 旅店系统
import { RestSystem } from '../../systems/RestSystem/RestSystem.js';
// 机遇系统
import { ResourceSystem } from '../../systems/ResourceSystem/ResourceSystem.js';

/**
 * 子模块：地图导航 (MapNavigation)
 * 职责：处理节点移动、拦截器逻辑、事件触发、迷雾驱散、传送门逻辑以及惰性生成
 */
export class MapNavigation {

    // 获取LLM生成层数的配置
    static get LAZY_GEN_LAYERS() { return store.config.map.lazyGenLayers; }
    static get INITIAL_GEN_LAYERS() { return store.config.map.initialGenLayers; }

    constructor(manager) {
        this.manager = manager;
        this._history = {
            lastNodeId: null,
            revealedNodes: [] // 记录本次移动刚刚揭示的节点 ID 列表
        };
    }

    // ==========================================
    // Core Logic: Move To Node
    // ==========================================

    /**
     * [重构] 移动到指定节点 (Move-Then-Check 模式)
     */
    moveToNode(targetNodeId, force = false) {
        const map = this.manager.currentMap;
        if (!map) return { success: false };

        const startNodeId = map.currentNodeId;

        const targetNode = map.nodes.find(n => n.id === targetNodeId);
        
        // 1. 基础校验 (迷雾中不可移动)
        if (!targetNode || targetNode.state === NodeState.LOCKED) {
            return { success: false, message: "无法移动到目标节点" };
        }

        // 🟢 [新增] 在改变状态前，判定是否为初次探索
        // 如果节点既不是 VISITED 也不是 CURRENT，说明是第一次来 (REVEALED)
        const isFirstTime = (targetNode.state !== NodeState.VISITED && targetNode.state !== NodeState.CURRENT);

        // =========================================
        // 🟢 阶段一：执行物理移动与状态更新
        // =========================================
        
        // 1.1 记录回滚点 (如果不是原地踏步)
        if (map.currentNodeId !== targetNodeId) {
            this._history.lastNodeId = map.currentNodeId;
            this._history.revealedNodes = []; // 清空上一轮的揭示记录
        }

        // 1.2 更新旧节点状态
        const oldNode = map.nodes.find(n => n.id === map.currentNodeId);
        if (oldNode && oldNode.state === NodeState.CURRENT) {
            oldNode.state = NodeState.VISITED;
        }

        // 1.3 更新新节点状态
        targetNode.state = NodeState.CURRENT;
        map.currentNodeId = targetNode.id;

        // 1.4 同步 UI (让玩家立即看到自己到了新位置)
        this._syncWorldState(targetNode);

        // 1.5 揭示迷雾并记录 (供 retreat 使用)
        // 只有非章节传送门才揭示
        if (targetNode.type !== NodeType.PORTAL_NEXT_CHAPTER) {
            const revealedIds = this.revealNeighbors(targetNode);
            this._history.revealedNodes = revealedIds;
        }

        // 1.6 移动后处理 (时间流逝等)
        if (targetNode.id !== startNodeId) {
            this._postMoveProcess(targetNode);
        }

        // =========================================
        // 🟢 阶段二：触发节点事件 (可能会导致战斗或传送)
        // =========================================
        
        // 2.1 触发常规/战斗/交互事件
        // 🟢 [修改] 将 isFirstTime 状态透传进去
        this._triggerNodeEvents(targetNode, isFirstTime);

        // 2.2 处理特殊的传送门逻辑 (Next Floor / SubMap)
        // 如果触发了 switchMap，这部分逻辑会处理
        const portalResult = this._handlePortals(targetNode);
        if (portalResult) return portalResult;

        return { success: true };
    }

    /**
     * [新增] 撤退/回滚逻辑
     * 场景：战斗失败/逃跑时调用，退回上一步并重新封锁刚刚揭示的迷雾
     */
    retreat() {
        const map = this.manager.currentMap;
        // 如果没有上一步记录，或者刚进地图没法退，则不做处理
        if (!map || !this._history.lastNodeId) {
            console.warn("[MapNavigation] 无法撤退：没有历史记录");
            return;
        }

        console.log("[MapNavigation] 🏳️ 触发撤退逻辑，正在回滚...");

        // 1. 还原当前节点状态 (从 CURRENT 退回到 VISITED 或 REVEALED)
        // 注意：因为我们是“失败”了，说明没有完全征服这个节点，通常把它设回 REVEALED (可见但未完成)
        // 但如果该节点本身就是可以重复访问的(如 ROOT)，则设为 VISITED
        const currentNode = map.nodes.find(n => n.id === map.currentNodeId);
        if (currentNode) {
            currentNode.state = NodeState.REVEALED; // 重置为"未访问"状态
        }

        // 2. 还原上一个节点状态
        const lastNode = map.nodes.find(n => n.id === this._history.lastNodeId);
        if (lastNode) {
            lastNode.state = NodeState.CURRENT;
            map.currentNodeId = lastNode.id;
            
            // 立即同步 UI
            this._syncWorldState(lastNode);
        }

        // 3. 重新封锁迷雾 (Re-Fog)
        // 将本次移动顺带揭示的邻居重新锁上
        if (this._history.revealedNodes.length > 0) {
            this._history.revealedNodes.forEach(nodeId => {
                const node = map.nodes.find(n => n.id === nodeId);
                if (node) {
                    node.state = NodeState.LOCKED;
                }
            });
            console.log(`[MapNavigation] 迷雾回滚: 隐藏了 ${this._history.revealedNodes.length} 个节点`);
            this._history.revealedNodes = [];
        }
        
        // 4. 发送通知
        addLog("你退回了之前的区域...");
    }

    // ==========================================
    // Internal Helpers: Pipeline Steps
    // ==========================================

    /**
     * [重构] 触发节点事件
     * @param {Object} targetNode 
     * @param {boolean} isFirstTime - [新增] 是否初次访问 (由 moveToNode 传入)
     */
    _triggerNodeEvents(targetNode, isFirstTime) {
        
        // A. 战斗触发
        const Isfight = targetNode.type === NodeType.COMBAT;
        // 🟢 [修改] 直接使用 isFirstTime 判断是否触发战斗 (避免无限重复触发)
        if (Isfight && isFirstTime) {
            const enemies = targetNode.payload?.enemies || [];
            console.log("[MapNavigation] ⚔️ 遭遇敌人，启动战斗...");
            
            CombatManager.requestBattle(enemies, {
                source: 'map_node',
                nodeId: targetNode.id
            });
            return; 
        }

        // 1. 定义哪些类型的节点可能带有剧情
        const STORY_NODE_TYPES = [
            NodeType.EVENT_CHOICE, 
            NodeType.EVENT_QUEST, 
            NodeType.PORTAL_NEXT_FLOOR,   // <--- 新增
            NodeType.PORTAL_NEXT_CHAPTER  // <--- 新增
        ];

        // 2. 检查条件：类型匹配 + 初次访问 + 确实有剧本数据
        if (STORY_NODE_TYPES.includes(targetNode.type) && isFirstTime) {
            
            // 特殊检查：如果是 NEXT_CHAPTER，且已经连接好了(有target)，则跳过剧情直接走传送逻辑
            // (防止已生成的章节入口重复触发生成剧情)
            const isChapterLinked = targetNode.type === NodeType.PORTAL_NEXT_CHAPTER && 
                                    targetNode.portalTarget && 
                                    targetNode.portalTarget !== 'NEXT_CHAPTER';

            if (!isChapterLinked && targetNode.payload && targetNode.payload.choice_scenes) {
                 console.log(`[MapNavigation] 📜 触发剧情事件: ${targetNode.type}`);
                 ChoiceSystem.startChoice(targetNode, true);
                 return; // <--- 拦截！不再执行后续的 _handlePortals
            }
        }

        // C. 未成形的传送门 (需要生成)
        if (targetNode.type === NodeType.PORTAL_NEXT_CHAPTER) {
            const isLinked = targetNode.portalTarget && targetNode.portalTarget !== 'NEXT_CHAPTER';
            if (!isLinked) {
                console.log("[MapNavigation] 🌀 发现未成形传送门，启动生成抉择...");
                ChoiceSystem.startChoice(targetNode, true);
                return;
            }
        }
        
        // D. 常规一次性事件 (资源/H)
        // 🟢 [修改] 透传 isFirstTime
        this._handleEvents(targetNode, isFirstTime);
    }

    /**
     * 步骤 3: 事件触发
     * 处理 Resource, H, Shop, Rest
     */
    _handleEvents(targetNode, isFirstTime) {
        

        // A. 仅触发一次
        if (isFirstTime) {
            if (targetNode.type === NodeType.RESOURCE) {
                //  [接入] 资源系统
                // ResourceSystem 是静态类，直接 execute 即可
                // payload.actions 包含了具体的奖励内容
                console.log("[MapNavigation] 💎 触发资源事件");
                
                // 1. 执行发放逻辑
                ResourceSystem.execute(targetNode.payload);
                
                // 2. 强制更新节点为 VISITED 
                // (虽然 ResourceSystem 内部试图做这件事，但在 Navigation 里显式更新更安全)
                targetNode.state = NodeState.VISITED;
            }
            else if (targetNode.type === 'EVENT_H') {
                // 🟢 [接入] H互动系统
                console.log("[MapNavigation] ❤️ 触发H互动事件");
                
                const payload = targetNode.payload || {};
                
                // 1. 提取参数 (兼容单人与多人)
                // 如果 payload 里是 ids 数组则直接用，如果是单个 id 则转数组
                // 兜底：如果没有 id，则尝试用 name 或生成个临时的，但在你的设计里 id 是必须的
                const charIds = payload.charIds || payload.charId || []; 
                const eventName = payload.eventName || "未知遭遇";
                
                // 2. 启动系统
                // 传入 context 以便 HSystem 获取时间地点
                if (charIds.length > 0 || typeof charIds === 'string') {
                    HInteractionSystem.startInteraction(charIds, eventName, {
                        context: {
                             source: 'map_node',
                             nodeId: targetNode.id
                        }
                    });

                    // 3. 标记访问 (H事件通常也是一次性的，除非有特殊设计)
                    targetNode.state = NodeState.VISITED;
                } else {
                    console.warn("[MapNavigation] ⚠️ H事件缺少角色ID，跳过启动");
                }
            }
        }

        // B. 可重复触发
        if (targetNode.type === NodeType.SHOP) {
            ShopSystem.open(targetNode.payload);
        }
        else if (targetNode.type === NodeType.REST) {
            RestSystem.open(targetNode);
        }
    }

    /**
     * 步骤 5: 移动后处理
     * 时间流逝、支线寿命、迷雾驱散
     */
    _postMoveProcess(targetNode) {
        // 1. 调试日志
        console.log(`[Debug] 抵达节点: ${targetNode.name} (${targetNode.id})`);
        
        // 2. 时间流逝
        if (window.uiStore) {
            const hAdd = Math.floor(Math.random() * 2) + 1; 
            const mAdd = Math.floor(Math.random() * 61);    
            window.uiStore.update_time(window.uiStore.gameTime, 0, 0, 0, hAdd, mAdd);
        }

        // 3. 支线寿命 Tick (调用 SubMapService，如果 manager 集成了的话)
        if (this.manager.tickWorldLife) {
            this.manager.tickWorldLife();
        }

        // 4. 驱散迷雾 (除了章节传送门外都驱散)
        if (targetNode.type !== NodeType.PORTAL_NEXT_CHAPTER) {
            this.revealNeighbors(targetNode);
        }
    }

    /**
     * 🟢 [新增] 同步世界状态到全局 Store
     * 确保 UI (HUD/对话框) 能够立即感知到位置变化
     */
    _syncWorldState(targetNode) {
        if (!window.uiStore || !window.uiStore.worldState) return;

        // 1. 立即同步节点名称
        window.uiStore.worldState.nodeName = targetNode.name;
        
        // 2. 同步地图名称
        if (this.manager.currentMap) {
            window.uiStore.worldState.mapName = this.manager.currentMap.name;
        }
        
        console.log(`[MapNavigation] 📍 UI 位置已同步为: ${targetNode.name}`);
    }

    /**
     * 步骤 6: 传送门处理 (修正版)
     * 职责：处理实际的功能跳转 (在拦截器放行后执行)
     */
    _handlePortals(targetNode) {
        // A. 下层入口 (功能：解锁邻居 + 惰性生成)
        // 逻辑：当节点变为 VISITED 后，玩家再次点击(移动上去)时触发
        if (targetNode.type === NodeType.PORTAL_NEXT_FLOOR) {
            console.log("[MapNavigation] 🚪 穿过下层通道...");
            
            targetNode.nextNodes.forEach(nextId => {
                const next = this.manager.currentMap.nodes.find(n => n.id === nextId);
                // 只有锁定的节点才揭示，避免覆盖已访问状态
                if (next && next.state === NodeState.LOCKED) {
                    next.state = NodeState.REVEALED;
                }
            });
            
            // 触发惰性生成
            this.triggerLazyGeneration(targetNode.layerIndex + 1, MapNavigation.LAZY_GEN_LAYERS);
            
            // 🟢 注意：这里没有 return，因为下层入口通常也是一个物理地块，玩家可以站上去
        }

        // B. 章节/地图跳转 (功能：SwitchMap)
        if (targetNode.type === NodeType.PORTAL_NEXT_CHAPTER) {
            
            // 情况 1: 尚未连接 (理论上第一次点击会触发拦截器去生成，这里是兜底)
            if (targetNode.portalTarget === 'NEXT_CHAPTER' || !targetNode.portalTarget) {
                console.warn("[MapNavigation] ⚠️ 试图穿越未成形的传送门");
                return { success: false, message: "通道尚未稳定" };
            }
            
            // 情况 2: 已连接 -> 执行实际跳转
            else {
                return this._enterSubMap(targetNode);
            }
        }

        // C. 退出支线
        if (targetNode.type === NodeType.ROOT && this.manager.currentMap.parentMapId) {
            return this._exitSubMap();
        }

        return null; 
    }

    // ==========================================
    // Portal Logic Details
    // ==========================================

    _generateAndSwitchToNextChapter(targetNode) {
        const nextChapterId = `chapter_${Date.now()}_main`; 
        
        // 更新管理器状态
        // 注意：这里假设 manager 暴露了 registry 或允许修改 chapterCount
        // 更好的做法是调用 manager.incrementChapter()，这里直接改属性模拟原逻辑
        if(this.manager.registry) this.manager.registry.chapterCount++;

        const themeKeys = Object.keys(MapTheme); 
        const randomKey = themeKeys[Math.floor(Math.random() * themeKeys.length)];
        const selectedTheme = MapTheme[randomKey];

        const newMap = MapGenerator.generate({
            mapId: nextChapterId,
            type: 'MAIN',
            themeId: selectedTheme.id,
            difficulty: 2,
            parentMapId: this.manager.currentMap.mapId 
        });
        
        this.manager.registerMap(newMap);

        // 修复：立即指向新ID
        targetNode.portalTarget = nextChapterId;

        this.manager.switchMap(nextChapterId);
        
        // LLM 生成
        Game_Manager.sendRequest([
            Call_Plot_Design.constructRequest(newMap),
            Call_Map_Named.constructRequest(newMap), 
            Call_Node_Generate.constructRequest(newMap, 0, MapNavigation.INITIAL_GEN_LAYERS)
        ]);

        newMap.maxGeneratedLayer = MapNavigation.INITIAL_GEN_LAYERS - 1;

        return { success: true, mapChanged: true, message: `进入了 ${selectedTheme.name}` };
    }

    _enterSubMap(targetNode) {
        console.log(`[MapNavigation] 尝试进入区域: ${targetNode.portalTarget}`);
        
        const success = this.manager.switchMap(targetNode.portalTarget);
        
        if (success) {
            // 记录返回点
            const newMap = this.manager.currentMap; 
            if (newMap.parentMapId) {
                // 这里需要访问 Registry 获取父地图
                const parentMap = this.manager.getMap(newMap.parentMapId);
                if (parentMap) {
                    newMap.returnNodeId = targetNode.id; 
                }
            }
            return { success: true, mapChanged: true, message: `正在进入 ${newMap.name || '未知区域'}...` };
        } else {
            console.error(`[MapNavigation] 进入失败，地图 ${targetNode.portalTarget} 不存在`);
            return { success: false, message: "该区域的入口已坍塌" };
        }
    }

    _exitSubMap() {
        const currentMap = this.manager.currentMap;
        const parentId = currentMap.parentMapId;
        const isSubMap = currentMap.type === 'SUB';
        
        const parentMap = this.manager.getMap(parentId);

        if (parentMap) {
            // 重置父地图位置
            const returnId = currentMap.returnNodeId;
            if (isSubMap && returnId) {
                parentMap.currentNodeId = returnId;
                const safeNode = parentMap.nodes.find(n => n.id === returnId);
                if (safeNode) safeNode.state = NodeState.CURRENT;
            }

            this.manager.switchMap(parentId);
            return { success: true, mapChanged: true, message: "完成探索，撤离区域" };
        }
        return null;
    }

    // ==========================================
    // Fog of War & Lazy Generation
    // ==========================================

    /**
     * [修改] 驱散当前节点同层左右邻居的迷雾
     * 返回被揭示的节点 ID 列表，供回滚使用
     */
    revealNeighbors(centerNode) {
        const map = this.manager.currentMap;
        if (!map) return []; // 修改返回为空数组

        const layerNodes = map.nodes.filter(n => n.layerIndex === centerNode.layerIndex);
        layerNodes.sort((a, b) => a.x - b.x);

        const index = layerNodes.findIndex(n => n.id === centerNode.id);
        if (index === -1) return [];

        const revealed = []; // 记录本次揭示的节点

        // 辅助函数
        const tryReveal = (node) => {
            if (node.state === NodeState.LOCKED) {
                node.state = NodeState.REVEALED;
                revealed.push(node.id);
            }
        };

        // 解锁左邻
        if (index > 0) tryReveal(layerNodes[index - 1]);
        // 解锁右邻
        if (index < layerNodes.length - 1) tryReveal(layerNodes[index + 1]);

        return revealed;
    }

    /**
     * 惰性生成触发器 (修复版)
     */
    triggerLazyGeneration(startLayer, count) {
        const map = this.manager.currentMap;
        if (!map) return;

        const currentMax = typeof map.maxGeneratedLayer === 'number' ? map.maxGeneratedLayer : -1;

        // 1. 如果请求的起始层已经在生成范围内，则跳过
        if (startLayer <= currentMax) return;

        // 2. 🟢 [修复] 计算并截断目标层级
        // 理论目标层 = 起始 + 数量 - 1
        let targetMaxLayer = startLayer + count - 1;

        // 强制不超过地图的最大深度
        if (targetMaxLayer > map.maxDepth) {
            targetMaxLayer = map.maxDepth;
        }

        // 3. 更新进度标记 (现在它是安全的了)
        map.maxGeneratedLayer = targetMaxLayer;

        // 4. 🟢 [优化] 计算实际需要向 LLM 请求生成的数量
        // 比如：Start=4, Count=3, MaxDepth=4. Target=4.
        // EffectiveCount = 4 - 4 + 1 = 1. 只生成第4层，不再请求不存在的5,6层。
        const effectiveCount = targetMaxLayer - startLayer + 1;

        if (effectiveCount > 0) {
            console.group(`[MapNavigation] ⚡ 触发新批次生成`);
            console.log(`- Request: L${startLayer} -> L${targetMaxLayer} (Count: ${effectiveCount})`);
            console.groupEnd();

            Game_Manager.sendRequest([
                Call_Node_Generate.constructRequest(map, startLayer, effectiveCount)
            ]);
        } else {
            console.log(`[MapNavigation] ⚠️ 已达到地图底部，无需生成更多层级`);
        }
    }
    
    /**
     * 获取当前节点层级 (辅助)
     */
    getCurrentNodeLayer() {
        const map = this.manager.currentMap;
        if (!map) return 0;
        const node = map.nodes.find(n => n.id === map.currentNodeId);
        return node ? node.layerIndex : 0;
    }

    /**
     * 🟢 [新增] 根据配置生成指定的主线章节 (由 ChoiceSystem 触发)
     * @param {Object} config - 来自 LLM 的配置 (包含 themeId, mapName, distribution 等)
     */
    generateSpecificNextChapter(config = {}) {
        const nextChapterId = `chapter_${Date.now()}_main`; 

        if(this.manager.registry) this.manager.registry.chapterCount++;

        // 1. 构造生成配置 (优先使用传入的 config，未提供则回退默认)
        const genConfig = {
            mapId: nextChapterId,
            type: 'MAIN',
            
            // 核心参数 (LLM 注入)
            themeId: config.themeId,           
            name: config.mapName,              
            distribution: config.distribution, 
            mandatoryNodes: config.mandatoryNodes,
            
            difficulty: config.difficulty || 2,
            
            // 继承当前地图 ID 作为父节点
            parentMapId: this.manager.currentMap ? this.manager.currentMap.mapId : null
        };

        console.log("[MapNavigation] 🏗️ 正在构建下一章:", genConfig);

        // 2. 调用生成器
        const newMap = MapGenerator.generate(genConfig);
        this.manager.registerMap(newMap);

        // ==================================================
        // 🟢 [修正顺序] 先回写旧地图连接，再切换
        // ==================================================
        const oldMap = this.manager.currentMap; // 1. 先获取当前地图(旧图)
        
        if (oldMap) {
            // 2. 在旧地图中找到出口节点
            const exitNode = oldMap.nodes.find(n => n.type === NodeType.PORTAL_NEXT_CHAPTER);
            if (exitNode) {
                console.log(`[MapNavigation] 🔗 建立连接: ${exitNode.id} -> ${nextChapterId}`);
                // 3. 修改路标，这样 _checkInterceptors 里的 isLinked 判断下次就会生效
                exitNode.portalTarget = nextChapterId; 
            }
        }

        // 3. 立即切换地图
        this.manager.switchMap(nextChapterId);
        
        // 4. 触发 LLM 内容填充 (Plot, Named, Nodes)
        // 这一步会让 LLM 根据新的 ThemeID 去生成匹配的剧情和节点名
        Game_Manager.sendRequest([
            Call_Plot_Design.constructRequest(newMap),
            Call_Map_Named.constructRequest(newMap), 
            Call_Node_Generate.constructRequest(newMap, 0, MapNavigation.INITIAL_GEN_LAYERS)
        ]);

        newMap.maxGeneratedLayer = MapNavigation.INITIAL_GEN_LAYERS - 1;

        console.log(`[MapNavigation] 🚀 跳转至新章节: ${newMap.name}`);
        
        // 可选：给个全服通知
        addLog(`🌎 踏入了新的领域: ${newMap.name}`);

        return { success: true, mapChanged: true };
    }

    /**
     * 🟢 [新增] 跨地图传送 (Teleport)
     * 场景：世界地图跳转、回城卷轴等
     * 逻辑：切换地图 -> 定位ROOT节点 -> 强制移动 -> 同步环境
     */
    teleportToMap(targetMapId) {
        // 1. 尝试切换地图实例 (由 Registry 处理激活状态)
        const switchSuccess = this.manager.switchMap(targetMapId);
        if (!switchSuccess) {
            return { success: false, message: "目标区域无法定位" };
        }

        const map = this.manager.currentMap;

        // 2. 寻找安全着陆点 (通常是 ROOT 节点)
        // 如果找不到 ROOT，尝试找当前记录的 currentNodeId，再不行找第一个节点
        let landingNode = map.nodes.find(n => n.type === NodeType.ROOT);
        
        if (!landingNode) {
            // 兜底：如果没有 ROOT 节点 (极少见)，尝试停留在上次离开的位置
            landingNode = map.nodes.find(n => n.id === map.currentNodeId) || map.nodes[0];
        }

        if (!landingNode) {
            return { success: false, message: "目标区域没有安全的着陆点" };
        }

        console.log(`[MapNavigation] 🌀 传送着陆: ${map.name} -> ${landingNode.name}`);

        // 3. 强制更新节点状态
        // 3.1 清除该地图旧的 CURRENT 状态 (如果有)
        const oldCurrent = map.nodes.find(n => n.state === NodeState.CURRENT);
        if (oldCurrent && oldCurrent.id !== landingNode.id) {
            oldCurrent.state = NodeState.VISITED;
        }

        // 3.2 设置新位置
        landingNode.state = NodeState.CURRENT;
        map.currentNodeId = landingNode.id;

        // 4. 环境同步
        // 4.1 立即更新 UI (HUD 地名)
        this._syncWorldState(landingNode);

        // 4.2 驱散着陆点周围的迷雾 (防止传送过去周围全是黑的)
        this.revealNeighbors(landingNode);
        
        // 4.3 记录日志
        addLog(`你传送到了 [${map.name}] 的入口。`);

        return { success: true };
    }

}