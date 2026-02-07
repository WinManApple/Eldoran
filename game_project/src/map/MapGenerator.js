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

// src/map/MapGenerator.js
import { NodeType, NodeState, MapNode } from './MapData.js';
import { MapTheme } from '../config/MapThemes.js'; // 引入我们刚才写的参数表

export class MapGenerator {

    /**
     * 生成一张新地图 (动态化重构版 v2.2)
     * 🟢 核心升级：支持完全自定义 ThemeID
     * 允许传入不存在的 themeId (如 'THEME_CASTLE')，只要提供了 distribution，就不会回退到默认模板
     */
    static generate(config) {
        // 1. 打印调试信息，确认 MapTheme 里到底有哪些 Key
        console.log("🕵️ [Debug-Keys] MapThemes 可用键名:", Object.keys(MapTheme));

        // -----------------------------------------------------------
        // 🔴 强制硬编码测试
        const inputThemeId = 'THEME_FOREST'; 
        // -----------------------------------------------------------

        if (!config) {
            console.error("❌ MapGenerator 错误: config 为空");
            return null;
        }

        const chapterMatch = config.mapId ? config.mapId.match(/\d+/) : null;
        const chapterN = chapterMatch ? chapterMatch[0] : "x"; 
        let plotNodeIndex = 0; 

        // -----------------------------------------------------------
        // 🟢 [修复核心] 不要使用 replace 去掉 'THEME_' 前缀！
        // 因为 MapThemes.js 里的键名本身就包含 'THEME_'
        // -----------------------------------------------------------
        const themeKey = inputThemeId; 
        
        console.log(`🕵️ [Debug-Match] 正在尝试匹配: ${themeKey}`);

        // 尝试查找静态模板
        let baseTheme = MapTheme[themeKey];

        // 如果找不到
        if (!baseTheme) {
            console.warn(`[MapGenerator] ⚠️ 无法在 MapThemes 中找到 key: "${themeKey}"。可用的 key 有: ${Object.keys(MapTheme).join(', ')}`);
            
            // 只有当没有 distribution 时才回退到 DEFAULT
            if (!config.distribution) {
                baseTheme = MapTheme.DEFAULT;
            }
        } else {
            console.log(`✅ [MapGenerator] 成功匹配到主题模板: ${baseTheme.name}`);
        }
        
        // 3. 准备配置数据
        let effectiveMandatory = config.mandatoryNodes || baseTheme.mandatoryNodes;
        const effectiveDistribution = config.distribution || baseTheme.distribution;

        // 🟢 智能清洗保底节点 (防止自定义分布与默认保底冲突)
        if (config.distribution) {
            effectiveMandatory = effectiveMandatory.filter(type => {
                const weight = effectiveDistribution[type];
                // 如果显式定义权重为 0，则移除该保底节点
                if (weight !== undefined && weight <= 0) {
                    return false; 
                }
                return true;
            });
        }

        // 4. 构造最终生效主题 (Effective Theme)
        const theme = {
            id: inputThemeId, // 保持用户传入的 ID (这对 LLM 来说很重要，它会读到 "THEME_CASTLE")
            name: baseTheme.name,
            // 参数合并：优先用 config，其次用 baseTheme
            depthRange: config.depthRange || baseTheme.depthRange,
            nodeCountRange: config.nodeCountRange || baseTheme.nodeCountRange,
            hasPortal: (config.hasPortal !== undefined) ? config.hasPortal : baseTheme.hasPortal,
            allowCombat: (config.allowCombat !== undefined) ? config.allowCombat : baseTheme.allowCombat,
            mandatoryNodes: effectiveMandatory,
            distribution: effectiveDistribution
        };

        console.log(`[MapGenerator] 生成地图: [${config.type}] ${config.mapId}`);
        console.log(`   └─ 最终主题: ${theme.id}, 深度: [${theme.depthRange}]`);

        const isMain = config.type === 'MAIN';
        
        // 5. 计算深度
        const minDepth = theme.depthRange[0];
        const maxDepthVal = theme.depthRange[1];
        let maxDepth = this.getRandomInt(minDepth, maxDepthVal);

        if (!isMain && config.parentDepth) {
            const limit = Math.max(1, 7 - config.parentDepth);
            maxDepth = Math.min(maxDepth, limit);
        }
        
        // 主线地图出口固定在最后一层
        const nextChapterLayer = isMain ? maxDepth : -1;

        // 根据地图类型决定默认名称
        let defaultMapName = "";
        if (config.type === 'SUB') {
            defaultMapName = "支线地图(待重命名)";
        } else {
            // 如果是主线，保持原有的章节命名逻辑
            defaultMapName = `第${chapterN}章节 (待重命名)`;
        }

        const mapData = {
            mapId: config.mapId,
            type: config.type,
            name:  defaultMapName, // 如果 config.name 存在则使用，否则用模板名
            themeId: theme.id,               // 🟢 这里存入的就是 'THEME_CASTLE'
            maxDepth: maxDepth,
            nodes: [],
            parentMapId: config.parentMapId || null,
            entryNodeId: config.entryNodeId || null,
            life: isMain ? 9999 : 20,
            maxLife: isMain ? 9999 : 20,
            isLocked: false,
            isActive: false,
            currentNodeId: null
        };

        // ==========================================
        // 6. 逐层生成 (逻辑保持不变)
        // ==========================================
        let globalNodeIndex = 0; 

        for (let layer = 0; layer <= maxDepth; layer++) {
            // A. 确定数量
            const count = this.getRandomInt(theme.nodeCountRange[0], theme.nodeCountRange[1]);
            
            // B. 填充保底
            const mandatoryTypes = [...theme.mandatoryNodes]; 

            // B1. ROOT (Layer 0 必须有)
            if (layer === 0) {
                if (!mandatoryTypes.includes(NodeType.ROOT)) {
                    mandatoryTypes.unshift(NodeType.ROOT);
                }
            }

            // B2. 下层入口
            if (theme.hasPortal && layer < maxDepth) {
                mandatoryTypes.push(NodeType.PORTAL_NEXT_FLOOR); 
            }

            // B3. 章节出口
            if (isMain && layer === nextChapterLayer) {
                if (!mandatoryTypes.includes(NodeType.PORTAL_NEXT_CHAPTER)) {
                    mandatoryTypes.push(NodeType.PORTAL_NEXT_CHAPTER);
                }
            }

            // 🟢 B4. 支线地图保底逻辑
            // 如果当前是支线地图，且已经到达最后一层，强制加入一个抉择节点(已经存在了就不加)
            if (config.type === 'SUB' && layer === maxDepth) {
                if (!mandatoryTypes.includes(NodeType.EVENT_CHOICE)) {
                    mandatoryTypes.push(NodeType.EVENT_CHOICE);
                }
            }

            // C. 随机填充
            let currentCount = mandatoryTypes.length;
            let remainingSlots = Math.max(0, count - currentCount);

            for (let i = 0; i < remainingSlots; i++) {
                const randomType = this.getWeightedRandomType(theme);
                mandatoryTypes.push(randomType);
            }

            // D. 实例化节点
            this.shuffleArray(mandatoryTypes);

            mandatoryTypes.forEach((type, index) => {
                let finalType = type;
                let portalTarget = null;
                
                // --- 1. 确定节点类型与连接逻辑 (保持原有逻辑) ---
                if (type === NodeType.PORTAL_NEXT_FLOOR) {
                    if (layer < maxDepth) {
                        portalTarget = 'NEXT_LAYER';
                    } else {
                        finalType = NodeType.RESOURCE; // 到底层了，降级为普通资源
                        portalTarget = null;
                    }
                } 
                else if (type === NodeType.PORTAL_NEXT_CHAPTER) {
                    portalTarget = 'NEXT_CHAPTER';
                }

                // --- 2. 🟢 新增：构建 LLM 专用命名与描述 ---
                let nodeName = "";
                let nodeDesc = "";

                // 判断是否为"剧情节点" (传送门系列)
                const isPlotNode = (finalType === NodeType.PORTAL_NEXT_FLOOR && portalTarget === 'NEXT_LAYER') || 
                                (finalType === NodeType.PORTAL_NEXT_CHAPTER);

                if (isPlotNode) {
                    plotNodeIndex++; // 剧情计数 +1
                    // 命名格式: 第x章节第x个情节节点(待重命名)
                    nodeName = `第${chapterN}章节第${plotNodeIndex}个情节节点(待重命名)`;
                    // 描述格式: (描述暗示情节,务必确保与设计的情节对应)
                    nodeDesc = "(描述暗示情节,务必确保与设计的情节对应)";
                } else {
                    // 普通节点命名: x层的xx类型节点(待重命名)
                    nodeName = `${layer}层的${finalType}类型节点(待重命名)`;
                    // 普通节点描述: (待填充)
                    nodeDesc = "(待填充)";
                }

                // --- 3. 实例化节点 ---
                const node = new MapNode({
                    id: `${config.mapId}_l${layer}_n${globalNodeIndex++}`,
                    type: finalType,
                    name: nodeName, // 🟢 应用新名称
                    layerIndex: layer,
                    state: (layer === 0 && finalType === NodeType.ROOT) ? NodeState.CURRENT : NodeState.LOCKED
                });

                // 🟢 注入初始描述 (MapNode 构造函数默认 payload.description 为空字符串)
                node.payload.description = nodeDesc;

                if (portalTarget) node.portalTarget = portalTarget;

                // --- 4. 坐标计算 (保持原有逻辑) ---
                const screenWidth = 1280;
                const marginX = 100; 
                const availableWidth = screenWidth - (marginX * 2);
                const stepX = availableWidth / (mandatoryTypes.length + 1);
                
                node.y = 150 + (layer * 220); 
                node.x = marginX + (stepX * (index + 1));

                mapData.nodes.push(node);
            });
        }

        this.connectLayers(mapData);

        const rootNode = mapData.nodes.find(n => n.type === NodeType.ROOT && n.layerIndex === 0);
        if (rootNode) {
            mapData.currentNodeId = rootNode.id;
        }

        return mapData;
    }

    // ==========================================
    // 辅助方法
    // ==========================================

    /**
     * 根据主题的 distribution 权重随机获取一种类型
     */
    static getWeightedRandomType(theme) {
        const dist = theme.distribution;
        const totalWeight = Object.values(dist).reduce((sum, w) => sum + w, 0);
        
        if (totalWeight <= 0) return NodeType.RESOURCE; // 防止配置错误

        let random = Math.random() * totalWeight;
        
        for (const type in dist) {
            random -= dist[type];
            if (random <= 0) {
                // 如果主题不允许战斗，但随机到了战斗 (防止配置冲突)
                if (type === NodeType.COMBAT && !theme.allowCombat) {
                    return NodeType.EVENT_CHOICE; // 降级为事件
                }
                return type;
            }
        }
        return NodeType.RESOURCE;
    }

    static connectLayers(mapData) {
        const layers = [];
        for (let i = 0; i <= mapData.maxDepth; i++) {
            layers[i] = mapData.nodes.filter(n => n.layerIndex === i);
        }

        for (let i = 0; i < mapData.maxDepth; i++) {
            const currentLayer = layers[i];
            const nextLayer = layers[i+1];

            if (!nextLayer || nextLayer.length === 0) continue;

            // 只有深层入口需要连线
            const portals = currentLayer.filter(n => n.type === NodeType.PORTAL_NEXT_FLOOR);

            portals.forEach(portal => {
                const validTargets = nextLayer.filter(n => 
                    n.type !== NodeType.PORTAL_NEXT_FLOOR && 
                    n.type !== NodeType.PORTAL_NEXT_CHAPTER
                );
                const candidates = validTargets.length > 0 ? validTargets : nextLayer;

                const targetIndex = this.getRandomInt(0, candidates.length - 1);
                const targetNode = candidates[targetIndex];

                if (targetNode) {
                    portal.nextNodes.push(targetNode.id);
                }
            });
        }
    }

    static getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    static shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}