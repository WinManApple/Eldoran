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

// src/ui/HStateOverlay.js
import { store, addLog } from './modules/store.js';
import { H_State_Memory } from '../LLM/memory/H_State_Memory.js';

export const HStateOverlay = {
    name: 'HStateOverlay',
    data() {
        return {
            store,
            targetId: null,      // 当前编辑的角色ID
            originalRef: null,   // 内存中的原始引用 (用于保存)
            localCopy: null,     // 本地深拷贝副本 (用于编辑)
            
            // 导航状态
            activeTab: 'Long_Term', // 'Long_Term' | 'Short_Term' | 'Sexuality'
            activeSubTab: '',       // 'AFFECTION', 'STAMINA' 等 (根据 activeTab 动态变化)
            
            // UI 交互状态
            newTagInput: '',        // 性癖标签输入框
            showResetConfirm: false // 重置确认提示
        };
    },
    computed: {
        // 获取当前主标签下的子分类列表
        currentSubTabs() {
            if (!this.localCopy || !this.activeTab) return [];
            if (this.activeTab === 'Sexuality') return [];
            
            // 从 localCopy 中读取键名 (如 AFFECTION, DEPRAVITY)
            return Object.keys(this.localCopy[this.activeTab] || {});
        },
        
        // 获取当前选中的规则列表
        currentRules() {
            if (!this.localCopy || this.activeTab === 'Sexuality') return [];
            return this.localCopy[this.activeTab][this.activeSubTab] || [];
        },

        // 获取目标角色的名字 (用于标题)
        targetName() {
            const char = this.store.party.find(m => m.id === this.targetId);
            return char ? char.name : this.targetId;
        }
    },
    mounted() {
        // 1. 获取目标 ID
        this.targetId = this.store.tempEditorTargetId;
        
        if (!this.targetId) {
            addLog("[System] 未指定编辑目标，正在退出...", "error");
            this.close();
            return;
        }

        // 2. 初始化数据
        this.initData();
    },
    methods: {
        initData() {
            // 确保内存已初始化
            H_State_Memory.initForCharacter(this.targetId);
            
            // 获取原始引用 (Object 类型)
            this.originalRef = H_State_Memory.getCharacterRules(this.targetId);
            
            if (!this.originalRef) {
                addLog("[System] 读取 H 记忆失败", "error");
                this.close();
                return;
            }

            // 深拷贝一份到本地供编辑
            this.localCopy = JSON.parse(JSON.stringify(this.originalRef));
            
            // 初始化选中的子标签
            this.updateSubTabDefault();
        },

        // 切换主标签时，自动选中第一个子标签
        switchTab(tab) {
            this.activeTab = tab;
            this.updateSubTabDefault();
        },

        updateSubTabDefault() {
            const subs = this.currentSubTabs;
            if (subs.length > 0) {
                this.activeSubTab = subs[0];
            } else {
                this.activeSubTab = '';
            }
        },

        // -----------------------
        // 规则编辑逻辑 (Long/Short Term)
        // -----------------------
        
        // 添加新规则
        addRule() {
            if (!this.currentRules) return;
            // 插入一个默认空规则
            this.currentRules.push({
                max: 999,
                text: "[新阶段] 请输入描述..."
            });
            // 滚动到底部 (可选优化)
        },

        // 删除规则
        removeRule(index) {
            this.currentRules.splice(index, 1);
        },

        // -----------------------
        // 性癖编辑逻辑 (Sexuality)
        // -----------------------
        
        addTag() {
            const tag = this.newTagInput.trim();
            if (!tag) return;
            
            if (!this.localCopy.Sexuality.includes(tag)) {
                this.localCopy.Sexuality.push(tag);
                this.newTagInput = '';
            } else {
                addLog("该标签已存在", "warning");
            }
        },

        removeTag(index) {
            this.localCopy.Sexuality.splice(index, 1);
        },

        // -----------------------
        // 核心事务逻辑
        // -----------------------

        // 重置：重新深拷贝
        handleReset() {
            if (confirm("确定要丢弃所有未保存的修改并重置吗？")) {
                this.localCopy = JSON.parse(JSON.stringify(this.originalRef));
                this.updateSubTabDefault();
                addLog("已重置编辑内容", "system");
            }
        },

        // 保存：将 localCopy 写回 originalRef (内存)
        handleSave() {
            if (!this.originalRef || !this.localCopy) return;

            // 1. 数据清洗：确保规则按 max 升序排列
            ['Long_Term', 'Short_Term'].forEach(term => {
                const categories = this.localCopy[term];
                for (const catKey in categories) {
                    // 转换数值并排序
                    categories[catKey].forEach(r => r.max = Number(r.max));
                    categories[catKey].sort((a, b) => a.max - b.max);
                }
            });

            // 2. 利用对象引用特性，直接更新内存
            // H_State_Memory 中的 _hStateMemory[id] 指向 originalRef
            // 我们修改 originalRef 的属性即可同步更新
            this.originalRef.Long_Term = this.localCopy.Long_Term;
            this.originalRef.Short_Term = this.localCopy.Short_Term;
            this.originalRef.Sexuality = this.localCopy.Sexuality;

            addLog(`✅ ${this.targetName} 的 H 阶段档案已更新`, "system");
            
            // 3. 关闭
            this.close();
        },

        close() {
            this.$emit('close');
        }
    },
    template: `
    <div class="hse-mask" @click.self="close">
        <div class="hse-window">
            
            <div class="hse-header">
                <div class="hse-title">
                    <span class="hse-icon">🧬</span> 
                    H 阶段编辑器: <span class="hse-char-name">{{ targetName }}</span>
                </div>
                <button class="hse-close-btn" @click="close">×</button>
            </div>

            <div class="hse-body" v-if="localCopy">
                
                <div class="hse-sidebar">
                    <div class="hse-nav-group">
                        <button class="hse-nav-item main" 
                                :class="{ active: activeTab === 'Long_Term' }"
                                @click="switchTab('Long_Term')">
                            长期属性 (Long Term)
                        </button>
                        <button class="hse-nav-item main" 
                                :class="{ active: activeTab === 'Short_Term' }"
                                @click="switchTab('Short_Term')">
                            短期状态 (Short Term)
                        </button>
                        <button class="hse-nav-item main" 
                                :class="{ active: activeTab === 'Sexuality' }"
                                @click="switchTab('Sexuality')">
                            性癖与标签 (Sexuality)
                        </button>
                    </div>

                    <div class="hse-divider"></div>

                    <div class="hse-nav-group sub" v-if="activeTab !== 'Sexuality'">
                        <div class="hse-sub-label">属性类别</div>
                        <button v-for="key in currentSubTabs" :key="key"
                                class="hse-nav-item sub"
                                :class="{ active: activeSubTab === key }"
                                @click="activeSubTab = key">
                            {{ key }}
                        </button>
                    </div>
                </div>

                <div class="hse-content">
                    
                    <template v-if="activeTab !== 'Sexuality'">
                        <div class="hse-content-header">
                            <span class="hse-section-title">{{ activeSubTab }} 阶段规则</span>
                            <span class="hse-hint">* 数值代表“小于此值时生效”，请按升序排列</span>
                        </div>

                        <div class="hse-rules-list">
                            <div v-for="(rule, idx) in currentRules" :key="idx" class="hse-rule-card">
                                <div class="hse-rule-top">
                                    <div class="hse-input-group">
                                        <label>阈值 &lt;</label>
                                        <input type="number" v-model.number="rule.max" class="hse-num-input">
                                    </div>
                                    <button class="hse-del-btn" @click="removeRule(idx)" title="删除此阶段">🗑️</button>
                                </div>
                                <textarea v-model="rule.text" class="hse-text-input" placeholder="输入该阶段的角色表现、心理描写..."></textarea>
                            </div>
                            
                            <button class="hse-add-btn" @click="addRule">+ 新增阶段</button>
                        </div>
                    </template>

                    <template v-else>
                        <div class="hse-content-header">
                            <span class="hse-section-title">性癖 / 特性标签</span>
                        </div>
                        
                        <div class="hse-tags-container">
                            <div v-for="(tag, idx) in localCopy.Sexuality" :key="idx" class="hse-tag">
                                {{ tag }}
                                <span class="hse-tag-remove" @click="removeTag(idx)">×</span>
                            </div>
                            <div v-if="localCopy.Sexuality.length === 0" class="hse-empty-hint">暂无标签</div>
                        </div>

                        <div class="hse-tag-input-area">
                            <input type="text" v-model="newTagInput" 
                                   class="hse-line-input" 
                                   placeholder="输入新标签 (如: M属性, 喜欢粗口)..."
                                   @keyup.enter="addTag">
                            <button class="hse-btn small" @click="addTag">添加</button>
                        </div>
                    </template>

                </div>
            </div>

            <div class="hse-footer">
                <button class="hse-btn danger-ghost" @click="handleReset">↺ 重置更改</button>
                <div class="hse-footer-right">
                    <button class="hse-btn secondary" @click="close">取消</button>
                    <button class="hse-btn primary" @click="handleSave">确认保存</button>
                </div>
            </div>
        </div>
    </div>
    `
};