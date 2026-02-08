/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// src/ui/ShopOverlay.js
import { store } from './modules/store.js';
import { ShopSystem } from '../systems/ShopSystem/ShopSystem.js';
import { GameDatabase } from '../config/GameDatabase.js';
import { computed, ref } from '../../lib/vue.esm-browser.js';

// 定义回收价标准 (与 ShopSystem 保持一致用于显示)
const SELL_VALUATION = {
    GRAY: 10,
    GREEN: 50,
    BLUE: 150,
    PURPLE: 500,
    GOLD: 1500,
    RED: 3000
};

export default {
    name: 'ShopOverlay',
    template: `
    <div class="shop-backdrop" v-if="isOpen" @click.self="close">
        <div class="obsidian-terminal">
            <div class="terminal-header">
                <div class="header-left">
                    <div class="shop-title">
                        <span class="rune">◈</span> {{ shopName }}
                    </div>
                    <div class="trade-mode-switch">
                        <button :class="{ active: currentMode === 'BUY' }" @click="switchMode('BUY')">我是买家</button>
                        <button :class="{ active: currentMode === 'SELL' }" @click="switchMode('SELL')">我是卖家</button>
                    </div>
                </div>

                <div class="player-wealth">
                    <span class="gold-icon">🪙</span> {{ playerGold }}
                </div>
                <button class="terminal-close" @click="close">×</button>
            </div>

            <div class="terminal-body" :class="{ 'mode-sell': currentMode === 'SELL' }">
                <div class="dimension-sidebar">
                    <div class="nav-item" :class="{ active: activeTab === 'ITEM' }" @click="activeTab = 'ITEM'">
                        <div class="nav-icon">🧪</div>
                        <div class="nav-label">消耗品</div>
                    </div>
                    
                    <div class="nav-item" :class="{ active: activeTab === 'EQUIPMENT' }" @click="activeTab = 'EQUIPMENT'">
                        <div class="nav-icon">⚔️</div>
                        <div class="nav-label">军备库</div>
                    </div>
                    
                    <div class="sub-nav" v-if="activeTab === 'EQUIPMENT'">
                        <div class="sub-item" :class="{ selected: subTab === 'WEAPON' }" @click="subTab = 'WEAPON'">武器</div>
                        <div class="sub-item" :class="{ selected: subTab === 'HEAD' }" @click="subTab = 'HEAD'">头部</div>
                        <div class="sub-item" :class="{ selected: subTab === 'CHEST' }" @click="subTab = 'CHEST'">身体</div>
                        <div class="sub-item" :class="{ selected: subTab === 'HANDS' }" @click="subTab = 'HANDS'">手部</div>
                        <div class="sub-item" :class="{ selected: subTab === 'LEGS' }" @click="subTab = 'LEGS'">腿部</div>
                        <div class="sub-item" :class="{ selected: subTab === 'BOOTS' }" @click="subTab = 'BOOTS'">脚部</div>
                        <div class="sub-item" :class="{ selected: subTab === 'ACCESSORY' }" @click="subTab = 'ACCESSORY'">饰品</div>
                    </div>

                    <div class="nav-item" :class="{ active: activeTab === 'SPECIAL' }" @click="activeTab = 'SPECIAL'">
                        <div class="nav-icon">📜</div>
                        <div class="nav-label">珍品</div>
                    </div>
                </div>

                <div class="etheric-shelf">
                    <div class="shelf-header-hint" v-if="currentMode === 'SELL'">
                        📦 请选择你要出售的物品 (当前展示背包物品)
                    </div>
                    
                    <div class="shelf-grid">
                        <div v-if="filteredShelf.length === 0" class="empty-shelf-hint">
                            {{ currentMode === 'BUY' ? '该分类下暂无商品' : '你没有此类物品可卖' }}
                        </div>
                        
                        <div v-for="item in filteredShelf" :key="item._uniqueKey" 
                             class="product-card" 
                             :class="[getItemQualityClass(item)]"
                             @click="addToCart(item)"
                             @mouseenter="onHoverItem(item, $event)"
                             @mousemove="updateHoverPos($event)"
                             @mouseleave="onLeaveItem">
                            
                            <div class="card-glow"></div>
                            <div class="item-name" :style="{ color: getItemColor(item) }">
                                {{ getItemName(item) }}
                            </div>
                            
                            <div class="item-meta">
                                <span v-if="item.stats" class="meta-tag">装备</span>
                                <span v-if="currentMode === 'SELL'" class="meta-tag val-tag">回收</span>
                            </div>

                            <div class="item-price" :class="{ 'sell-price': currentMode === 'SELL' }">
                                {{ getDisplayPrice(item) }} 🪙
                            </div>

                            <div class="item-stock">
                                {{ currentMode === 'BUY' ? '存货' : '持有' }}: {{ item.stock || item.count }}
                            </div>
                            
                            <div class="sold-out-overlay" v-if="(item.stock !== undefined && item.stock <= 0) || (item.count !== undefined && item.count <= 0)">
                                {{ currentMode === 'BUY' ? '已售罄' : '已卖光' }}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="checkout-rift">
                    <div class="rift-header">
                        {{ currentMode === 'BUY' ? '购物清单' : '出售列表' }}
                    </div>
                    
                    <div class="cart-list">
                        <div v-if="cart.length === 0" class="empty-cart-hint">
                            {{ currentMode === 'BUY' ? '挑选商品...' : '点击左侧物品出售...' }}
                        </div>
                        <div v-for="item in cart" :key="item.id" class="cart-item">
                            <div class="cart-item-info">
                                <div class="name" :style="{ color: getItemColor(item._originItem || item) }">
                                    {{ item.name }}
                                </div>
                                <div class="price" :class="{ 'gain-text': currentMode === 'SELL' }">
                                    {{ item.price * item.count }} 🪙
                                </div>
                            </div>
                            <div class="quantity-ctrl">
                                <button @click="updateQty(item.id, -1)">-</button>
                                <span>{{ item.count }}</span>
                                <button @click="updateQty(item.id, 1)">+</button>
                            </div>
                        </div>
                    </div>

                    <div class="rift-footer">
                        <div class="total-row">
                            <span>{{ currentMode === 'BUY' ? '总计支付' : '预计收入' }}</span>
                            <span class="total-price" :class="{ warning: !canAfford && currentMode === 'BUY', 'gain-text': currentMode === 'SELL' }">
                                {{ totalPrice }} 🪙
                            </span>
                        </div>
                        <button class="buy-btn" 
                                :disabled="cart.length === 0 || (!canAfford && currentMode === 'BUY')"
                                @click="handlePurchase">
                            {{ currentMode === 'BUY' ? '支付金币' : '确认出售' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="confirm-overlay" v-if="showConfirm">
            <div class="confirm-box">
                <h3>{{ currentMode === 'BUY' ? '确认购买' : '确认出售' }}</h3>
                <p v-if="currentMode === 'BUY'">
                    支付 <span style="color:#f1c40f">{{ totalPrice }}</span> 金币<br>购买清单物品？
                </p>
                <p v-else>
                    出售物品可获得 <span style="color:#2ecc71">{{ totalPrice }}</span> 金币<br>确定要卖掉它们吗？
                </p>
                <div class="confirm-btns">
                    <button class="confirm-yes" @click="confirmPurchase">确 认</button>
                    <button class="confirm-no" @click="showConfirm = false">取 消</button>
                </div>
            </div>
        </div>

        <div v-if="hoverItem" class="shop-tooltip" :style="{ top: hoverPos.y + 'px', left: hoverPos.x + 'px' }">
            <div class="t-header" :style="{ color: getItemColor(hoverItem) }">
                {{ getItemName(hoverItem) }}
            </div>
            <div class="t-sub">
                {{ getSubTitle(hoverItem) }}
            </div>
            <div class="t-body">
                <div class="t-desc">{{ hoverItem.description || hoverItem.desc || '暂无描述' }}</div>
                
                <div v-if="hoverItem.stats" class="t-stats-box">
                    <div v-for="(val, key) in formatStats(hoverItem.stats)" :key="key" class="t-stat-row">
                        <span class="s-key">{{ key }}</span>
                        <span class="s-val">{{ val }}</span>
                    </div>
                </div>

                <div v-if="hoverItem.skillPayload" class="t-skill-box">
                    <div class="t-skill-name">
                        奥义: {{ hoverItem.skillPayload.name }} 
                        <span class="t-ele" :class="hoverItem.skillPayload.element">{{ hoverItem.skillPayload.element }}</span>
                    </div>
                    <div class="t-skill-cost">消耗 MP: {{ hoverItem.skillPayload.cost?.mp || 0 }}</div>
                </div>
            </div>
        </div>
    </div>
    `,
    setup() {
        const activeTab = ref('ITEM'); 
        const subTab = ref('WEAPON');
        const showConfirm = ref(false);
        const hoverItem = ref(null);
        const hoverPos = ref({ x: 0, y: 0 });

        // --- 数据绑定 ---
        const isOpen = computed(() => ShopSystem.isOpen);
        const shopName = computed(() => ShopSystem.shopName);
        const cart = computed(() => ShopSystem.cart);
        const totalPrice = computed(() => ShopSystem.totalPrice);
        const canAfford = computed(() => ShopSystem.canAfford);
        const playerGold = computed(() => store.playerState?.gold || 0);
        const currentMode = computed(() => ShopSystem.mode); // BUY | SELL

        // --- 核心：动态货架计算 ---
        const filteredShelf = computed(() => {
            let sourceItems = [];

            // 1. 确定数据源
            if (currentMode.value === 'BUY') {
                sourceItems = ShopSystem.shelf;
            } else {
                // SELL模式：从玩家背包读取，并进行预处理
                const bag = store.party[0]?.inventory || [];
                sourceItems = bag.map((slot, index) => {
                    // 解析背包物品 (可能是 {id, count} 或 完整对象)
                    // 为了统一展示，我们需要 resolve 完整数据
                    const isDynamic = slot.stats || slot.type === 'SPECIAL';
                    const dbData = isDynamic ? slot : (GameDatabase.Items[slot.id] || GameDatabase.Equipment[slot.id]);
                    
                    if (!dbData) return null;

                    return {
                        ...slot, // 保留 count, id
                        ...dbData, // 混入 name, quality, type, stats
                        _uniqueKey: `bag_${index}_${slot.id}`, // 唯一键，防重复
                        price: 0 // 占位，实际价格由 getDisplayPrice 计算
                    };
                }).filter(i => i !== null);
            }

            // 2. 执行过滤
            return sourceItems.filter(item => {
                // 筛选逻辑与之前一致
                if (activeTab.value === 'ITEM') {
                    return item.type === 'ITEM' || item.type === 'CONSUMABLE';
                }
                if (activeTab.value === 'SPECIAL') {
                    return item.type === 'SPECIAL';
                }
                if (activeTab.value === 'EQUIPMENT') {
                    if (item.type !== 'EQUIPMENT' && 
                        item.type !== 'WEAPON' && 
                        item.type !== 'ARMOR' && 
                        item.type !== 'ACCESSORY') return false;

                    const cat = item.subtype || item.category;
                    if (subTab.value === 'WEAPON') return item.type === 'WEAPON';
                    if (subTab.value === 'ACCESSORY') return item.type === 'ACCESSORY';
                    return cat === subTab.value;
                }
                return false;
            });
        });

        // --- 交互方法 ---
        const switchMode = (mode) => {
            ShopSystem.setMode(mode);
        };

        const getDisplayPrice = (item) => {
            if (currentMode.value === 'BUY') {
                return item.price || 9999;
            } else {
                // SELL模式：根据品质计算
                const q = item.quality || 'GRAY';
                return SELL_VALUATION[q] || 10;
            }
        };

        // --- 显示辅助 ---
        const getItemName = (item) => item.name || item.id;
        
        const getItemQualityClass = (item) => `quality-${(item.quality || 'GREEN').toLowerCase()}`;

        const getItemColor = (item) => {
            const q = item.quality || 'GREEN';
            const colors = {
                GRAY: '#7f8c8d', GREEN: '#2ecc71', BLUE: '#3498db',
                PURPLE: '#9b59b6', GOLD: '#f1c40f', RED: '#ff4444'
            };
            return colors[q] || '#fff';
        };

        const getSubTitle = (item) => {
            if (item.type === 'WEAPON') return `[武器] ${item.subtype || ''}`;
            if (item.type === 'ARMOR') return `[防具] ${item.subtype || ''}`;
            if (item.type === 'ACCESSORY') return '[饰品]';
            if (item.type === 'SPECIAL') return item.type_desc || '[特殊道具]';
            return '[消耗品]';
        };

        const formatStats = (stats) => {
             const map = {
                atk: '攻击力', def_phys: '物理防御', def_magic: '魔法防御',
                maxHp: '生命上限', maxMp: '魔力上限', speed: '速度',
                critRate: '暴击率', critDamage: '暴击伤害', dodgeRate: '闪避率',
                res_phys: '物理免伤', res_magic: '魔法免伤'
            };
            const res = {};
            for (const [key, val] of Object.entries(stats)) {
                if (map[key] && val !== 0) {
                    let displayVal = val;
                    if (['critRate', 'dodgeRate', 'res_phys', 'res_magic'].includes(key)) {
                        displayVal = (val > 0 ? '+' : '') + (val * 100).toFixed(0) + '%';
                        if (key.startsWith('res_')) displayVal = ((1 - val) * 100).toFixed(0) + '%';
                    } else if (key === 'critDamage') {
                        displayVal = '+' + (val * 100).toFixed(0) + '%';
                    } else {
                        displayVal = (val > 0 ? '+' : '') + val;
                    }
                    res[map[key]] = displayVal;
                }
            }
            return res;
        };

        // --- 事件透传 ---
        const addToCart = (item) => ShopSystem.addToCart(item);
        const updateQty = (id, delta) => ShopSystem.updateCartQuantity(id, delta);
        const handlePurchase = () => showConfirm.value = true;
        const confirmPurchase = async () => {
            const success = await ShopSystem.executeTransaction();
            if (success) showConfirm.value = false;
        };
        const close = () => ShopSystem.close();

        // Tooltip
        const onHoverItem = (item, e) => { hoverItem.value = item; updateHoverPos(e); };
        const updateHoverPos = (e) => { hoverPos.value = { x: e.clientX + 20, y: e.clientY + 20 }; };
        const onLeaveItem = () => { hoverItem.value = null; };

        return {
            isOpen, shopName, cart, totalPrice, canAfford, playerGold, currentMode,
            activeTab, subTab, filteredShelf, showConfirm,
            hoverItem, hoverPos,
            switchMode, getDisplayPrice,
            getItemName, getItemQualityClass, getItemColor, getSubTitle, formatStats,
            addToCart, updateQty, handlePurchase, confirmPurchase, close,
            onHoverItem, updateHoverPos, onLeaveItem
        };
    }
};