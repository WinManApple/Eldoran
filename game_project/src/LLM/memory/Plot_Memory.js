/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/LLM/memory/Plot_Memory.js

/**
 * 剧情记忆容器 (Plot Memory)
 * 职责：
 * 1. 存储宏观剧情数据 (Story, Progress)。
 * 2. 提供章节数据的读写接口。
 * 3. 这里的 update 方法将被 Action_Plot_Design 调用。
 */
export const Plot_Memory = {
    // 数据存储结构
    data: {
        // Key: chapterId (如 'chapter_1_main')
        // Value: { story: "...", progress: "..." }
        chapters: {}
    },

    /**
     * 🟢 新增：获取指定章节的完整数据
     * (用于 Call_Plot_Design 获取前情提要，或用于调试)
     * @param {string} chapterId 
     * @returns {Object|null} 返回章节数据对象，若不存在则返回 null
     */
    getChapterData(chapterId) {
        return this.data.chapters[chapterId] || null;
    },

    /**
     * 获取指定章节、指定层级的剧情
     * @param {string} chapterId 
     * @param {number} layerIndex - 当前层数 (0, 1, 2...)
     */
    getStageStory(chapterId, layerIndex) {
        const chapter = this.data.chapters[chapterId];
        if (!chapter || !chapter.stages) {
            return "(暂无剧情记录)";
        }
        // 获取对应阶段的剧情，如果没有则回退到上一层或默认文本
        return chapter.stages[`stage${layerIndex}`] || chapter.stages['stage0'] || "正在探索未知区域...";
    },

    /**
     * 写入剧情 (支持批量写入)
     * @param {string} chapterId 
     * @param {Object} stagesData - { stage0: "...", stage1: "..." }
     */
    updateChapterStages(chapterId, stagesData) {
        if (!this.data.chapters[chapterId]) {
            this.data.chapters[chapterId] = {
                stages: {},     // 🟢 改为对象存储
                progress: 0     // 记录探索进度
            };
        }
        
        // 合并数据 (保留旧数据，覆盖新数据)
        this.data.chapters[chapterId].stages = {
            ...this.data.chapters[chapterId].stages,
            ...stagesData
        };
        
        console.log(`[Plot_Memory] 章节 [${chapterId}] 剧情库已更新:`, Object.keys(stagesData));
    },

    /**
     * 更新玩家在该章节的探索进度描述
     * @param {string} chapterId 
     * @param {string} progressText 
     */
    updateProgress(chapterId, progressText) {
        if (!this.data.chapters[chapterId]) return;
        
        this.data.chapters[chapterId].progress = progressText;
        // console.log(`[Plot_Memory] 进度更新: ${progressText}`);
    },

    /**
     * 序列化 (用于存档)
     */
    serialize() {
        return this.data;
    },

    /**
     * 反序列化 (用于读档)
     */
    deserialize(savedData) {
        if (savedData && savedData.chapters) {
            this.data = savedData;
        } else {
            this.data = { chapters: {} };
        }
    }
};