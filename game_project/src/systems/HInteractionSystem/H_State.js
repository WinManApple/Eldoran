/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/system/HInteractionSystem/H_State.js
import { addLog } from '../../ui/modules/store.js';

/**
 * ==========================================
 * 女性角色 H 属性状态类 (H_State)
 * ==========================================
 * 职责：
 * 1. 存储长期 H 属性（好感、堕落、开发度、处女状态、性行为次数）。
 * 2. 监听属性阈值（每 50 点）并触发里程碑日志。
 * 3. 导出供 ST 脚本使用的状态标签。
 */
export class HState {
    constructor(charId, initialData = {}) {
        this.charId = charId;
        this.name = initialData.name || charId;

        // --- 基础长期属性 (0-300) ---
        this.affection = initialData.affection || 0; // 好感度
        this.depravity = initialData.depravity || 0; // 堕落度

        // --- 核心经历属性 ---
        this.isVirgin = initialData.isVirgin !== undefined ? initialData.isVirgin : true; // 是否是处女
        this.sexCount = initialData.sexCount || 0; // 性行为次数 (记录射精次数)

        // --- 部位开发度 (长期: 0-150) ---
        this.parts = {
            clitoris: initialData.parts?.clitoris || 0, // 阴蒂
            vagina: initialData.parts?.vagina || 0,   // 阴道
            uterus: initialData.parts?.uterus || 0,   // 子宫
            anus: initialData.parts?.anus || 0,       // 菊穴
            mouth: initialData.parts?.mouth || 0,     // 嘴巴
            nipples: initialData.parts?.nipples || 0, // 乳头
            breasts: initialData.parts?.breasts || 0  // 乳房
        };
    }

    // ==========================================
    // 1. 属性更新逻辑 (带阈值检查)
    // ==========================================

    /**
     * 更新好感度
     */
    updateAffection(value) {
        const oldVal = this.affection;
        // 🟢 移除 Math.min，只保留 >= 0 的限制
        this.affection = Math.max(0, this.affection + value);
        // this._checkMilestone('好感度', oldVal, this.affection);
    }

    /**
     * 更新堕落度
     */
    updateDepravity(value) {
        const oldVal = this.depravity;
        // 🟢 移除 Math.min，只保留 >= 0 的限制
        this.depravity = Math.max(0, this.depravity + value);
        // this._checkMilestone('堕落度', oldVal, this.depravity);
    }

    /**
     * 更新部位开发度
     */
    updatePart(partId, value) {
        if (this.parts[partId] !== undefined) {
            // 🟢 移除 Math.min，只保留 >= 0 的限制
            this.parts[partId] = Math.max(0, this.parts[partId] + value);
        }
    }
    
    // 独立更新性行为次数
    updateSexCount(val) {
        if (val > 0) {
            this.sexCount += val;
        }
    }

    // 独立设置处女状态
    setVirginity(isVirginStatus) {
        // 只有当状态从 true 变为 false 时触发日志
        if (this.isVirgin && !isVirginStatus) {
            this.isVirgin = false;
            addLog(`❣ [${this.name}] 失去了她的初次...`);
        } else {
            // 允许强制修正状态 (例如 LLM 认为判错了)
            this.isVirgin = isVirginStatus;
        }
    }

    // ==========================================
    // 2. 内部逻辑
    // ==========================================

    // // 画饼，后续可能会在这里加入什么强力技能？
    // /**
    //  * 检查是否跨越了 50 点里程碑
    //  */
    // _checkMilestone(type, oldVal, newVal) {
    //     const oldStep = Math.floor(oldVal / 50);
    //     const newStep = Math.floor(newVal / 50);
        
    //     if (newStep > oldStep) {
    //         // [占位] 触发里程碑逻辑
    //         addLog(`🌟 突破：[${this.charId}] 的 ${type} 达到了 ${newStep * 50}，解锁了潜在的能力...`);
    //     }
    // }

}