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

// src/LLM/Game_Manager.js

import { Protocol } from '../config/Protocol.js';
import { addLog, store } from '../ui/modules/store.js';
import { Action_Map_Named, TAG as Tag_Map } from './actions/Action_Map_Named.js';
import { Action_Plot_Design, TAG as Tag_Plot } from './actions/Action_Plot_Design.js';
import { Action_Node_Generate, TAG as Tag_Node } from './actions/Action_Node_Generate.js';
import { Action_Chat, TAG as Tag_Chat } from './actions/Action_Chat.js';
import { Action_H_Interaction, TAG as Tag_H } from './actions/Action_H_Interaction.js';
import { Action_Summary, TAG as Tag_Summary } from './actions/Action_Summary.js';
import { Action_Custom_Opening, TAG as Tag_Custom_Opening } from './actions/Action_Custom_Opening.js';

/**
 * 游戏端 LLM 核心调度器
 */
export const Game_Manager = {

    // 全局生成状态锁
    isGenerating: false,

    // 循环日志定时器 ID
    _logInterval: null,

    /**
     * 注册标签处理器
     * Key: XML标签名 (不带尖括号)
     * Value: Action 执行模块
     */
    actionRegistry: {
        [Tag_Map]: Action_Map_Named,      // 动态键名: 'Map_Content'
        [Tag_Plot]: Action_Plot_Design,   // 动态键名: 'Story'
        [Tag_Node]: Action_Node_Generate,  // 动态键名: 'Node_Content'
        [Tag_Chat]: Action_Chat,
        [Tag_H]: Action_H_Interaction,
        [Tag_Summary]: Action_Summary,
        [Tag_Custom_Opening]: Action_Custom_Opening
    },

    /**
     * 发起 LLM 请求 (支持批量)
     * @param {Array<Object>} calls - 由 Call_*.constructRequest() 生成的请求对象数组
     * @param {string} mode - 'parallel' | 'sequence' (预留参数)
     */
    async sendRequest(calls) {

        // 1. 过滤无效请求
        const rawCalls = Array.isArray(calls) ? calls : [calls];

        const validPayloads = rawCalls.filter(c => c && c.command);
        
        if (validPayloads.length === 0) {
            console.warn("[Game_Manager] 没有有效的请求 Payload (请检查 Call_Chat 是否使用了 command/params 结构)");
            return false;
        }

        this.isGenerating = true;
        
        // [新增] 1. 接管全局 AI 状态
        store.aiStatus.isThinking = true; 
        store.aiResult = 'none';

        console.log(`[Game_Manager] 📤 发送 ${validPayloads.length} 个请求任务...`);
        
        // [新增] 2. 启动循环日志 (每2秒触发一次)
        addLog("☁️ 命运的齿轮开始转动... (生成中)"); // 立即显示第一条
        if (this._logInterval) clearInterval(this._logInterval); // 防止重复
        this._logInterval = setInterval(() => {
            addLog("☁️ 命运的齿轮开始转动... (生成中)");
        }, 5000);

        try {
            // 2. 组装 Protocol.LLM.GENERATE 的 Payload
            
            // A. 提取任务列表 [[command, params], ...]
            const tasks = validPayloads.map(req => [req.command, req.params]);

            // B. 提取期望标签 (白名单) - 🟢 新增逻辑
            // 假设 req 对象中包含 expectedTags (String 或 Array)
            const tagSet = new Set();
            validPayloads.forEach(req => {
                if (req.expectedTags) {
                    if (Array.isArray(req.expectedTags)) {
                        req.expectedTags.forEach(t => tagSet.add(t));
                    } else {
                        tagSet.add(req.expectedTags);
                    }
                }
            });
            const expectedTags = Array.from(tagSet);

            // C. 构建复合对象
            // 新协议格式: { tasks: [...], expectedTags: [...] }
            const rawRpcPayload = {
                tasks: tasks,
                expectedTags: expectedTags
            };

            // 🟢 核心修复：数据清洗 (Deep Clean)
            // 使用 JSON 序列化/反序列化来剥离 Vue Proxy 包装壳和非数据属性
            const cleanRpcPayload = JSON.parse(JSON.stringify(rawRpcPayload));

            // 设置 10 分钟超时
            const response = await window.rpc.call(Protocol.LLM.GENERATE, cleanRpcPayload, 600000);

            // 3. 处理响应
            if (response) {
                await this.handleResponse(response);
                return true;
            } else {
                throw new Error("收到空响应");
            }

        } catch (err) {
            console.error("[Game_Manager] 请求失败:", err);
            
            // [新增] 1. 停止循环日志
            if (this._logInterval) {
                clearInterval(this._logInterval);
                this._logInterval = null;
            }

            // [修改] 2. 错误日志
            addLog(`❌ 世界回响中断: ${err.message}`);
            
            // [修改] 3. 彻底重置状态
            this.isGenerating = false;
            store.aiStatus.isThinking = false;
            store.aiResult = 'error';
            
            // 3秒后自动清除错误标记 (可选，保持 UI 干净)
            setTimeout(() => { if(store.aiResult === 'error') store.aiResult = 'none'; }, 3000);

            return false;
        }
    },

    /**
     * [重写] 终止当前请求
     */
    async cancelRequest() {
        // 1. 清理前端循环日志
        if (this._logInterval) {
            clearInterval(this._logInterval);
            this._logInterval = null;
        }

        // 2. 发送终止信号并等待确认
        if (this.isGenerating) {
            addLog("📡 正在向虚空发送终止信号...");
            try {
                // [关键修改] 使用 await 等待服务端返回 true/false
                // 设置 5秒超时，防止服务端卡死导致前端也卡死
                const success = await window.rpc.call(Protocol.LLM.CANCEL, {}, 5000);

                if (success) {
                    // [需求] 成功通过服务端停止后，使用 addLog 说明
                    addLog("🛑 共鸣已强制切断 (服务端确认成功)");
                } else {
                    addLog("⚠️ 中断信号已发送，但服务端未找到活动任务 (可能已结束)");
                }

            } catch (e) {
                console.warn("发送终止信号超时或失败:", e);
                addLog("❌ 无法连接到虚空终端，执行强制本地重置");
            }
        }

        // 3. 无论服务端结果如何，前端必须彻底重置状态
        this.isGenerating = false;
        if (store && store.aiStatus) {
            store.aiStatus.isThinking = false;
            store.aiResult = 'error'; // 标记为错误/中断状态
        }
        
        console.log("[Game_Manager] 用户强制中断流程结束");
    },
        
    /**
     * 解析并分发响应数据
     * @param {Object|String} responseData - ST 端返回的数据
     */
    async handleResponse(responseData) {
        console.log("[Game_Manager] 📥 收到回信:", responseData);

        // 兼容性处理：ST_Manager 可能返回 { command: "raw_xml_text" } 或者是直接的文本
        // 我们现在的 ST_Manager (桩) 逻辑可能会返回一个聚合对象。
        // 为了支持"标签捕获"，我们需要处理其中的文本字段。
        
        let textToParse = "";

        // 遍历所有返回的 Key，拼接文本用于统一解析
        // (因为我们的 ST_Manager 可能会按 command 分类返回结果)
        if (typeof responseData === 'object') {
            Object.values(responseData).forEach(val => {
                if (typeof val === 'string') textToParse += val + "\n";
                else if (val.text) textToParse += val.text + "\n";
            });
        } else if (typeof responseData === 'string') {
            textToParse = responseData;
        }

        if (!textToParse) {
            console.warn("[Game_Manager] 无法提取待解析文本");
            // 这里虽然是空文本，也算结束，应该清理定时器
            if (this._logInterval) { clearInterval(this._logInterval); this._logInterval = null; }
            this.isGenerating = false;
            store.aiStatus.isThinking = false; // 确保关闭 loading
            return;
        }

        // [新增] 1. 停止循环日志
        if (this._logInterval) {
            clearInterval(this._logInterval);
            this._logInterval = null;
        }

        this.isGenerating = false;

        // [修改] 2. 更新 Store 状态 (成功)
        store.aiStatus.isThinking = false;
        store.aiResult = 'success';
        
        // 3秒后清除成功状态
        setTimeout(() => {
            if (store.aiResult === 'success') store.aiResult = 'none';
        }, 3000);

        // [修改] 3. 成功日志
        addLog("✅ LLM已产生回复，正在解析神谕...");

        console.log("[Game_Manager] ✅ 生成任务结束，解除锁定");

        // 4. 正则捕获 XML 标签
        // 匹配模式: <TagName>Content</TagName>
        const tagRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
        let match;
        let actionCount = 0;

        while ((match = tagRegex.exec(textToParse)) !== null) {
            const tagName = match[1];
            const content = match[2].trim();

            const action = this.actionRegistry[tagName];
            
            if (action) {
                console.log(`[Game_Manager] 🎬 捕获标签 <${tagName}>，执行 Action...`);
                try {
                    // 执行 Action
                    await action.execute(content);
                    actionCount++;
                } catch (e) {
                    console.error(`[Game_Manager] Action <${tagName}> 执行出错:`, e);
                }
            } else {
                console.warn(`[Game_Manager] 未知标签 <${tagName}>，已忽略`);
            }
        }


        if (actionCount > 0) {
            addLog(`✨ 世界线变动: 处理了 ${actionCount} 个神谕`);
            
            // 强制刷新 UI (如果 Action 里没做的话，这里做个兜底)
            if (window.uiStore) window.uiStore.tempMapData = Date.now();
        } else {
            console.warn("[Game_Manager] 未捕获到任何有效标签");
        }
    }
};