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

// src/systems/ShopSystem/ShopSystem.js
import { reactive, computed } from '../../../lib/vue.esm-browser.js';
import { store, addLog } from '../../ui/modules/store.js';
import { GameDatabase } from '../../config/GameDatabase.js';

/** * 💰 价值基准表 (Valuation Table)
 * 定义了各品质物品的"基础回收价"。
 * 导出此常量供 UI 组件使用，保证数据源唯一。
 */
export const SELL_VALUATION = {
    GRAY: 10,
    GREEN: 50,
    BLUE: 150,
    PURPLE: 500,
    GOLD: 1500,
    RED: 3000
};

/**
 * 📦 静态消耗品清单 (自动进货列表)
 * 任何商店都会包含这些物品，库存随机 [1, 10]
 */
const STATIC_CONSUMABLES = [
    // 生命恢复
    'potion_hp_low', 'potion_hp_mid', 'potion_hp_high',
    // 魔力恢复
    'potion_mp_low', 'potion_mp_mid', 'potion_mp_high',
    // 复合恢复
    'potion_hybrid_low', 'potion_hybrid_mid', 'potion_hybrid_high',
    // 复活
    'potion_revive',
    // 攻击力提升
    'potion_buff_atk_L1', 'potion_buff_atk_L2', 'potion_buff_atk_L3',
    // 速度提升 (敏捷)
    'potion_buff_agi_L1', 'potion_buff_agi_L2', 'potion_buff_agi_L3',
    // 暴击率提升
    'potion_buff_crit_rate_L1', 'potion_buff_crit_rate_L2', 'potion_buff_crit_rate_L3',
    // 防御力提升
    'potion_buff_def_L1', 'potion_buff_def_L2', 'potion_buff_def_L3',
    // 暴击伤害提升
    'potion_buff_crit_dmg_L1', 'potion_buff_crit_dmg_L2', 'potion_buff_crit_dmg_L3'
];

/**
 * ==========================================
 * 商店系统逻辑核心 (Shop System Logic) v3.3
 * ==========================================
 * 更新日志：
 * - 自动化静态商品进货：自动注入全量消耗品，无需 LLM 生成。
 * - 库存持久化优化：静态商品的库存消耗也会被记录。
 */
export const ShopSystem = reactive({
    // --- 状态存储 ---
    isOpen: false,
    shopName: "神秘集市",
    _sourcePayload: null, // 用于保存对原始地图 Payload 的引用

    /**
     * 交易模式
     * 'BUY'  : 购买模式 (玩家花钱，获得物品)
     * 'SELL' : 出售模式 (玩家卖物，获得金币)
     */
    mode: 'BUY', 

    shelf: [],    // 商店的库存 (仅用于购买模式)
    cart: [],     // 购物车 (通用，切换模式时会清空)

    // --- 计算属性 ---
    
    totalPrice: computed(() => {
        return ShopSystem.cart.reduce((sum, item) => sum + (item.price * item.count), 0);
    }),

    canAfford: computed(() => {
        if (ShopSystem.mode === 'SELL') return true;
        const playerGold = store.playerState?.gold || 0;
        return playerGold >= ShopSystem.totalPrice;
    }),

    // --- 核心方法 ---

    /**
     * 初始化商店
     * 🟢 核心修改：在此处注入静态商品
     */
    init(payload) {
        this.shopName = payload.name || "虚空商铺";
        this.mode = 'BUY'; 
        
        // 保存原始 Payload 引用
        this._sourcePayload = payload; 

        // 🟢 步骤 1: 检查并初始化静态库存 (如果之前没生成过)
        // 我们将生成的静态库存挂载到 payload._staticStock 字段上，以便持久化
        if (!this._sourcePayload._staticStock) {
            console.log("[ShopSystem] 首次访问，自动生成静态消耗品库存...");
            this._sourcePayload._staticStock = STATIC_CONSUMABLES.map(id => ({
                id: id,
                stock: Math.floor(Math.random() * 10) + 1 // 随机库存 [1, 10]
            }));
        }

        // 🟢 步骤 2: 合并货源 (静态库存 + 动态物品)
        // 使用深拷贝，防止直接修改影响源数据，直到 _executeBuy 确认购买
        const staticItems = JSON.parse(JSON.stringify(this._sourcePayload._staticStock));
        const dynamicItems = JSON.parse(JSON.stringify(payload.items || []));

        // 🟢 步骤 3: 补全数据并上架
        // 静态物品在前，动态物品在后
        this.shelf = [...staticItems, ...dynamicItems].map(item => {
            this._hydrateItemData(item); 
            return item;
        });

        this.cart = [];
        this.isOpen = true;
        console.log(`[ShopSystem] 商店已开启 | 商品总数: ${this.shelf.length}`);
    },

    setMode(targetMode) {
        if (this.mode !== targetMode) {
            this.mode = targetMode;
            this.cart = []; 
            addLog(targetMode === 'BUY' ? "🛒 切换至：购买模式" : "💰 切换至：出售模式");
        }
    },

    addToCart(product) {
        if (this.mode === 'BUY') {
            if (product.stock <= 0) {
                addLog("⚠ 该商品已售罄");
                return;
            }
            this._addItemToCartInternal(product, product.stock, product.price);
        } else if (this.mode === 'SELL') {
            const playerOwnedCount = product.count || 0;
            if (playerOwnedCount <= 0) {
                addLog("⚠ 你没有该物品可卖");
                return;
            }
            const quality = product.quality || 'GRAY';
            const sellPrice = SELL_VALUATION[quality] || 10;
            this._addItemToCartInternal(product, playerOwnedCount, sellPrice);
        }
    },

    _addItemToCartInternal(itemSource, maxLimit, unitPrice) {
        const existing = this.cart.find(i => i.id === itemSource.id);

        if (existing) {
            if (existing.count < maxLimit) {
                existing.count++;
            } else {
                addLog(this.mode === 'BUY' ? "⚠ 库存不足" : "⚠ 已全部放入出售栏");
            }
        } else {
            this.cart.push({
                id: itemSource.id,
                name: itemSource.name,
                price: unitPrice, 
                type: itemSource.type,           
                category: itemSource.subtype || itemSource.category,
                count: 1,
                quality: itemSource.quality,
                _maxLimit: maxLimit, 
                _originItem: itemSource 
            });
        }
    },

    updateCartQuantity(itemId, delta) {
        const index = this.cart.findIndex(i => i.id === itemId);
        if (index === -1) return;

        const item = this.cart[index];
        const newCount = item.count + delta;

        if (newCount <= 0) {
            this.cart.splice(index, 1);
        } else if (newCount > item._maxLimit) {
            item.count = item._maxLimit;
            addLog("⚠ 数量已达上限");
        } else {
            item.count = newCount;
        }
    },

    async executeTransaction() {
        if (this.cart.length === 0) return;
        if (this.mode === 'BUY') {
            return await this._executeBuy();
        } else {
            return await this._executeSell();
        }
    },

    /**
     * 内部：执行购买逻辑
     * 🟢 更新：支持同步静态和动态库存
     */
    async _executeBuy() {
        if (!this.canAfford) {
            addLog("❌ 金币不足");
            return false;
        }

        const player = store.playerState;
        
        // 1. 扣钱
        player.gold -= this.totalPrice;
        if (store.resources) store.resources.gold = player.gold;

        let summary = [];

        // 2. 发货与扣库存
        this.cart.forEach(cartItem => {
            // 2.1 扣除 UI 货架库存
            const shelfItem = this.shelf.find(s => s.id === cartItem.id);
            if (shelfItem) {
                shelfItem.stock -= cartItem.count;

                // 2.2 同步回原始 Payload (持久化)
                if (this._sourcePayload) {
                    let synced = false;
                    
                    // 尝试在动态物品列表中查找并同步
                    if (this._sourcePayload.items) {
                        const dynItem = this._sourcePayload.items.find(i => i.id === cartItem.id);
                        if (dynItem) {
                            dynItem.stock = shelfItem.stock;
                            synced = true;
                        }
                    }

                    // 如果动态里没找到，尝试在静态库存中查找并同步
                    if (!synced && this._sourcePayload._staticStock) {
                        const statItem = this._sourcePayload._staticStock.find(i => i.id === cartItem.id);
                        if (statItem) {
                            statItem.stock = shelfItem.stock;
                        }
                    }
                }
            }
            
            // 2.3 发放物品给玩家
            this.distributeItem(player, shelfItem || cartItem._originItem, cartItem.count);
            summary.push(`${cartItem.name} x${cartItem.count}`);
        });

        addLog(`✅ 购买成功，花费 ${this.totalPrice} 金币`);
        this.cart = [];
        return true;
    },

    async _executeSell() {
        const player = store.playerState;
        const totalGain = this.totalPrice;
        let summary = [];

        this.cart.forEach(cartItem => {
            player.removeItemFromInventory(cartItem._originItem, cartItem.count);
            const name = cartItem.name || (cartItem._originItem ? cartItem._originItem.name : "未知物品");
            summary.push(`${name} x${cartItem.count}`);
        });

        player.gold += totalGain;
        if (store.resources) store.resources.gold = player.gold;

        addLog(`💰 出售完成，获得 ${totalGain} 金币`);
        if (summary.length > 0) {
            addLog(`失去: ${summary.join(', ')}`);
        }
        
        this.cart = [];
        return true;
    },

    _hydrateItemData(item) {
        // 1. 补全静态数据 (从数据库查表)
        if (!item.name || !item.quality) {
            const dbItem = GameDatabase.Items[item.id] || GameDatabase.Equipment[item.id];
            if (dbItem) {
                item.name = item.name || dbItem.name;
                item.quality = item.quality || dbItem.quality;
                item.type = item.type || dbItem.type;
                item.description = item.description || dbItem.desc || dbItem.description;
            }
        }

        // 2. 动态定价逻辑 (Dynamic Pricing)
        // 售价 = 基准回收价 * (2 + [-0.5, 0.5])
        const quality = item.quality || 'GRAY';
        const baseValue = SELL_VALUATION[quality] || 10;
        const randomFluctuation = Math.random() - 0.5; 
        const multiplier = 2 + randomFluctuation;
        
        item.price = Math.floor(baseValue * multiplier);
    },

    distributeItem(player, itemData, count) {
        const itemPayload = { ...itemData }; 
        delete itemPayload.price;
        delete itemPayload.stock;
        delete itemPayload._maxLimit;

        const type = itemPayload.type;

        if (['WEAPON', 'ARMOR', 'ACCESSORY'].includes(type)) {
            for(let i = 0; i < count; i++) {
                const uniqueItem = JSON.parse(JSON.stringify(itemPayload));
                player.addItemToInventory(uniqueItem, 1);
            }
        } else {
            player.addItemToInventory(itemPayload, count);
        }
    },

    /**
     * === [NEW] 外部启动入口 ===
     * 1. 初始化库存
     * 2. 隐藏地图层
     * 3. 打开 UI
     */
    open(payload) {
        console.log("[ShopSystem] 🚀 请求开启商店");
        
        // 1. 调用原有的初始化逻辑
        this.init(payload);

        // 2. 隐藏 Phaser 地图 (提升 UI 沉浸感)
        if (window.uiStore) {
            window.uiStore.gameCanvasVisible = false;
        }
    },

    /**
     * 关闭商店
     * (需要修改此方法以恢复地图)
     */
    close() {
        this.isOpen = false;
        this.cart = [];
        this.shelf = [];
        addLog('你离开了集市');

        // 🟢 [NEW] 恢复地图显示
        if (window.uiStore) {
            window.uiStore.gameCanvasVisible = true;
        }
    },

});