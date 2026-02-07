/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/systems/ResourceSystem/ResourceSystem.js
import { store, addLog } from '../../ui/modules/store.js';
import { GameDatabase } from '../../config/GameDatabase.js';

/**
 * ==========================================
 * 资源获取系统 (Resource System) v2.1 (修复版)
 * ==========================================
 * 职责：
 * 1. 处理地图探索中的资源获取事件。
 * 2. 支持静态 ID 查表与 动态物品对象 (LLM生成的装备/技能书)。
 * 3. 负责 UI 反馈与节点状态更新。
 * * Update: 修复 addLog 输出 HTML 标签的问题，改为纯文本格式化。
 */
export class ResourceSystem {

    /**
     * 执行资源获取逻辑
     * @param {Object} payload - 节点携带的数据负载
     */
    static execute(payload) {
        if (!payload || !payload.actions) {
            console.warn("[ResourceSystem] 无效的 Payload:", payload);
            return;
        }

        console.log("[ResourceSystem] 处理资源事件:", payload);

        // 1. 文本反馈 (Storytelling)
        if (payload.message) {
            addLog(`🔍 ${payload.message}`);
        }

        const { actions } = payload;
        const player = store.playerState;

        // 2. 处理经验值 (Experience)
        if (actions.add_exp && actions.add_exp > 0) {
            player.gainExp(actions.add_exp);
            
            // 同步 UI 状态
            store.playerStats.level = player.level;
            store.playerStats.exp = player.exp;
            store.playerStats.maxHp = player.maxHp;
            
            addLog(`✨ 获得经验: ${actions.add_exp}`);
        }

        // 3. 处理金币 (Gold)
        if (actions.add_gold && actions.add_gold > 0) {
            player.gold += actions.add_gold;
            if (store.resources) {
                store.resources.gold = player.gold;
            }
            addLog(`💰 获得金币: ${actions.add_gold}`);
        }

        // 4. 处理物品分发 (支持动态对象)
        if (actions.add_items && Array.isArray(actions.add_items)) {
            actions.add_items.forEach(itemEntry => {
                this.processItem(player, itemEntry);
            });
        }

        // 5. 节点状态结算 (Mark as Visited)
        if (window.mapManager) {
            const currentNodeId = window.mapManager.currentMap?.currentNodeId;
            if (currentNodeId) {
                if (typeof window.mapManager.setNodeVisited === 'function') {
                    window.mapManager.setNodeVisited(currentNodeId);
                } else {
                    const node = window.mapManager.currentMap.nodes.find(n => n.id === currentNodeId);
                    if (node) node.state = 'VISITED';
                }
            }
        }
    }

    /**
     * 🟢 核心升级：统一处理静态与动态物品
     * @param {Object} player - 玩家实例
     * @param {Object|String} itemEntry - 物品对象 或 物品ID
     */
    static processItem(player, itemEntry) {
        let finalItem = null;
        let count = itemEntry.count || 1;

        // =================================================
        // 步骤 A: 解析物品数据 (Data Resolution)
        // =================================================

        // 情况 1: 动态物品对象 (Dynamic Object)
        if (itemEntry.stats || itemEntry.skillPayload || (itemEntry.type && !GameDatabase.Items[itemEntry.id])) {
            finalItem = itemEntry;
            // 确保动态物品有唯一的运行时 ID (防止堆叠冲突)
            if (!finalItem.id || !finalItem.id.includes('_dyn_')) {
                finalItem.id = `dyn_${itemEntry.type}_${Date.now()}_${Math.floor(Math.random()*1000)}`;
            }
        } 
        
        // 情况 2: 静态 ID (Static ID)
        else {
            const id = itemEntry.id || itemEntry; // 兼容 {id:"x"} 或 "x"
            // 依次查找：装备库 -> 物品库
            finalItem = GameDatabase.Equipment[id] || GameDatabase.Items[id];
            
            if (!finalItem) {
                console.warn(`[ResourceSystem] 无法识别物品 ID: ${id}`);
                return;
            }
        }

        if (!finalItem) return;

        // =================================================
        // 步骤 B: 注入背包 & 纯文本日志反馈
        // =================================================

        const qualityName = this.getQualityName(finalItem.quality); // 获取中文品质名

        // 1. 装备类 (WEAPON / ARMOR / ACCESSORY)
        if (['WEAPON', 'ARMOR', 'ACCESSORY'].includes(finalItem.type)) {
            if (typeof player.addItemToInventory === 'function') {
                player.addItemToInventory(finalItem, count);
            } else {
                console.error("[ResourceSystem] PlayerState 缺少 addItemToInventory 方法");
            }

            const subTypeStr = finalItem.subtype ? `[${finalItem.subtype}] ` : '';
            // 修正：移除 HTML，使用文本格式： ⚔️ 获得装备: 【普通】 [SWORD] 骑士长剑
            addLog(`⚔️ 获得装备: 【${qualityName}】 ${subTypeStr}${finalItem.name}`);
        }

        // 2. 特殊物品 / 技能书 (SPECIAL)
        else if (finalItem.type === 'SPECIAL') {
            if (typeof player.addItemToInventory === 'function') {
                player.addItemToInventory(finalItem, count);
            }
            
            // 如果是技能书，显示更详细的日志
            if (finalItem.effect_type === 'LEARN_SKILL') {
                 addLog(`📖 获得秘籍: 【${qualityName}】 ${finalItem.name}`);
            } else {
                 addLog(`🔑 获得特殊物品: 【${qualityName}】 ${finalItem.name} x${count}`);
            }
        }

        // 3. 普通消耗品 / 材料 (CONSUMABLE / MATERIAL)
        else {
            const itemRef = finalItem.stats ? finalItem : finalItem.id;
            player.addItemToInventory(itemRef, count);
            
            addLog(`📦 获得物品: 【${qualityName}】 ${finalItem.name} x${count}`);
        }
    }

    /**
     * 辅助：获取品质颜色代码 (保留此方法以备未来可能需要绘制带颜色的 Canvas)
     */
    static getQualityColor(quality) {
        const q = GameDatabase.ItemQuality[quality];
        return q ? q.color : '#ffffff';
    }

    /**
     * 新增辅助：获取品质中文名称 (用于纯文本 Log)
     * 例如: GREEN -> "普通", PURPLE -> "史诗"
     */
    static getQualityName(quality) {
        const q = GameDatabase.ItemQuality[quality];
        return q ? q.name : '未知';
    }
}