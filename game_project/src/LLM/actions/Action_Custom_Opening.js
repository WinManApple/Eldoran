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

// src/LLM/actions/Action_Custom_Opening.js
import { store, addLog } from '../../ui/modules/store.js';
import { JSON_Repair } from '../filters/JSON_Repair.js';

export const TAG = 'Task_Custom_Opening';

export const Action_Custom_Opening = {

    /**
     * 执行开局数据注入
     * @param {string} content - <Task_Custom_Opening> 标签内的 JSON 内容
     */
    async execute(content) {
        if (!content) {
            console.warn("[Action_Custom_Opening] 收到空内容");
            store.aiResult = 'error';
            return;
        }

        console.log("[Action_Custom_Opening] 开始解析开局数据...");
        
        // 1. 使用专用清洗器解析
        const parsedData = JSON_Repair.safeParseOpening(content);

        if (!parsedData) {
            console.error("[Action_Custom_Opening] 严重错误: 无法解析 LLM 返回的 JSON");
            store.aiResult = 'error';
            addLog("❌ 命运之书无法辨识 (JSON解析失败)");
            return;
        }

        try {
            // 2. 数据融合：合并静态物品与动态物品
            // 获取之前在 Call 阶段暂存的静态物品 (如果存在)
            const staticItems = store.tempStaticItems || [];
            
            // 获取 LLM 生成的动态物品
            const dynamicItems = parsedData.openingData?.items || [];

            // 合并并打乱顺序 (让静态物品混在动态物品中间，显得更自然)
            let finalItems = [...staticItems, ...dynamicItems];
            finalItems = this._shuffleArray(finalItems);

            // 回填到 parsedData 中
            if (!parsedData.openingData) parsedData.openingData = {};
            parsedData.openingData.items = finalItems;

            // 3. 数据完整性兜底检查 (防止 LLM 删字段)
            this._validateStructure(parsedData);

            // 4. 发布结果到 Store
            // CustomOpeningOverlay.js 将 watch 这个字段来结束 Loading 状态
            store.tempOpeningResult = parsedData;
            
            // 清理暂存区
            store.tempStaticItems = null;

            addLog("✨ 新的命运分支已构建完成");
            console.log("[Action_Custom_Opening] 开局数据构建完毕:", parsedData);

        } catch (err) {
            console.error("[Action_Custom_Opening] 数据处理异常:", err);
            store.aiResult = 'error';
            addLog(`❌ 构建失败: ${err.message}`);
        }
    },

    /**
     * 辅助：简单的数组洗牌 (Fisher-Yates)
     */
    _shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    },

    /**
     * 辅助：结构校验与修补
     */
    _validateStructure(data) {
        // 确保必要的字段存在，否则 UI 会报错
        if (!data.meta) data.meta = { title: "未知开局", tags: [] };
        if (!data.openingData) data.openingData = { playerConfig: {}, items: [], scripts: [] };
        if (!data.companionData) data.companionData = [];
        if (!data.mapTheme) {
             data.mapTheme = { 
                 name: "迷雾之地", 
                 distribution: { "COMBAT": 0.5, "RESOURCE": 0.3, "EVENT_CHOICE": 0.2 } 
             };
        }
    }
};