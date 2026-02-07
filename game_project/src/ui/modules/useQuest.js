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

// src/ui/modules/useQuest.js
import { store, addLog } from './store.js';
import { Plot_Memory } from '../../LLM/memory/Plot_Memory.js';

/**
 * ==========================================
 * 任务系统逻辑模块 (Quest System Logic) v2.2
 * ==========================================
 * 核心升级：
 * 1. 支持全地图深度记忆：无论玩家身在何处，都能正确显示已探索过的支线进度。
 */

export function useQuest() {

    /**
     * 辅助：解析单层任务数据
     */
    const _parseTaskEntry = (stages, layerIndex) => {
        // ... (保持不变) ...
        const taskKey = `task${layerIndex}`;
        const stageKey = `stage${layerIndex}`;
        
        let title = `Layer ${layerIndex} 探索`;
        let desc = "（暂无详细记录）";
        
        if (stages[taskKey]) {
            title = stages[taskKey];
            desc = stages[stageKey] || "";
        } else if (stages[stageKey]) {
            title = "探索未知区域";
            desc = stages[stageKey];
        }

        return {
            layer: layerIndex,
            title: title,
            description: desc,
            status: 'unknown' 
        };
    };

    /**
     * 🟢 [新增] 核心辅助：计算指定地图 ID 的最大探索深度
     * 原理：去 MapManager 的仓库里把那个地图找出来，遍历它的节点状态。
     */
    const _calculateMaxLayer = (mapId) => {
        const manager = window.mapManager;
        if (!manager || !manager.maps) return 0;

        // 尝试获取地图对象
        // 如果 mapId 就是当前地图，直接取 currentMap，否则去 registry 找
        let targetMap = null;
        if (manager.currentMap && manager.currentMap.mapId === mapId) {
            targetMap = manager.currentMap;
        } else {
            targetMap = manager.maps[mapId];
        }

        if (!targetMap || !targetMap.nodes) return 0; // 地图不存在，默认0层

        let maxLayer = 0;
        targetMap.nodes.forEach(n => {
            // 只要节点被访问过(VISITED)或者是当前位置(CURRENT)，就算作已到达
            if (n.state === 'VISITED' || n.state === 'CURRENT') {
                if (n.layerIndex > maxLayer) {
                    maxLayer = n.layerIndex;
                }
            }
        });
        return maxLayer;
    };

    /**
     * 同步任务数据 (Sync Data)
     */
    const syncQuestData = () => {
        const manager = window.mapManager;
        if (!manager || !manager.currentMap) {
            console.warn("[Quest] MapManager 未就绪");
            return false;
        }

        const currentMap = manager.currentMap;
        const currentLayer = manager.getCurrentNodeLayer(); 

        try {
            // ===============================================
            // 1. 同步当前主线 (Main Timeline)
            // ===============================================
            const mainLineData = [];
            const chapterData = Plot_Memory.getChapterData(currentMap.mapId);

            // 🟢 [修改] 使用通用函数计算当前主线的最大深度
            const maxReachedLayer = _calculateMaxLayer(currentMap.mapId);

            let maxMemoryLayer = 0;
            if (chapterData && chapterData.stages) {
                Object.keys(chapterData.stages).forEach(key => {
                    const match = key.match(/^(?:task|stage)(\d+)$/);
                    if (match) {
                        const l = parseInt(match[1]);
                        if (l > maxMemoryLayer) maxMemoryLayer = l;
                    }
                });
            }

            const loopEnd = Math.max(maxReachedLayer, maxMemoryLayer);

            for (let i = 0; i <= loopEnd; i++) {
                const stagesSource = (chapterData && chapterData.stages) ? chapterData.stages : {};
                const entry = _parseTaskEntry(stagesSource, i);
                
                // 遮蔽判定
                entry.isRedacted = i > maxReachedLayer;

                // 状态判定
                if (i < currentLayer) {
                    entry.status = 'completed';
                } else if (i === currentLayer) {
                    entry.status = 'active';
                } else {
                    entry.status = 'active'; 
                }
                
                mainLineData.unshift(entry);
            } // Loop End

            // ===============================================
            // 2. 同步支线任务 (Side Quests)
            // ===============================================
            const subMaps = manager.getSubMaps(); 
            
            const sideLineData = subMaps.map(map => {
                const subPlot = Plot_Memory.getChapterData(map.id);
                let tasks = [];
                
                // 🟢 [修改] 获取该支线地图的历史最大探索深度
                const subMapMaxReached = _calculateMaxLayer(map.id);

                // 找出 LLM 生成的最大层数 (Memory Depth)
                let subMapMemoryDepth = 0;
                if (subPlot && subPlot.stages) {
                    Object.keys(subPlot.stages).forEach(key => {
                        const match = key.match(/^(?:task|stage)(\d+)$/);
                        if (match) {
                            const l = parseInt(match[1]);
                            if (l > subMapMemoryDepth) subMapMemoryDepth = l;
                            
                            // 收集所有任务数据，稍后排序
                            // 这里我们先暂时收集，下面再统一构造
                        }
                    });
                }
                
                // 决定循环终点：取 (探索深度 vs 记忆深度) 的最大值
                // 这样能保证：
                // 1. 玩家探索过的地方显示正常文本
                // 2. 玩家没去过但LLM已生成的地方显示“遮蔽文本”
                const subLoopEnd = Math.max(subMapMaxReached, subMapMemoryDepth);

                for(let i=0; i<=subLoopEnd; i++) {
                    const stagesSource = (subPlot && subPlot.stages) ? subPlot.stages : {};
                    // 如果这一层在 memory 里啥都没有，且也没探索过，_parseTaskEntry 会返回默认占位符
                    // 我们可以过滤掉完全不存在的层级，但为了显示"未知的前方"，保留也无妨
                    
                    // 只有当 memory 里确实有这一层的 key，或者这一层被探索过，我们才添加
                    // 否则 LLM 可能只生成了 task0 和 task3，中间的 1,2 可能是空的
                    // 这里为了简单，我们假设是连续的，或者 _parseTaskEntry 能处理空值
                    
                    const t = _parseTaskEntry(stagesSource, i);
                    
                    // 🟢 核心修正：使用该地图自己的 subMapMaxReached 来判断遮蔽
                    // 不再关心玩家当前是不是在这个地图里
                    t.isRedacted = t.layer > subMapMaxReached;

                    tasks.push(t);
                }

                if (tasks.length === 0) {
                    tasks.push({ layer: 0, title: "探索裂缝深处", description: "寻找异常的源头...", isRedacted: false });
                }

                return {
                    id: map.id,
                    name: map.name,
                    layerIndex: map.layerIndex, 
                    life: map.life,
                    isPinned: map.isPinned,
                    tasks: tasks 
                };
            });

            // ... (历史回顾逻辑保持不变) ...
            
            // ===============================================
            // 3. 同步历史回顾 (Past Chronicles)
            // ===============================================
            const historyData = [];
            const allChapters = Plot_Memory.data.chapters;

            Object.keys(allChapters).forEach(chapId => {
                if (chapId !== currentMap.mapId && chapId.includes('chapter')) {
                    const oldChap = allChapters[chapId];
                    const stagesKeys = Object.keys(oldChap.stages || {});
                    // 简单取最后一条
                    const lastStageKey = stagesKeys[stagesKeys.length - 1];
                    
                    historyData.push({
                        id: chapId,
                        title: `Chapter ${chapId.split('_')[1] || '?'}`,
                        summary: oldChap.stages[lastStageKey] || "一段尘封的回忆...",
                        progress: oldChap.progress || "100%"
                    });
                }
            });

            // ===============================================
            // 4. 写入全局 Store
            // ===============================================
            if (store.questSystem) {
                store.questSystem.mainLine = mainLineData;
                store.questSystem.sideLine = sideLineData;
                store.questSystem.history = historyData;
                
                if (mainLineData.length > 0) {
                    store.activeQuest.title = currentMap.name;
                    // 显示最新的那一个任务目标 (第一个是倒序后的最大层级)
                    store.activeQuest.target = mainLineData[0].title; 
                }
            }

            return true;

        } catch (e) {
            console.error("[Quest] 同步失败:", e);
            addLog("❌ 任务日志同步异常");
            return false;
        }
    };

    return {
        syncQuestData
    };
}