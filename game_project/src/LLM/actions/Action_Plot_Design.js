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

// src/LLM/actions/Action_Plot_Design.js
import { Plot_Memory } from '../memory/Plot_Memory.js';
import { addLog, store } from '../../ui/modules/store.js';

export const TAG = 'Task_Plot_Design';

export const Action_Plot_Design = {
    /**
     * 执行情节与任务设计注入
     * @param {string} content - <Task_Plot_Design> 标签内的 JSON
     */
    async execute(content) {
        if (!content) return;

        let stagesData = {};
        try {
            const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
            stagesData = JSON.parse(cleanJson);
        } catch (e) {
            console.error("[Action_Plot_Design] JSON 解析失败，回退处理");
            stagesData = { stage0: content };
        }

        const mapManager = window.mapManager;
        
        // 1. 确定目标地图 ID
        let targetMapId = stagesData.mapId;
        if (!targetMapId && mapManager && mapManager.currentMap) {
            targetMapId = mapManager.currentMap.mapId;
        }

        if (!targetMapId) {
            console.warn("[Action_Plot_Design] 无法确定目标地图ID，剧情丢弃");
            return;
        }

        // 2. 写入内存 (此处 stagesData 包含 stageX 和 taskX)
        Plot_Memory.updateChapterStages(targetMapId, stagesData);

        // 3. 🟢 [核心修改] 刷新当前地图的任务 HUD
        if (mapManager.currentMap && mapManager.currentMap.mapId === targetMapId) {
            const currentLayer = mapManager.getCurrentNodeLayer() || 0;
            
            // 分别提取情节与任务目标
            const currentStory = stagesData[`stage${currentLayer}`];
            const currentTask = stagesData[`task${currentLayer}`];

            if (store.activeQuest) {
                // 🟢 优先级：1. 显式的 task 字段 -> 2. 情节的首句 -> 3. 默认文案
                let displayGoal = "探索未知区域";
                
                if (currentTask) {
                    displayGoal = currentTask;
                } else if (currentStory) {
                    displayGoal = currentStory.split(/[，。！？]/)[0];
                }

                store.activeQuest.target = displayGoal;
                store.activeQuest.title = mapManager.currentMap.name;
                
                console.log(`[Action_Plot_Design] HUD 更新目标: ${displayGoal}`);
            }
        }

        addLog(`📖 章节情节与任务已规划完成 [${targetMapId}]`);
    }
};