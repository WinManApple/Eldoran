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

// src/LLM/calls/Call_Node_Generate.js
import { Plot_Memory } from '../memory/Plot_Memory.js'; // 🟢 引入剧情记忆
import { Player_Memory } from '../memory/Player_Memory.js';
import { Chat_Memory } from '../memory/Chat_Memory.js'; // 🟢 引入对话记忆
import { TAG as Tag_Node } from '../actions/Action_Node_Generate.js';
import { store } from '../../ui/modules/store.js';
import { GameDatabase } from '../../config/GameDatabase.js';

/**
 * 节点内容生成请求构建器
 * 职责：提取指定层级范围内的节点，请求 LLM 生成详细的 Payload
 */
export const Call_Node_Generate = {

    /**
     * 构建请求数据
     * @param {Object} mapData - 地图数据对象
     * @param {number} startLayer - 起始层级 (包含)
     * @param {number} layerCount - 生成多少层
     * @returns {Object} 请求 Payload
     */
    constructRequest(mapData, startLayer, layerCount) {
        if (!mapData || !mapData.nodes) {
            console.warn("[Call_Node_Generate] 无效的 mapData");
            return null;
        }

        // 🟢 [修改] 计算结束层级 (不包含)，并根据 mapData.maxDepth 进行安全钳制
        // 假设 maxDepth 为 5 (层级 0-5)，则合法的 endLayer 最大为 6 (不包含)
        let endLayer = startLayer + layerCount;
        
        if (typeof mapData.maxDepth === 'number') {
            // maxDepth 是最大层索引 (如 5)，endLayer 是边界 (如 6)
            // 所以 endLayer 不应超过 maxDepth + 1
            if (endLayer > mapData.maxDepth + 1) {
                endLayer = mapData.maxDepth + 1;
            }
        }

        // 1. 筛选目标节点
        const targetNodes = mapData.nodes.filter(n => 
            n.layerIndex >= startLayer && n.layerIndex < endLayer
        );

        if (targetNodes.length === 0) {
            return null;
        }

        // 2. 提取 LLM 需要的上下文信息 (保持不变)
        const simplifiedNodes = targetNodes.map(n => ({
            id: n.id,
            type: n.type,
            name: n.name || "未命名节点",
            description: (n.payload && n.payload.description) ? n.payload.description : "",
            payload: {},
            layerIndex: n.layerIndex // 🟢 把层级带上，方便 LLM 对照 Task
        }));

        // 🟢 3. 构建剧情上下文字符串 (迁移至前端处理)
        const existingPlotData = Plot_Memory.getChapterData(mapData.mapId);
        const plotContextStr = this._buildPlotContext(existingPlotData, startLayer, endLayer);

        // 🟢 4. 构建聊天上下文字符串 (新增)
        const chatContextStr = this._buildChatContext(mapData);

        // 5. 获取玩家状态数据并构建字符串 
        const playerStateData = Player_Memory.getPartyData();
        const playerStateStr = this._buildPlayerContext(playerStateData);

        // 6. 组装 Payload
        return {
            command: 'NODE_GENERATE',
            expectedTags: [Tag_Node],
            params: {
                mapId: mapData.mapId,
                mapName: mapData.name,
                themeId: mapData.themeId,
                nodes: simplifiedNodes,
                
                // 🟢 传递处理好的字符串，供后端直接替换
                plotContextStr: plotContextStr,
                chatContextStr: chatContextStr,
                
                playerStateStr: playerStateStr
            }
        };
    },

    /**
     * 🟢 [新增] 内部方法：构建剧情上下文 ({{Plot}})
     * 将后端 Node_Generate.js 的逻辑迁移至此
     */
    _buildPlotContext(plotData, startLayer, endLayer) {
        // 判断逻辑：如果 plotData 存在且有 stages，说明是后续生成 (Scenario B)
        if (plotData && plotData.stages && Object.keys(plotData.stages).length > 0) {
            
            const stagesJson = JSON.stringify(plotData.stages, null, 2);
            // 转换为闭区间描述 (如 Layer 0 至 Layer 1)
            const rangeText = `Layer ${startLayer} 至 Layer ${endLayer - 1}`;
            
            return `[已设计的情节大纲]\n${stagesJson}\n\n` +
                   `[当下正在设计的层级]\n${rangeText}\n` +
                   `Layer0 对应 task0，其他类推\n` +
                   `请注意：PORTAL_NEXT_FLOOR与PORTAL_NEXT_CHAPTER生成的payload必须与当前层级的任务目标（Task）和剧情发展保持一致。`;
        } else {
            // 初始化阶段：此时 Plot_Memory 里还没有数据 (Scenario A)
            return `【提示】\n情节正在初始化中，请参考上文刚完成的 <Task_Plot_Design> 结果，并基于该情节生成以下节点内容。`;
        }
    },

    /**
     * 🟢 [新增] 内部方法：构建对话上下文 ({{Chat_Data}})
     * 根据地图类型获取对应频道的对话记录
     */
    _buildChatContext(mapData) {
        // 1. 确定频道 ID
        // 规则：主线地图(MAIN) -> 'main' | 支线/副本 -> mapId
        const channelId = (mapData.type === 'MAIN') ? 'main' : mapData.mapId;

        // 2. 获取格式化文本
        const context = Chat_Memory.getFormattedContext(channelId);

        if (!context || context.trim() === "") {
            return "（暂无相关对话记录）";
        }
        return context;
    },

    /**
     * 🟢 [最终修正版] 内部方法：构建玩家状态宏 ({{Player_State_WithoutHstate}})
     * 核心修正：直接读取 store.party，绕过 Player_Memory 的数据清洗，确保获取技能/装备的原始对象
     */
    _buildPlayerContext(ignoredPlayers) { // 👈 忽略传入的旧数据
        // 1. 直接从全局 Store 获取最原始的 Proxy 数据
        if (!store || !store.party || store.party.length === 0) {
            return "暂无玩家数据";
        }
        const rawParty = store.party; // 这是源头数据

        // 2. 获取玩家金币
        const gold = (store.playerStats && store.playerStats.gold) !== undefined ? store.playerStats.gold : 0;
        const goldStr = `玩家队伍金币: ${gold}`;

        // 3. 处理每个角色的常规数据
        const memberLines = rawParty.map(p => {
            const level = p.level || 1;
            const nextExp = Math.pow(level, 2) + 400;

            const pDef = (p.stats && p.stats.def) || 0; 
            const mDef = (p.stats && p.stats.res_magic) ? (p.stats.res_magic * 10) : pDef; 
            const avgDef = Math.floor((pDef + mDef) / 2);

            // === A. 装备解析 (带品质) ===
            const eq = p.equipment || {};
            const n = (slot) => {
                const val = eq[slot];
                if (!val) return null;
                let itemData = null;
                // 兼容 ID 或 对象
                if (typeof val === 'string') {
                    itemData = GameDatabase.Equipment[val];
                } else if (typeof val === 'object') {
                    itemData = val;
                }
                
                if (!itemData || !itemData.name) return null;
                const qualityStr = itemData.quality ? `(${itemData.quality})` : "";
                return `${itemData.name}${qualityStr}`;
            };

            const wpn = n('weapon');
            const armors = [n('head'), n('chest'), n('hands'), n('legs'), n('boots')].filter(Boolean);
            const accs = [n('accessory_1'), n('accessory_2')].filter(Boolean);
            
            const parts = [];
            if (wpn) parts.push(`武器: ${wpn}`);
            if (armors.length > 0) parts.push(`防具: ${armors.join(', ')}`);
            if (accs.length > 0) parts.push(`饰品: ${accs.join(', ')}`);
            const itemsStr = parts.length > 0 ? parts.join(" | ") : "无装备";

            // === B. 🟢 技能解析 (从源头 Proxy 读取) ===
            // 调试截图显示结构为 p.skills.learned
            const rawSkills = (p.skills && p.skills.learned) ? p.skills.learned : [];
            
            const skillTexts = rawSkills.map(s => {
                // 情况 1: 静态 ID (String) -> 查库
                if (typeof s === 'string') {
                    const staticData = GameDatabase.Skills[s];
                    if (staticData) {
                        // 优先使用 desc (数据库字段)
                        return `${staticData.name}[${staticData.desc || "无描述"}]`;
                    }
                    // 查不到库，说明可能是个纯名字，或者 ID 错
                    return s; 
                }
                // 情况 2: 动态对象 (Object/Proxy) -> 读属性
                else if (typeof s === 'object' && s !== null) {
                    const name = s.name || "未知技能";
                    // 调试截图显示动态技能用的是 description
                    const desc = s.description || s.desc || "无描述";
                    return `${name}[${desc}]`;
                }
                return null;
            }).filter(Boolean);

            const skillsStr = skillTexts.length > 0 ? skillTexts.join(", ") : "无";

            // === C. 属性描述 ===
            const pid = p.player_ID || p.id;
            let statsStr = `等级${level}, HP ${p.HP || p.hp || '?'}/${p.HP || p.maxHp || '?'}, MP ${p.MP || p.mp || '?'}/${p.MP || p.maxMp || '?'}, 攻击力${p.attack_power || (p.baseStats ? p.baseStats.atk : '?')}, 防御力${avgDef}`;
            
            if (pid === 'player_001') {
                statsStr += `, 升到下一级需要${nextExp}经验`;
            }

            const dataObj = {
                "名字": p.name || "未知",
                "性别": p.sex || "数据缺失请通过名字判定",
                "玩家id": pid || "unknown_id",
                "属性": statsStr, 
                "持有物品": itemsStr,
                "掌握技能": skillsStr
            };

            return JSON.stringify(dataObj, null, 0);
        }).join("\n");

        // 4. 提取队伍共享的特殊收藏
        let sharedSpecialStr = "无";
        if (store.party[0]) {
            const runtimeLeader = store.party[0]; 
            const inventory = runtimeLeader.inventory; 

            if (Array.isArray(inventory)) {
                const specialItemsRows = [];
                inventory.forEach(item => {
                    if (item.type === 'SPECIAL' && item.isExposedToLLM === true) {
                        const cleanDesc = (item.description || item.desc || "无描述").replace(/[\r\n]+/g, ' ');
                        const safeName = item.name || "未知物品";
                        specialItemsRows.push(`|${safeName}|${cleanDesc}|`);
                    }
                });
                if (specialItemsRows.length > 0) {
                    const header = "|物品名称|物品描述|";
                    sharedSpecialStr = header + "\n" + specialItemsRows.join("\n");
                }
            }
        }

        const sharedLine = JSON.stringify({
            "队伍持有特殊收藏": sharedSpecialStr
        }, null, 0);

        return goldStr + "\n" + memberLines + "\n" + sharedLine;
    }
    
};