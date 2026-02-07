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

// src/LLM/actions/Action_Map_Named.js
import { addLog } from '../../ui/modules/store.js';

export const TAG = 'Task_Map_Named';

/**
 * 地图命名执行器 (增强版 v2.0)
 * 监听标签: <Map_Content>
 * 职责: 接收 LLM 生成的节点名称与描述，并注入到指定的地图对象中
 * 特性: 
 * 1. 强力数据清洗 (修复 :=, =, 尾部逗号)
 * 2. 降级解析策略 (整体失败时尝试正则提取)
 * 3. 独立节点容错 (坏死节点自动跳过)
 */
export const Action_Map_Named = {

    /**
     * 执行节点信息回填
     * @param {string} content - <Map_Content> 标签内的 JSON 字符串
     */
    async execute(content) {
        let flavorData = [];
        let targetMapId = null;
        let targetMapName = null;
        let parseMethod = 'STANDARD'; // 'STANDARD' | 'FALLBACK'

        // =================================================
        // 1. 数据清洗 (Data Sanitization)
        // =================================================
        // 移除 Markdown 标记
        let cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();

        // 🟢 语法纠错规则库
        const fixRules = [
            { reg: /:\s*=/g, replace: ':', desc: '修复赋值符号 :=' },
            { reg: /"\s*=\s*"/g, replace: '":"', desc: '修复键值分隔符 =' },
            { reg: /,\s*([}\]])/g, replace: '$1', desc: '移除尾部逗号' }, // JSON 不允许尾部逗号
            // 修复可能缺失的引号 (针对 key) - 这是一个比较激进的修复，视情况开启
            // { reg: /([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, replace: '$1"$2"$3', desc: '修复缺失的键引号' }
        ];

        fixRules.forEach(rule => {
            if (rule.reg.test(cleanJson)) {
                cleanJson = cleanJson.replace(rule.reg, rule.replace);
                // console.log(`[Action_Map_Named] 触发自动修复: ${rule.desc}`);
            }
        });

        // =================================================
        // 2. 尝试解析 (Robust Parsing)
        // =================================================
        let parsed = null;
        try {
            // 尝试 A: 标准解析
            parsed = JSON.parse(cleanJson);
        } catch (e) {
            console.warn(`[Action_Map_Named] 标准 JSON 解析失败: ${e.message} -> 尝试降级提取模式...`);
            
            // 尝试 B: 正则提取模式 (救命稻草)
            // 如果整体格式烂了，尝试用正则匹配出所有看似合法的节点对象 { "id": ... }
            parsed = this._fallbackExtraction(cleanJson);
            
            if (parsed) {
                parseMethod = 'FALLBACK';
                console.log(`[Action_Map_Named] ✅ 降级提取成功，挽回了 ${parsed.nodes ? parsed.nodes.length : 0} 个节点数据`);
            } else {
                console.error("[Action_Map_Named] ❌ 所有解析手段均失效，放弃执行。");
                return;
            }
        }

        // =================================================
        // 3. 协议标准化 (Normalization)
        // =================================================
        if (parsed.mapId && parsed.nodes) {
            targetMapId = parsed.mapId;
            flavorData = parsed.nodes;
            if (parsed.mapName) targetMapName = parsed.mapName;
        } else if (Array.isArray(parsed)) {
            flavorData = parsed; // 旧协议
        } else if (parsed.nodes) {
            flavorData = parsed.nodes; // 旧协议变种
        } else {
            console.warn("[Action_Map_Named] 数据结构无法识别，跳过。");
            return;
        }

        if (!Array.isArray(flavorData) || flavorData.length === 0) {
            console.warn("[Action_Map_Named] 提取到的节点列表为空。");
            return;
        }

        // =================================================
        // 4. 定位地图
        // =================================================
        const mapManager = window.mapManager;
        if (!mapManager) return;

        const targetMap = targetMapId ? mapManager.maps[targetMapId] : mapManager.currentMap;
        if (!targetMap) {
            console.warn(`[Action_Map_Named] ❌ 目标地图不存在: ${targetMapId || 'current'}`);
            return;
        }

        // 更新地图名
        if (targetMapName && targetMapName !== targetMap.name) {
            console.log(`[Action_Map_Named] 地图重命名: "${targetMap.name}" -> "${targetMapName}"`);
            
            // 1. 修改地图对象本身的名称
            targetMap.name = targetMapName;
            
            // 2. 如果当前正处于该地图，立即刷新 UI 顶部的世界状态
            if (mapManager.currentMap && mapManager.currentMap.mapId === targetMap.mapId) {
                if (window.uiStore && window.uiStore.worldState) {
                    window.uiStore.worldState.mapName = targetMapName;
                }
            }

            // 🟢 [新增] 同步更新 ChatData 中的频道名称
            // 解决"幽灵频道"问题：直接将旧频道重命名，而不是新建
            if (window.uiStore && window.uiStore.chatData) {
                const channelId = (targetMap.type === 'MAIN') ? 'main' : targetMap.mapId;
                const channel = window.uiStore.chatData.channels[channelId];

                if (channel) {
                    console.log(`[Action_Map_Named] 同步频道显示名: "${channel.name}" -> "${targetMapName}"`);
                    channel.name = targetMapName;
                }
            }

            // 🟢 [新增] 同步更新父地图中的入口节点名称
            // 解决"节点名不一致"问题：让父地图的传送门也显示新名字
            if (targetMap.parentMapId) {
                const parentMap = mapManager.maps[targetMap.parentMapId];
                if (parentMap) {
                    // 寻找指向当前地图的传送门节点
                    // 策略：先尝试匹配 entryNodeId，如果找不到则通过 portalTarget 反查
                    let entryNode = null;
                    if (targetMap.entryNodeId) {
                        entryNode = parentMap.nodes.find(n => n.id === targetMap.entryNodeId);
                    }
                    if (!entryNode) {
                        entryNode = parentMap.nodes.find(n => n.portalTarget === targetMap.mapId);
                    }

                    if (entryNode) {
                        console.log(`[Action_Map_Named] 同步入口节点名: "${entryNode.name}" -> "${targetMapName}"`);
                        entryNode.name = targetMapName;
                        // 注意：此处无需强制刷新，因为下方的 window.uiStore.tempMapData 会触发全局重绘
                    }
                }
            }
        }

        // =================================================
        // 5. 流式注入 (Stream Injection)
        // =================================================
        let successCount = 0;
        let failCount = 0;

        flavorData.forEach((flavor, index) => {
            // 🟢 独立 try-catch：确保单个坏节点不影响大局
            try {
                if (!flavor.id) {
                    // 如果正则提取模式下，可能会有一些残缺对象，这里直接跳过
                    return; 
                }

                const originalNode = targetMap.nodes.find(n => n.id === flavor.id);
                if (!originalNode) {
                    // console.warn(`[Action_Map_Named] ⚠️ 节点 ID 不匹配: ${flavor.id} (跳过)`);
                    return;
                }

                let changed = false;

                // 注入名称
                if (this._isValidString(flavor.name)) {
                    originalNode.name = flavor.name;
                    changed = true;
                }

                // 注入描述
                if (this._isValidString(flavor.description)) {
                    originalNode.payload = originalNode.payload || {};
                    originalNode.payload.description = flavor.description;
                    changed = true;
                }

                if (changed) {
                    originalNode.isGenerated = true;
                    successCount++;
                }

            } catch (err) {
                console.warn(`[Action_Map_Named] ⚠️ 节点 [${index}] 注入异常:`, err);
                failCount++;
            }
        });

        // =================================================
        // 6. 反馈
        // =================================================
        if (successCount > 0) {
            console.log(`[Action_Map_Named] 注入完成: 成功 ${successCount} / 失败 ${failCount}`);
            
            // 仅当前地图刷新 UI
            if (mapManager.currentMap && mapManager.currentMap.mapId === targetMap.mapId) {
                addLog(`🗺️ 世界迷雾已消散 (${successCount}区域)`);
                if (window.uiStore) window.uiStore.tempMapData = Date.now();
            }
        }
    },

    /**
     * 辅助：正则降级提取
     * 当 JSON.parse 失败时，尝试匹配出独立的 { "id": ... } 块
     */
    _fallbackExtraction(text) {
        // 这是一个启发式正则，尝试匹配包含 "id" 字段的 JSON 对象
        // 它假设节点对象是扁平的，或者不包含复杂的嵌套花括号
        const nodeRegex = /\{\s*"id"\s*:[^{}]+\}/g;
        const matches = text.match(nodeRegex);

        if (!matches || matches.length === 0) return null;

        const nodes = [];
        matches.forEach(m => {
            try {
                const node = JSON.parse(m);
                nodes.push(node);
            } catch (e) {
                // 即使提取出来的片段也可能不合法，忽略它
            }
        });

        if (nodes.length > 0) {
            // 尝试提取 mapId (通常在由 mapId 和 nodes 组成的结构中)
            const mapIdMatch = text.match(/"mapId"\s*:\s*"([^"]+)"/);
            const mapNameMatch = text.match(/"mapName"\s*:\s*"([^"]+)"/);

            return {
                mapId: mapIdMatch ? mapIdMatch[1] : null,
                mapName: mapNameMatch ? mapNameMatch[1] : null,
                nodes: nodes
            };
        }
        return null;
    },

    /**
     * 辅助：校验字符串有效性
     */
    _isValidString(str) {
        return str && typeof str === 'string' && str !== "(待填充)" && str !== "未知区域" && str.trim() !== "";
    }
};