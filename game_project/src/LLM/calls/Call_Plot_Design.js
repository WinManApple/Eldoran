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

// src/LLM/calls/Call_Plot_Design.js
import { Plot_Memory } from '../memory/Plot_Memory.js';
import { Chat_Memory } from '../memory/Chat_Memory.js';
import { TAG as Tag_Plot } from '../actions/Action_Plot_Design.js';

/**
 * 剧情设计请求构建器
 * 职责：收集当前章节的元数据，请求 LLM 生成分层级 (Stage-based) 的剧情
 */
export const Call_Plot_Design = {

    /**
     * 构建请求数据
     * @param {Object} targetMap - 指定的目标地图对象 (可选)
     */
    constructRequest(targetMap = null) {
        const mapManager = window.mapManager;
        // 优先使用传入的 map，否则使用 currentMap
        const map = targetMap || (mapManager ? mapManager.currentMap : null);

        // 如果还是拿不到地图，才返回 null
        if (!map) {
            console.warn("[Call_Plot_Design] 缺少目标地图对象，请求取消");
            return null;
        }

        // =================================================
        // 计算前情提要 (Previously_Plot)
        // =================================================

        
        const previouslyPlot = this._generateContext(map, mapManager);

        // [修改] 1. 获取最近5条对话历史 (对应 ST 端 {{Chat_Memory}})
        let chatHistory = "暂无对话记录";
        
        // 获取主线频道原始数据
        const channelData = Chat_Memory.getChannelData('main');
        
        if (channelData && channelData.history && channelData.history.recent_chat) {
            // 截取最后 5 条记录
            const recentSlice = channelData.history.recent_chat.slice(-5);
            
            if (recentSlice.length > 0) {
                // 手动格式化 (保持与 Chat_Memory 相同的文本风格)
                chatHistory = recentSlice.map(entry => {
                    let text = "";
                    
                    // A. 玩家发言
                    if (entry.user && entry.userText) {
                        text += `\n${entry.user}: ${entry.userText}`;
                    }
                    
                    // B. AI/系统回复
                    if (entry.reply && entry.reply.content) {
                        const content = entry.reply.content;
                        // 兼容数组结构 (线性剧本) 与 对象结构 (旧版)
                        if (Array.isArray(content)) {
                            content.forEach(item => {
                                const role = item.role || item.name;
                                const val = item.text || item.value;
                                text += (role === 'system') ? `\n(System: ${val})` : `\n${role}: ${val}`;
                            });
                        } else if (typeof content === 'object') {
                             for (const [k, v] of Object.entries(content)) {
                                 text += (k === 'system') ? `\n(System: ${v})` : `\n${k}: ${v}`;
                             }
                        }
                    }
                    return text;
                }).join("\n");
            }
        }

        // [新增] 2. 获取支线触发源信息 (对应 ST 端 {{Side_Line_Information}})
        let sideLineInfo = ""; 
        
        // 只有当生成的目标地图是 SUB (支线) 时，才去抓取当前所在节点的 Payload
        if (map.type === 'SUB' && mapManager && mapManager.currentMap) {
            const activeMap = mapManager.currentMap;
            const currentNode = activeMap.nodes.find(n => n.id === activeMap.currentNodeId);
            
            if (currentNode && currentNode.payload) {
                // [修改] 仅提取 choice_scenes 字段，过滤掉 enemies/description 等其他冗余信息
                // 这样能大幅减少 Token 消耗，并让 LLM 聚焦于抉择文本
                const choiceData = currentNode.payload.choice_scenes;

                if (choiceData) {
                    try {
                        // 包装成对象进行序列化，保持语义清晰
                        sideLineInfo = JSON.stringify({ choice_scenes: choiceData }, null, 2);
                    } catch (e) {
                        console.warn("[Call_Plot_Design] 序列化 choice_scenes 失败:", e);
                        sideLineInfo = "无法读取抉择数据";
                    }
                } else {
                    // 如果节点里没有 choice_scenes (可能是纯战斗节点或剧情节点)
                    sideLineInfo = "当前触发节点无抉择剧本数据 (choice_scenes missing)";
                }
            } else {
                sideLineInfo = "未找到触发源节点信息";
            }
        }

        // =================================================
        // 构建最终 Payload
        // =================================================
        return {
            command: 'PLOT_DESIGN', 
            expectedTags: [Tag_Plot],
            params: {
                // 基础识别信息
                chapterId: map.mapId,
                chapterNumber: mapManager?.chapterCount || 1,
                
                // 地图类型 (MAIN | SUB)
                // 这允许 LLM 判断是写"主线史诗"还是"支线小传"
                mapType: map.type, 

                // 氛围与主题信息
                locationName: map.name,
                theme: map.themeId,

                // 层级结构参数
                maxDepth: map.maxDepth, 
                totalStages: map.maxDepth + 1,

                // 前情提要
                previouslyPlot: previouslyPlot,

                // [新增] 传递给 ST 端的宏替换参数
                chatHistory: chatHistory,    // 将替换 {{Chat_Memory}}
                sideLineInfo: sideLineInfo   // 将替换 {{Side_Line_Information}}
            }
        };
    },

    /**
     * 内部方法：生成前情提要上下文
     * 封装了复杂的 "首章判断"、"续章拼接" 与 "支线隔离" 逻辑
     */
    _generateContext(map, mapManager) {
        let previouslyPlot = "";

        // 🟢 新逻辑：分情况构建上下文
        if (map.type === 'MAIN') {
            // 判断是否为第一章/初始地图 (依据：没有父节点 或 章节数为1)
            const isFirstChapter = !map.parentMapId || (mapManager && mapManager.chapterCount === 1);

            if (isFirstChapter) {
                // Case 1: 初次游戏初始化
                // 直接读取 Chat_Memory 中的内容 (包含 Opening.js 加载的开场白 + 玩家可能产生的少量互动)
                console.log("[Call_Plot_Design] 📖 检测到首章，正在提取开场剧情...");
                previouslyPlot = Chat_Memory.getFormattedContext('main');
            } 
            else {
                // Case 2: 下一章节主线地图
                // 组合拳：上一章的设计蓝图 (Plot_Memory) + 玩家在本章之前的最新互动 (Chat_Memory)
                console.log("[Call_Plot_Design] 🔗 检测到续章，正在拼接[上章剧情]与[近期互动]...");

                // A. 提取上一章剧情
                let prevPlotText = "";
                if (map.parentMapId) {
                    const parentData = Plot_Memory.getChapterData(map.parentMapId);
                    if (parentData && parentData.stages) {
                        prevPlotText = Object.values(parentData.stages).join("\n");
                    }
                }
                
                // B. 提取近期聊天上下文 (玩家在上一章结尾或过渡期的操作)
                const recentChat = Chat_Memory.getFormattedContext('main');

                // C. 拼接
                previouslyPlot = `[上一章节剧情回顾]\n${prevPlotText || "无记录"}\n\n[当前互动与状态]\n${recentChat}`;
            }
        } 
        else {
            // Case 3: 支线地图 (SUB)
            // 暂时逻辑：切断主线关联，仅保留占位符
            console.log("[Call_Plot_Design] 🌿 检测到支线，暂不关联主线剧情");
            // TODO: 未来在此处接入 QuestNode 的任务描述数据
            previouslyPlot = "当前为独立支线区域，暂无直接的前置剧情关联。";
        }

        // 兜底处理：防止为空
        if (!previouslyPlot || previouslyPlot.trim() === "") {
            previouslyPlot = "无前情提要";
        }

        return previouslyPlot;
    }

};