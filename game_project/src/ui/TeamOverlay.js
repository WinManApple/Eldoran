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

// src/ui/TeamOverlay.js
import { store, addLog } from './modules/store.js';
import { GameDatabase } from '../config/GameDatabase.js';
import { H_STATE_CONFIG } from '../LLM/calls/Configuration_Table.js';
import { H_State_Memory } from '../LLM/memory/H_State_Memory.js';

export const TeamOverlay = {
    name: 'TeamOverlay',
    // 组件挂载时自动检查并清理未知物品
    mounted() {
        this.cleanUnknownItems();
    },
    data() {
        return {
            store,
            GameDatabase,
            selectedMemberIndex: 0,
            activeTab: 'status', // status | inventory | skills | special
            
            // 装备选择器状态
            showPicker: false,
            pickerSlot: null,
            pickerItems: [],

            // 道具确认状态
            showConfirm: false,
            confirmItem: null,

            // 纪念品弹窗状态
            showLore: false,
            loreItem: null,

            // 悬浮提示框状态
            hoverItem: null,
            hoverPos: { x: 0, y: 0 },

            // 核心目标编辑状态
            showObjEditor: false,
            editObjText: '',
            editIdentityText: '',

            // H 属性详情状态
            showHDetail: false,
            hDetailChar: null, // 当前正在查看的女性角色
            
            // 新增：H 部位名称映射 (用于翻译)
            partNames: {
                clitoris: '阴蒂', vagina: '阴道', uterus: '子宫',
                anus: '菊穴', mouth: '口腔', nipples: '乳头', breasts: '乳房'
            },

            // 新增：解散确认弹窗
            showDismissConfirm: false,
            dismissTarget: null,

            // 🟢 [补全] 物品删除确认状态 (必须添加这两个变量，否则会报错)
            showDeleteItemConfirm: false,
            itemToDelete: null

        };
    },
    computed: {
        member() {
            return this.store.party[this.selectedMemberIndex];
        },
        partyBag() {
            return this.store.party[0].inventory;
        },
        
        displayItems() {
            if (!this.partyBag) return [];
            return this.partyBag.map(slot => {
                const isDynamic = (typeof slot === 'object') && (slot.stats || slot.type === 'SPECIAL');
                const dbData = isDynamic 
                    ? slot 
                    : (GameDatabase.Items[slot.id] || GameDatabase.Equipment[slot.id]);

                if (!dbData) return { ...slot, name: '未知物品', color: '#ccc' };

                const qualityInfo = GameDatabase.ItemQuality[dbData.quality] || GameDatabase.ItemQuality.GRAY;
                
                return {
                    ...slot,
                    ...dbData,
                    _origin: slot, 
                    color: qualityInfo.color
                };
            });
        },

        consumableList() {
            return this.displayItems.filter(item => item.type === 'CONSUMABLE' || !item.type);
        },

        specialList() {
            return this.displayItems.filter(item => item.type === 'SPECIAL');
        },

        displayStats() {
            if (!this.member) return [];
            const cs = this.member.combatStats;
            
            const elementMap = {
                'NONE': '无', 'FIRE': '火', 'WATER': '水', 
                'WOOD': '木', 'EARTH': '土', 'METAL': '金',
                'HOLY': '圣', 'DEMON': '魔'
            };
            const elName = elementMap[this.member.element] || this.member.element;

            // 格式化辅助函数
            const toPct = (val) => (val * 100).toFixed(0) + '%';
            // 抗性转换：1.0 代表 100% 承伤 (0% 免伤)，0.8 代表 20% 免伤
            const toRes = (val) => ((1 - val) * 100).toFixed(1) + '%';

            return [
                // 第一行：攻击与属性
                { label: '攻击力', val: cs.final_atk, color: '#ff6666' },
                { label: '属性', val: elName, color: '#66ccff' },

                // 第二行：双防
                { label: '物理防御', val: cs.final_def_phys, color: '#66ff66' },
                { label: '魔法防御', val: cs.final_def_magic, color: '#aaaaff' }, // 🟢 新增

                // 第三行：双抗免伤
                { label: '物理免伤', val: toRes(cs.final_res_phys), color: '#88ff88' }, // 🟢 新增
                { label: '魔法免伤', val: toRes(cs.final_res_magic), color: '#8888ff' }, // 🟢 新增

                // 第四行：暴击相关
                { label: '暴击率', val: toPct(cs.final_crit_rate) },
                { label: '暴击伤', val: toPct(cs.final_crit_dmg) },

                // 第五行：速度与闪避
                { label: '速度', val: cs.final_speed.toFixed(1), color: '#ffff66' },
                // 可选：顺便加上闪避率，凑个整齐
                { label: '闪避率', val: toPct(cs.final_dodge || 0), color: '#d4af37' } 
            ];
        },

        // 🟢 修复：标准化技能数据，解决动态技能不显示描述的问题
        memberSkills() {
            if (!this.member) return [];
            return this.member.skills.learned.map(skill => {
                const data = (typeof skill === 'object') ? skill : GameDatabase.Skills[skill];
                return data;
            })
            .filter(s => s) // 过滤空值
            .map(s => ({
                ...s,
                // 兼容不同字段名
                desc: s.desc || s.description || '暂无描述',
                element: s.element || 'NONE'
            }));
        }
    },
    methods: {
        
        // 🟢 新增：清理未知物品并折算金币
        cleanUnknownItems() {
            // 获取队长（背包拥有者）
            const party = this.store.party[0];
            if (!party || !party.inventory) return;

            const bag = party.inventory;
            let totalGold = 0;
            let removedCount = 0;

            // 倒序遍历，以便安全地执行 splice 删除操作
            for (let i = bag.length - 1; i >= 0; i--) {
                const slot = bag[i];
                
                // 复用 displayItems 的判断逻辑
                const isDynamic = (typeof slot === 'object') && (slot.stats || slot.type === 'SPECIAL');
                // 静态物品通常是 { id: "xxx", count: 1 }
                const itemId = slot.id; 

                const dbData = isDynamic 
                    ? slot 
                    : (GameDatabase.Items[itemId] || GameDatabase.Equipment[itemId]);

                // 如果既不是动态物品，又不在数据库中，则判定为未知物品
                if (!dbData) {
                    const count = slot.count || 1;
                    totalGold += count * 25;
                    removedCount += count;
                    
                    // 从背包中移除
                    bag.splice(i, 1);
                }
            }

            // 如果有回收，发放金币并提示
            if (removedCount > 0) {
                party.gold += totalGold;
                addLog(`💰 自动回收了 ${removedCount} 个非法物品(LLM幻觉)，折算获得 ${totalGold} 金币`, 'system');
            }
        },
        
        close() { this.$emit('close'); },

        // 处理成员列表点击 (二段点击逻辑)
        handleMemberClick(index) {
            const member = this.store.party[index];

            // 如果点击的是当前已选中的角色 -> 触发深度交互
            if (this.selectedMemberIndex === index) {
                
                // 情况A: 玩家修改自己的核心目标与身份
                if (member.id === 'player_001') {
                    this.editObjText = member.core_objective || '';
                    //  读取身份，如果不存在则初始化为空
                    this.editIdentityText = member.identity || ''; 
                    this.showObjEditor = true;
                    return;
                }

                // 情况B: 查看女性角色的 H 详情
                if (member.id !== 'player_001') {
                    this.hDetailChar = member; // 复用此变量作为“当前查看的角色”
                    this.showHDetail = true;   // 复用此开关
                    return;
                }
            }

            // 否则，仅切换选中项
            this.selectedMemberIndex = index;
        },

        // 保存玩家档案 (身份 + 核心目标)
        savePlayerProfile() {
            const member = this.store.party[0]; // 确保是主角
            if (member && member.id === 'player_001') {
                // 更新目标
                member.core_objective = this.editObjText;
                // [新增] 更新身份
                member.identity = this.editIdentityText;
                
                // 这里的数据更新会自动被下一次 LLM Memory 读取逻辑捕获
                addLog(`📝 玩家档案(身份与目标)已重写`, 'system');
            }
            this.showObjEditor = false;
        },

        // 通用 H 描述解析器 (模块化设计)
        // configArray: 传入 H_STATE_CONFIG 里的某个数组 (如 LONG_TERM.AFFECTION)
        // value: 当前数值
        getHConfigText(configArray, value) {
            if (!Array.isArray(configArray)) return '未知状态';
            
            // 遍历配置表，找到第一个 max >= value 的项
            // Configuration_Table.js 里的逻辑是 "满足条件即命中"，通常是从小到大排列
            const match = configArray.find(entry => value < entry.max);
            
            // 如果数值爆表(超过配置表最大值)，取最后一个
            return match ? match.text : configArray[configArray.length - 1].text;
        },

        // 获取特定类型的描述 (对 getHConfigText 的封装)
        getHDesc(type, subtype, value) {
            if (!this.hDetailChar) return '';

            // 1. 确保该角色的记忆已初始化 (防止新队友报错)
            H_State_Memory.initForCharacter(this.hDetailChar.id);

            // 2. 映射键名 (配置表是 ALL_CAPS，记忆库是 CamelCase)
            let memType = type;
            if (type === 'LONG_TERM') memType = 'Long_Term';
            if (type === 'SHORT_TERM') memType = 'Short_Term';

            // 3. 从动态记忆中获取规则列表
            const configList = H_State_Memory.getRuleSet(this.hDetailChar.id, memType, subtype);
            
            if (!configList) return '暂无描述';

            return this.getHConfigText(configList, value);
        },

        // [新增] 跳转到 H 阶段编辑器
        openHEditor() {
            if (!this.hDetailChar) return;
            
            // 将当前查看的角色 ID 存入 store 供编辑器读取
            // (需要在 store.js 中确保允许添加此临时属性，或者直接利用 JS 对象的动态性)
            this.store.tempEditorTargetId = this.hDetailChar.id;
            
            // 关闭当前详情页
            this.showHDetail = false;
            
            // 切换主菜单状态，这将导致 TeamOverlay 被销毁/隐藏，HStateOverlay 被加载
            this.store.currentMenu = 'h_state_editor';
        },

        // 获取属性中文名称
        getElementName(code) {
            const map = {
                'NONE': '无', 'FIRE': '火', 'WATER': '水', 
                'WOOD': '木', 'EARTH': '土', 'METAL': '金',
                'HOLY': '圣', 'DEMON': '魔'
            };
            return map[code] || code;
        },

        // =========================
        // 🖱️ 鼠标交互逻辑 (新增)
        // =========================
        onHoverItem(item, e) {
            this.hoverItem = item;
            this.updateHoverPos(e);
        },
        
        updateHoverPos(e) {
            if (this.hoverItem) {
                // 偏移一点，避免遮挡鼠标
                this.hoverPos = { 
                    x: e.clientX + 15, 
                    y: e.clientY + 15 
                };
            }
        },
        
        onLeaveItem() {
            this.hoverItem = null;
        },

        // 🟢 辅助：生成属性文本字符串 (用于 tooltip 或 列表)
        getStatsString(item) {
            if (!item || !item.stats) return '';
            const map = {
                atk: 'ATK', def_phys: '物防', def_magic: '魔防',
                maxHp: 'HP', maxMp: 'MP', speed: 'SPD',
                critRate: '暴击', critDamage: '爆伤', dodgeRate: '闪避'
            };
            let parts = [];
            for (const [key, val] of Object.entries(item.stats)) {
                if (val !== 0 && map[key]) {
                    if (['critRate','critDamage','dodgeRate'].includes(key)) {
                        parts.push(`${map[key]}+${(val*100).toFixed(0)}%`);
                    } else {
                        parts.push(`${map[key]}+${val}`);
                    }
                }
            }
            return parts.join(' ');
        },

        // =========================
        // 🧪 道具使用逻辑
        // =========================
        askUseItem(item) {
            if (item.type === 'SPECIAL') {
                if (item.effect_type === 'LEARN_SKILL') {
                    this.confirmItem = item;
                    this.showConfirm = true;
                } else {
                    this.loreItem = item;
                    this.showLore = true;
                }
                return;
            }
            if (item.type !== 'CONSUMABLE') {
                addLog("装备类物品请在角色页面进行穿戴", "system");
                return;
            }
            this.confirmItem = item;
            this.showConfirm = true;
        },

        executeUseItem() {
            const item = this.confirmItem;
            if (!item || !this.member) return;

            // A. 技能书
            if (item.type === 'SPECIAL' && item.effect_type === 'LEARN_SKILL') {
                if (this.member.learnSkill(item.skillPayload)) {
                    addLog(`✨ ${this.member.name} 习得了新技能：[${item.skillPayload.name}]！`);
                    this.store.party[0].removeItemFromInventory(item._origin || item, 1);
                } else {
                    addLog(`无法学习：可能已掌握该技能`, 'error');
                }
                this.showConfirm = false;
                this.confirmItem = null;
                return;
            }

            // B. 药水
            if (this.member.isDead && item.effect_type !== 'REVIVE_HP_PERCENT') {
                addLog(`无法对倒下的 ${this.member.name} 使用普通药水！`, 'system');
                this.showConfirm = false;
                return;
            }
            if (item.effect_type === 'BUFF_STAT') {
                addLog("BUFF药水仅能够在战斗中使用！");
                this.showConfirm = false;
                this.confirmItem = null;
                return; 
            }

            let success = false;
            if (item.effect_type === 'REVIVE_HP_PERCENT') {
                const val = Math.floor(this.member.maxHp * item.value);
                if (this.member.revive(val)) {
                    addLog(`✨ 使用 ${item.name} 复活了 ${this.member.name}！`);
                    success = true;
                }
            } else {
                if (item.effect_type.includes('HP')) {
                    const val = Math.floor(this.member.maxHp * item.value);
                    this.member.heal(val);
                    addLog(`${this.member.name} 恢复了 ${val} 生命`);
                    success = true;
                }
                if (item.effect_type.includes('MP')) {
                    const val = Math.floor(this.member.maxMp * item.value);
                    this.member.restoreMp(val);
                    addLog(`${this.member.name} 恢复了 ${val} 魔力`);
                    success = true;
                }
            }

            if (success) {
                this.store.party[0].removeItemFromInventory(item._origin || item.id, 1);
            }
            this.showConfirm = false;
            this.confirmItem = null;
        },

        // =========================
        // 🛡️ 装备逻辑
        // =========================
        resolveEquip(equipRef) {
            if (!equipRef) return null;
            if (typeof equipRef === 'string') {
                return GameDatabase.Equipment[equipRef] || GameDatabase.Items[equipRef];
            }
            return equipRef;
        },

        getEquipColor(equipRef) {
            const data = this.resolveEquip(equipRef);
            if (!data) return '#888';
            const quality = data.quality || 'GRAY';
            return GameDatabase.ItemQuality[quality]?.color || '#ccc';
        },

        openEquipPicker(slot) {
            this.pickerSlot = slot;
            let targetType = 'WEAPON'; 
            const armorSlots = ['head', 'chest', 'hands', 'legs', 'boots'];
            
            if (armorSlots.includes(slot)) {
                targetType = 'ARMOR';
            } else if (slot.includes('accessory')) {
                targetType = 'ACCESSORY';
            }

            this.pickerItems = this.partyBag.filter(invItem => {
                const itemData = (typeof invItem === 'object' && invItem.stats) 
                    ? invItem 
                    : GameDatabase.Equipment[invItem.id];

                if (!itemData) return false;
                if (itemData.type !== targetType) return false;
                if (targetType === 'ARMOR') {
                    return itemData.subtype && slot.toUpperCase() === itemData.subtype;
                }
                return true;
            }).map(invItem => {
                const data = (typeof invItem === 'object' && invItem.stats) 
                    ? invItem 
                    : GameDatabase.Equipment[invItem.id];
                
                const qualityInfo = GameDatabase.ItemQuality[data.quality] || GameDatabase.ItemQuality.GRAY;
                return { 
                    ...invItem, 
                    ...data,
                    _origin: invItem, 
                    color: qualityInfo.color
                };
            });
            
            this.showPicker = true;
        },

        confirmEquip(item) {
            const realItem = item._origin || item;
            const success = this.member.equipItem(realItem, this.pickerSlot);
            if (success) {
                this.showPicker = false;
                this.hoverItem = null; // 🟢 修复：点击后立即关闭悬浮窗
                addLog(`装备已更换`);
            }
        },

        unequip(slot) {
            if (this.member.unequipItem(slot)) {
                addLog(`已卸下装备并存入共享仓库`);
            }
        },   
        
        // =========================
        // ⚔️ 队伍管理 (备战/解散)
        // =========================
        
        // 切换出战状态
        toggleDeploy(member, e) {
            e.stopPropagation(); // 防止触发 member-item 的点击选择

            // 初始化属性 (如果是 undefined 默认为 true)
            const currentStatus = member.isDeployed !== false;
            
            // 1. 如果要“休息” (变为 false)
            if (currentStatus) {
                // 检查：至少保留一人
                const activeCount = this.store.party.filter(m => m.isDeployed !== false).length;
                if (activeCount <= 1) {
                    addLog("队伍中至少需要一名成员出战！", "error");
                    return;
                }
                member.isDeployed = false;
            } 
            // 2. 如果要“出战” (变为 true)
            else {
                // 检查：最大人数限制
                const activeCount = this.store.party.filter(m => m.isDeployed !== false).length;
                const max = this.store.config.team?.maxDeployed || 4;
                if (activeCount >= max) {
                    addLog(`出战人数已达上限 (${max}人)，请先让其他队员休息。`, "error");
                    return;
                }
                member.isDeployed = true;
            }
        },

        // 请求解散
        askDismiss(member) {
            // 保护核心角色
            if (member.id === 'player_001' || member.id === 'player_002') {
                addLog("核心角色无法离队。", "error");
                return;
            }
            this.dismissTarget = member;
            this.showDismissConfirm = true;
        },

        // 执行解散
        executeDismiss() {
            if (!this.dismissTarget) return;

            const idx = this.store.party.indexOf(this.dismissTarget);
            if (idx > -1) {
                const name = this.dismissTarget.name;
                // 永久移除
                this.store.party.splice(idx, 1);
                addLog(`${name} 已离开队伍。`, "system");
                
                // 重置选择
                this.selectedMemberIndex = 0;
            }
            this.showDismissConfirm = false;
            this.dismissTarget = null;
        },

        // 切换物品的 LLM 暴露状态
        toggleItemExposure(item) {
            if (!item) return;
            // 切换布尔值
            item.isExposedToLLM = !item.isExposedToLLM;
            
            // 简单的反馈
            const status = item.isExposedToLLM ? "已公开 👁️" : "已隐藏 🙈";
            // 这里直接复用 item 的名字颜色，如果没有则白色
            const color = item.color || '#fff';
            // 使用系统日志通知
            // 注意：addLog 是从外部导入的，可以直接调用
            addLog(`物品 [${item.name}] 设置为: ${status}`, 'system');
        },

        // 请求删除特殊物品
        askDeleteItem(item) {
            this.itemToDelete = item;
            this.showDeleteItemConfirm = true;
        },

        // 执行删除特殊物品
        executeDeleteItem() {
            if (this.itemToDelete) {
                const name = this.itemToDelete.name;
                // 从队长背包移除 (支持传入对象或ID，这里传入对象以确保精确匹配)
                // 注意：这里使用 _origin 确保引用正确，如果没有则使用 item 本身
                const realItem = this.itemToDelete._origin || this.itemToDelete;
                
                if (this.store.party[0].removeItemFromInventory(realItem, 1)) {
                     addLog(`🗑️ 物品 [${name}] 已被丢弃`, 'system');
                } else {
                     addLog(`❌ 删除失败：物品可能已被移除`, 'error');
                }
                
                // 关闭所有相关窗口
                this.showDeleteItemConfirm = false;
                this.showLore = false; // 关闭详情页
                this.itemToDelete = null;
            }
        },

    },
    template: `
    <div class="team-overlay">
        <div class="team-window">
            <button class="team-window-close" @click="close">×</button>

            <div class="member-list">
                <h3 class="side-title">探索编队</h3>
                <div v-for="(m, idx) in store.party" :key="m.id" 
                    class="member-item" 
                    :class="{ 
                        active: selectedMemberIndex === idx, 
                        'is-dead': m.isDead,
                        'undeployed': m.isDeployed === false 
                    }"
                    @click="handleMemberClick(idx)">
                    
                    <div class="m-header-row">
                        <div class="m-name">
                            {{ m.name }} 
                            <span v-if="m.isDead" style="color:#ff4444; font-size:10px;">[倒地]</span>
                        </div>
                        <button class="deploy-toggle" 
                                :class="{ on: m.isDeployed !== false }"
                                @click="toggleDeploy(m, $event)">
                            {{ m.isDeployed !== false ? '出战中' : '休息' }}
                        </button>
                    </div>
                    <div class="m-info">LV.{{ m.level }} {{ m.className || '冒险者' }}</div>
                </div>
            </div>

            <div class="main-content">
                <div class="nav-tabs">
                    <button class="tab-btn" :class="{ active: activeTab === 'status' }" @click="activeTab = 'status'">角色&装备</button>
                    <button class="tab-btn" :class="{ active: activeTab === 'inventory' }" @click="activeTab = 'inventory'">共享仓库</button>
                    <button class="tab-btn" :class="{ active: activeTab === 'special' }" @click="activeTab = 'special'">特殊道具</button>
                    <button class="tab-btn" :class="{ active: activeTab === 'skills' }" @click="activeTab = 'skills'">个人技能</button>
                </div>

                <div class="tab-view-container">
                    
                    <div v-if="activeTab === 'status'" class="tab-pane">
                        <div class="char-header-card" :class="{ 'char-dead': member.isDead }">
                            <div class="header-main">
                                <div class="name-box">
                                    <span class="h-name">{{ member.name }}</span>
                                    <span class="h-sex" :style="{color: member.sex==='male'?'#66ccff':'#ff99cc'}">
                                        {{ member.sex === 'male' ? '♂' : '♀' }}
                                    </span>
                                </div>
                                <div class="header-actions">
                                    <span class="h-level">等级 {{ member.level }}</span>
                                    <button v-if="member.id !== 'player_001' && member.id !== 'player_002'"
                                            class="dismiss-btn-mini" 
                                            @click="askDismiss(member)">
                                        解散
                                    </button>
                                </div>
                            </div>
                            <div class="vitals-bars">
                                <div class="bar-wrap">
                                    <div class="bar-fill hp" :style="{ width: (member.hp/member.maxHp*100)+'%' }"></div>
                                    <span class="bar-text">HP {{ member.hp }}/{{ member.maxHp }}</span>
                                </div>
                                <div class="bar-wrap">
                                    <div class="bar-fill mp" :style="{ width: (member.mp/member.maxMp*100)+'%' }"></div>
                                    <span class="bar-text">MP {{ member.mp }}/{{ member.maxMp }}</span>
                                </div>
                            </div>
                        </div>

                        <div class="attribute-grid">
                            <div v-for="s in displayStats" class="attr-item">
                                <span class="attr-label">{{ s.label }}</span>
                                <span class="attr-val" :style="{ color: s.color || '#fff' }">{{ s.val }}</span>
                            </div>
                        </div>

                        <div class="equip-section-title">当前装备</div>
                        <div class="equip-section">
                            <div class="equip-row" @click="openEquipPicker('weapon')">
                                <span class="e-icon">⚔️</span>
                                <div class="e-info">
                                    <div class="e-label">主武器</div>
                                    <div class="e-name" :style="{ color: getEquipColor(member.equipment.weapon) }">
                                        {{ resolveEquip(member.equipment.weapon)?.name || '未装备' }}
                                    </div>
                                </div>
                                <span class="e-arrow">⇄</span>
                            </div>
                            
                            <div class="equip-row" @click="openEquipPicker('head')">
                                <span class="e-icon">🪖</span>
                                <div class="e-info"><div class="e-label">头部</div><div class="e-name" :style="{ color: getEquipColor(member.equipment.head) }">{{ resolveEquip(member.equipment.head)?.name || '未装备' }}</div></div><span class="e-arrow">⇄</span>
                            </div>
                            <div class="equip-row" @click="openEquipPicker('chest')">
                                <span class="e-icon">🛡️</span>
                                <div class="e-info"><div class="e-label">身体</div><div class="e-name" :style="{ color: getEquipColor(member.equipment.chest) }">{{ resolveEquip(member.equipment.chest)?.name || '未装备' }}</div></div><span class="e-arrow">⇄</span>
                            </div>
                            <div class="equip-row" @click="openEquipPicker('hands')">
                                <span class="e-icon">🧤</span>
                                <div class="e-info"><div class="e-label">手部</div><div class="e-name" :style="{ color: getEquipColor(member.equipment.hands) }">{{ resolveEquip(member.equipment.hands)?.name || '未装备' }}</div></div><span class="e-arrow">⇄</span>
                            </div>
                            <div class="equip-row" @click="openEquipPicker('legs')">
                                <span class="e-icon">🦵</span>
                                <div class="e-info"><div class="e-label">腿部</div><div class="e-name" :style="{ color: getEquipColor(member.equipment.legs) }">{{ resolveEquip(member.equipment.legs)?.name || '未装备' }}</div></div><span class="e-arrow">⇄</span>
                            </div>
                            <div class="equip-row" @click="openEquipPicker('boots')">
                                <span class="e-icon">👢</span>
                                <div class="e-info"><div class="e-label">脚部</div><div class="e-name" :style="{ color: getEquipColor(member.equipment.boots) }">{{ resolveEquip(member.equipment.boots)?.name || '未装备' }}</div></div><span class="e-arrow">⇄</span>
                            </div>

                            <div class="equip-row" @click="openEquipPicker('accessory_1')">
                                <span class="e-icon">💍</span>
                                <div class="e-info">
                                    <div class="e-label">饰品</div>
                                    <div class="e-name" :style="{ color: getEquipColor(member.equipment.accessory_1) }">
                                        {{ resolveEquip(member.equipment.accessory_1)?.name || '未装备' }}
                                    </div>
                                </div>
                                <span class="e-arrow">⇄</span>
                            </div>
                        </div>
                    </div>

                    <div v-if="activeTab === 'inventory'" class="tab-pane">
                        <h4 class="pane-title">物资箱 (消耗品)</h4>
                        <div class="inventory-grid">
                            <div v-if="consumableList.length === 0" class="empty-hint">没有消耗品</div>
                            <div v-for="item in consumableList" :key="item.id" class="item-card-mini" @click="askUseItem(item)">
                                <div class="i-top">
                                    <span class="i-name" :style="{ color: item.color }">{{ item.name }}</span>
                                    <span class="i-count">x{{ item.count }}</span>
                                </div>
                                <div class="i-desc">{{ item.desc || item.description }}</div>
                            </div>
                        </div>
                    </div>

                    <div v-if="activeTab === 'special'" class="tab-pane">
                        <h4 class="pane-title">特殊物品 (技能书/纪念品)</h4>
                        <div class="inventory-grid">
                            <div v-if="specialList.length === 0" class="empty-hint">没有特殊道具</div>
                            <div v-for="item in specialList" :key="item.id" class="item-card-mini" 
                                 :style="{ borderColor: item.color || '#aaa' }"
                                 @click="askUseItem(item)"
                                 @mouseenter="onHoverItem(item, $event)"
                                 @mousemove="updateHoverPos($event)"
                                 @mouseleave="onLeaveItem">
                                <div class="i-top">
                                    <span class="i-name" :style="{ color: item.color }">{{ item.name }}</span>
                                    <span class="i-count">x{{ item.count }}</span>
                                </div>
                                <div class="i-desc" style="color: #ddd; font-style: italic;">
                                    {{ item.effect_type === 'LEARN_SKILL' ? '📖 点击阅读' : '👁️ 点击查看' }}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="activeTab === 'skills'" class="tab-pane">
                        <h4 class="pane-title">已习得奥义</h4>
                        <div class="skills-grid">
                            <div v-for="sk in memberSkills" :key="sk.id" class="skill-card-v2">
                                <div class="sk-header">
                                    <span class="sk-name">{{ sk.name }}</span>
                                    <span class="sk-element" :class="sk.element">{{ sk.element }}</span>
                                </div>
                                <div class="sk-body">{{ sk.desc }}</div>
                                <div class="sk-footer">MP 消耗: {{ sk.cost.mp }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="showPicker" class="modal-mask">
            <div class="picker-window">
                <div class="modal-head">更换装备: {{ pickerSlot }}</div>
                <div class="picker-body">
                    <div v-if="pickerItems.length === 0" class="empty-hint">仓库中没有此类可用装备</div>
                    <div v-for="item in pickerItems" :key="item.id" class="picker-row" 
                         @click="confirmEquip(item)"
                         @mouseenter="onHoverItem(item, $event)"
                         @mousemove="updateHoverPos($event)"
                         @mouseleave="onLeaveItem">
                        <span :style="{color: item.color}">{{ item.name }}</span>
                        <span class="p-stats">{{ getStatsString(item) }}</span>
                    </div>
                </div>
                <div class="modal-foot">
                    <button class="rpg-btn small danger" @click="unequip(pickerSlot); showPicker=false">卸下</button>
                    <button class="rpg-btn small" @click="showPicker=false">取消</button>
                </div>
            </div>
        </div>

        <div v-if="showConfirm" class="modal-mask">
            <div class="confirm-window">
                <div class="modal-head">物品使用</div>
                <div class="confirm-body">
                    <template v-if="confirmItem && confirmItem.effect_type === 'LEARN_SKILL'">
                        要让 <span :style="{color: member.isDead ? '#ff4444' : 'var(--mana-blue)'}">{{ member.name }}</span> 研读 <br>
                        <span :style="{color: confirmItem.color, fontSize:'1.2em'}">{{ confirmItem.name }}</span> 吗？<br>
                        <span style="font-size: 0.8em; color: #888; margin-top: 5px; display: block;">( 研读后书籍将消失，并将习得其中记载的奥义 )</span>
                        
                        <div class="exposure-control" 
                             style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #444; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;"
                             @click="toggleItemExposure(confirmItem)">
                            <div class="checkbox-mock" 
                                 :style="{
                                     width: '16px', height: '16px', 
                                     border: '1px solid #888', 
                                     background: confirmItem.isExposedToLLM ? '#66ccff' : 'transparent',
                                     boxShadow: confirmItem.isExposedToLLM ? '0 0 5px #66ccff' : 'none'
                                 }">
                            </div>
                            <span :style="{color: confirmItem.isExposedToLLM ? '#fff' : '#888'}">
                                {{ confirmItem.isExposedToLLM ? '已向 LLM 展示该物品' : '已对 LLM 隐藏该物品' }}
                            </span>
                        </div>
                    </template>

                    <template v-else-if="confirmItem">
                        确认对 <span :style="{color: member.isDead ? '#ff4444' : 'var(--mana-blue)'}">{{ member.name }}</span> 使用 <br>
                        <span :style="{color: confirmItem.color, fontSize:'1.2em'}">{{ confirmItem.name }}</span> 吗？
                    </template>
                </div>
                <div class="modal-foot">
                    <button class="rpg-btn small" @click="executeUseItem">确定</button>
                    <button class="rpg-btn small danger" @click="showConfirm = false">取消</button>
                </div>
            </div>
        </div>

        <div v-if="showLore" class="modal-mask" @click.self="showLore=false">
            <div class="confirm-window" style="max-width: 500px;">
                <div class="modal-head" style="display: flex; justify-content: space-between; align-items: center;">
                    <span :style="{color: loreItem?.color}">{{ loreItem?.name }}</span>
                    <button class="delete-btn-mini" 
                            style="background: transparent; border: none; color: #ff4444; font-size: 1.2em; cursor: pointer; padding: 0 5px;"
                            @click="askDeleteItem(loreItem)" 
                            title="丢弃此物品">
                        🗑️
                    </button>
                </div>
                <div class="confirm-body">
                    <div style="margin-bottom:15px; font-style: italic; color:#aaa; font-size: 0.9em;">
                        {{ loreItem?.type_desc || '特殊物品' }}
                    </div>
                    <div style="line-height: 1.6; text-align: left; padding: 0 10px; white-space: pre-wrap; margin-bottom: 20px;">{{ loreItem?.description }}</div>
                    
                    <div class="exposure-control" 
                         style="padding: 10px; background: rgba(0,0,0,0.3); border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;"
                         @click="toggleItemExposure(loreItem)">
                        <div class="checkbox-mock" 
                                :style="{
                                    width: '16px', height: '16px', 
                                    border: '1px solid #888', 
                                    background: loreItem?.isExposedToLLM ? '#66ccff' : 'transparent',
                                    boxShadow: loreItem?.isExposedToLLM ? '0 0 5px #66ccff' : 'none'
                                }">
                        </div>
                        <span :style="{color: loreItem?.isExposedToLLM ? '#fff' : '#888', fontSize: '0.9em'}">
                            {{ loreItem?.isExposedToLLM ? '允许 LLM 感知此物品' : '禁止 LLM 感知此物品' }}
                        </span>
                    </div>
                </div>
                <div class="modal-foot">
                    <button class="rpg-btn small" @click="showLore = false">关闭</button>
                </div>
            </div>
        </div>

        <div v-if="hoverItem" class="global-tooltip" :style="{ top: hoverPos.y + 'px', left: hoverPos.x + 'px' }">
            <div class="t-header" :style="{ color: hoverItem.color || '#fff' }">
                {{ hoverItem.name }}
            </div>
            <div class="t-sub" v-if="hoverItem.type_desc || hoverItem.type">
                {{ hoverItem.type_desc || (hoverItem.stats ? '装备' : '物品') }}
            </div>
            <div class="t-body">
                {{ hoverItem.desc || hoverItem.description || '暂无描述' }}
            </div>

            <div v-if="hoverItem.effect_type === 'LEARN_SKILL' && hoverItem.skillPayload" class="t-skill-preview">
                <div class="tsp-line"></div> <div class="tsp-title">
                    <span class="tsp-label">蕴含奥义：</span>
                    <span class="tsp-name">{{ hoverItem.skillPayload.name }}</span>
                </div>
                
                <div class="tsp-meta">
                    <span class="sk-element small" :class="hoverItem.skillPayload.element">
                        {{ getElementName(hoverItem.skillPayload.element) }}
                    </span>
                    <span v-if="hoverItem.skillPayload.cost && hoverItem.skillPayload.cost.mp" class="tsp-cost">
                        MP: {{ hoverItem.skillPayload.cost.mp }}
                    </span>
                </div>

                <div class="tsp-desc">
                    {{ hoverItem.skillPayload.description }}
                </div>
            </div>
        </div>
        
        <div v-if="showDismissConfirm" class="modal-mask">
            <div class="confirm-window">
                <div class="modal-head" style="background:#8b0000; color:#fff;">危险操作</div>
                <div class="confirm-body">
                    确认要解散队友 <span style="color:var(--mana-blue); font-size:1.2em;">{{ dismissTarget?.name }}</span> 吗？<br><br>
                    <span style="color:#ff4444; font-size:0.9em;">
                        注意：该操作不可逆！<br>
                        角色身上的装备和道具将直接销毁，不会返回仓库。
                    </span>
                </div>
                <div class="modal-foot">
                    <button class="rpg-btn small danger" @click="executeDismiss">确认解散</button>
                    <button class="rpg-btn small" @click="showDismissConfirm = false">取消</button>
                </div>
            </div>
        </div>

        <div v-if="showObjEditor" class="modal-mask" @click.self="showObjEditor=false">
            <div class="confirm-window profile-editor-window" style="width: 650px;">
                <div class="modal-head">重塑自我 (Edit Profile)</div>
                
                <div class="profile-editor-body" style="padding: 20px; text-align: left;">
                    
                    <div class="pe-section" style="margin-bottom: 20px;">
                        <div class="pe-label" style="color: #66ccff; margin-bottom: 8px; font-weight: bold;">
                            🌀 身份与背景 (Identity)
                        </div>
                        <textarea 
                            class="obj-textarea pe-textarea-identity" 
                            v-model="editIdentityText" 
                            placeholder="描述你的过去、性格底色，以及你在这个世界中的公开身份..."
                            style="height: 120px; width: 100%; font-size: 0.9em;">
                        </textarea>
                    </div>

                    <div class="pe-section">
                        <div class="pe-label" style="color: #d4af37; margin-bottom: 8px; font-weight: bold;">
                            🔥 核心驱动力 (Core Objective)
                        </div>
                        <textarea 
                            class="obj-textarea pe-textarea-objective" 
                            v-model="editObjText" 
                            placeholder="你当前最渴望达成什么？这也将指引 LLM 推动剧情..."
                            style="height: 80px; width: 100%; font-size: 0.9em;">
                        </textarea>
                    </div>

                    <div class="obj-hint" style="text-align: center; margin-top: 15px; color: #666; font-size: 0.85em;">
                        * 这些设定将直接写入记忆深处，改变 NPC 对你的态度与剧情走向
                    </div>
                </div>

                <div class="modal-foot">
                    <button class="rpg-btn small" @click="savePlayerProfile">确认重塑</button>
                    <button class="rpg-btn small danger" @click="showObjEditor = false">取消</button>
                </div>
            </div>
        </div>

        <div v-if="showHDetail" class="modal-mask" @click.self="showHDetail=false">
            <div class="modal-h-detail">
                <div class="h-detail-header">
                    <div class="h-detail-title">
                        ❤ {{ hDetailChar?.name }} 的深层档案
                    </div>
                    <div class="h-header-actions" style="display:flex; gap:10px; align-items:center;">
                        <button class="rpg-btn small" 
                                style="padding: 4px 12px; font-size: 0.9em; background: rgba(0, 0, 0, 0.5); border: 1px solid #44aadd; color: #44aadd;"
                                @click="openHEditor">
                            📝 编辑 H 阶段
                        </button>
                        <button class="team-window-close" style="position:static" @click="showHDetail=false">×</button>
                    </div>
                </div>
                
                <div class="h-detail-body" v-if="hDetailChar">
                    
                    <div class="h-section">
                        <div class="h-section-title" style="border-left-color: #44aadd; color: #44aadd; background: rgba(68, 170, 221, 0.05);">
                            📋 个人档案 (Profile)
                        </div>
                        
                        <div class="profile-text-grid">
                            <div class="p-row">
                                <span class="p-label">🕵️ 身份背景</span>
                                <div class="p-content">{{ hDetailChar.identity || hDetailChar.background || '暂无详细设定' }}</div>
                            </div>
                            <div class="p-row">
                                <span class="p-label">👁️ 外貌特征</span>
                                <div class="p-content">{{ hDetailChar.appearance || hDetailChar.desc || '暂无描述' }}</div>
                            </div>
                            <div class="p-row">
                                <span class="p-label">🧠 性格倾向</span>
                                <div class="p-content">{{ hDetailChar.character || hDetailChar.personality || '暂无描述' }}</div>
                            </div>
                            <div class="p-row">
                                <span class="p-label">🎯 核心目标</span>
                                <div class="p-content" style="color: #d4af37;">{{ hDetailChar.core_objective || '暂无特定目标' }}</div>
                            </div>
                        </div>
                    </div>

                    <template v-if="hDetailChar.sex === 'female' && hDetailChar.hStatus">
                        
                        <div class="h-section">
                            <div class="h-section-title">基础概况</div>
                            <div class="h-parts-grid">
                                <div class="h-stat-row">
                                    <div class="h-stat-header">
                                        <span class="h-stat-label">贞洁状态</span>
                                        <span class="h-stat-val" :style="{color: hDetailChar.hStatus.isVirgin ? '#66ff66' : '#ff99cc'}">
                                            {{ hDetailChar.hStatus.isVirgin ? '处女' : '非处' }}
                                        </span>
                                    </div>
                                </div>
                                <div class="h-stat-row">
                                    <div class="h-stat-header">
                                        <span class="h-stat-label">性经历次数</span>
                                        <span class="h-stat-val">{{ hDetailChar.hStatus.sexCount }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="h-section">
                            <div class="h-section-title">心理状态 (Long Term)</div>
                            <div class="h-stat-row">
                                <div class="h-stat-header">
                                    <span class="h-stat-label">好感度 (Affection)</span>
                                    <span class="h-stat-val" style="color: #ff6666">{{ hDetailChar.hStatus.affection }}</span>
                                </div>
                                <div class="h-stat-desc">
                                    {{ getHDesc('LONG_TERM', 'AFFECTION', hDetailChar.hStatus.affection) }}
                                </div>
                            </div>

                            <div class="h-stat-row">
                                <div class="h-stat-header">
                                    <span class="h-stat-label">堕落度 (Depravity)</span>
                                    <span class="h-stat-val" style="color: #aa66cc">{{ hDetailChar.hStatus.depravity }}</span>
                                </div>
                                <div class="h-stat-desc">
                                    {{ getHDesc('LONG_TERM', 'DEPRAVITY', hDetailChar.hStatus.depravity) }}
                                </div>
                            </div>
                        </div>

                        <div class="h-section">
                            <div class="h-section-title">身体开发记录 (Body Parts)</div>
                            <div class="h-parts-grid">
                                <div v-for="(val, key) in hDetailChar.hStatus.parts" :key="key" class="h-stat-row">
                                    <div class="h-stat-header">
                                        <span class="h-stat-label">{{ partNames[key] || key }}</span>
                                        <span class="h-stat-val" :style="{color: val > 100 ? '#ff99cc' : '#fff'}">Lv.{{ Math.floor(val/10) }} ({{val}})</span>
                                    </div>
                                    <div class="h-stat-desc">
                                        {{ getHDesc('LONG_TERM', 'PARTS', val) }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                    
                </div>
            </div>
        </div>

        <div v-if="showDeleteItemConfirm" class="modal-mask" style="z-index: 9999;">
            <div class="confirm-window">
                <div class="modal-head" style="background:#8b0000; color:#fff;">丢弃物品</div>
                <div class="confirm-body">
                    确认要丢弃 <span :style="{color: itemToDelete?.color || '#fff', fontSize:'1.2em'}">{{ itemToDelete?.name }}</span> 吗？<br><br>
                    <span style="color:#ff4444; font-size:0.9em;">
                        注意：丢弃后该物品将永久消失！<br>
                        (也不会再向 LLM 发送相关信息)
                    </span>
                </div>
                <div class="modal-foot">
                    <button class="rpg-btn small danger" @click="executeDeleteItem">确认丢弃</button>
                    <button class="rpg-btn small" @click="showDeleteItemConfirm = false">取消</button>
                </div>
            </div>
        </div>

    </div>
    `
};