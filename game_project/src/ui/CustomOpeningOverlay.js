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

// src/ui/CustomOpeningOverlay.js
import { ref, reactive, computed, watch, onUnmounted } from '../../lib/vue.esm-browser.js';
import { store, DIFFICULTY_PRESETS } from './modules/store.js';
import { Game_Manager } from '../LLM/Game_Manager.js'; 
import { Call_Custom_Opening } from '../LLM/calls/Call_Custom_Opening.js'; 

export default {
    name: 'CustomOpeningOverlay',
    emits: ['start-game', 'back-to-title'],
    setup(props, { emit }) {

        // ==========================================
        // 0. 常量定义 (点数法则)
        // ==========================================
        // 点数配置表 (索引对应 store.js 中的 DIFFICULTY_PRESETS)
        // 🟢 [模块化改造] 点数档位配置表
        // 以后若要添加新档位，直接在此数组追加对象即可
        const POINT_PRESETS = [
            { label: "挑战自我", value: 10,  desc: "几乎一无所有" },
            { label: "有点难度", value: 50,  desc: "资源匮乏" },
            { label: "一般",     value: 100, desc: "精打细算" },
            { label: "普通",     value: 150, desc: "标准开局" },
            { label: "简单",     value: 200, desc: "宽裕的行囊" },
            { label: "爽文",     value: 300, desc: "赢在起跑线" }
        ];

        // 定义默认索引 (对应 "普通" - 150点)
        // 数组索引是从 0 开始的，所以 150点 是第 3 个 (index 3)
        const DEFAULT_POINT_IDX = 3;

        const RATES = {
            GOLD: 20,      // 1点 = 20金币
            ITEMS: 1,        // 10点 = 1个物品 (逻辑上) -> 这里定义 COST 更清晰
            COMPANIONS: 1    // 50点 = 1个伴侣
        };
        const COSTS = {
            GOLD: 1,        // 1点
            ITEMS: 10,       // 10点
            COMPANIONS: 50   // 50点
        };

        // ==========================================
        // 1. 视图状态管理
        // ==========================================
        // 'EDIT' (编辑输入) | 'LOADING' (生成中) | 'PREVIEW' (结果确认)
        const viewMode = ref('EDIT'); 
        
        // 错误提示信息
        const errorMessage = ref("");

        //  物品预览 Tooltip 状态
        const showItemTooltip = ref(false);

        // ==========================================
        // 🟢 [新增] 模板导入/导出系统
        // ==========================================
        const fileInput = ref(null); // 绑定隐藏的 input 元素

        // 导出功能
        const handleExportTemplate = () => {
            try {
                // 1. 构造导出数据包 (添加版本元数据)
                const exportData = {
                    meta: {
                        version: store.config.game_version,
                        timestamp: Date.now(),
                        game: "Eldoran"
                    },
                    // 深拷贝 formData 防止引用问题
                    data: JSON.parse(JSON.stringify(formData))
                };

                // 2. 创建 Blob 并下载
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                // 文件名: Template_玩家名_时间戳.json
                a.download = `Template_${formData.playerName || 'New'}_${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                
                // 3. 清理
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                // 可选: 提示用户
                // addLog("✅ 模板已导出"); (如果引入了 addLog)
            } catch (e) {
                console.error("导出失败:", e);
                errorMessage.value = "导出失败: " + e.message;
            }
        };

        // 触发导入 (点击隐藏的 input)
        const handleImportClick = () => {
            if (fileInput.value) {
                fileInput.value.click();
            }
        };

        // 处理文件选择
        const handleFileChange = (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    
                    // 简单的格式校验
                    if (!json.data || !json.meta) {
                        throw new Error("无效的模板文件结构");
                    }

                    console.log("[CustomOpening] 正在导入模板...", json.data);

                    // 1. 覆盖基础数据
                    // 使用 Object.assign 能够保留响应式特性
                    // 注意：直接 assign 会触发 watcher (尤其是 allocations 变化)
                    Object.assign(formData, json.data);

                    // 2. [关键] 强制覆盖伴侣列表
                    // 此时 watcher 可能已经运行并用空对象填充了数组，我们需要用导入的真实数据覆盖它
                    if (Array.isArray(json.data.companionDetails)) {
                        formData.companionDetails = JSON.parse(JSON.stringify(json.data.companionDetails));
                    }

                    // 3. 重置 input (允许重复选择同一文件)
                    event.target.value = '';
                    
                    // 提示
                    errorMessage.value = ""; // 清除之前的错误
                    alert(`✅ 模板 "${formData.playerName}" 读取成功！`);

                } catch (err) {
                    console.error("导入失败:", err);
                    errorMessage.value = "导入失败: 文件损坏或格式不符";
                }
            };
            reader.readAsText(file);
        };

        // ==========================================
        // 2. 表单数据 (用户输入)
        // ==========================================
        const formData = reactive({
            // --- 必填项 ---
            playerName: "(必填))", 
            
            // --- 可选项 (主角) ---
            playerIdentity: "",    // 身份 (如: 赛博黑客)

            // 详细设定
            playerAppearance: "",  // 外貌
            playerPersonality: "", // 性格
            playerObjective: "",   // 核心驱动
            
            // 初始点数档位索引 (独立于难度)
            pointPresetIdx: DEFAULT_POINT_IDX,

            // --- 可选项 (世界) ---
            difficultyIdx: 2,      // 默认普通
            worldStyle: "",        // 世界风格备注


            //  伴侣详细设定数组
            companionDetails: [],

            //  资源分配 (投入的点数)
            allocations: {
                gold: 0,        // 投入金币的点数
                items: 0,       // 投入物品的点数
                companions: 0   // 投入伴侣的点数 (默认0，方案A)
            }

        });

        // ==========================================
        // 3. 生成结果数据 (暂存区)
        // ==========================================
        // 存储 LLM (或桩函数) 返回的完整结构化数据
        const generatedResult = ref(null);

        // ==========================================
        // 3.5 点数计算系统 (Point Buy Logic)
        // ==========================================
        
        // 🟢 [修改] 基于配置数组获取当前总点数
        const currentPointConfig = computed(() => {
            // 防御性编程：确保索引不越界，越界则回退到默认
            const idx = formData.pointPresetIdx;
            return POINT_PRESETS[idx] || POINT_PRESETS[DEFAULT_POINT_IDX];
        });

        const totalPoints = computed(() => currentPointConfig.value.value);

        // 🟢 [修改] 监听“点数档位”变化，重置分配
        // 注意：现在切换难度不会重置点数了，只有切换点数档位才会重置
        watch(() => formData.pointPresetIdx, (newVal, oldVal) => {
            if (newVal !== oldVal) {
                formData.allocations.gold = 0;
                formData.allocations.items = 0;
                formData.allocations.companions = 0;
            }
        });

        // 计算已用点数
        const usedPoints = computed(() => {
            return formData.allocations.gold + 
                   formData.allocations.items + 
                   formData.allocations.companions;
        });

        // 计算剩余点数
        const remainingPoints = computed(() => totalPoints.value - usedPoints.value);

        // 计算期望获得的资源量
        const expectedResources = computed(() => {
            return {
                gold: formData.allocations.gold * RATES.GOLD,
                // 🟢 [修改] 这里的除数引用也要同步更新为 COSTS.ITEMS / COSTS.COMPANIONS
                itemCount: Math.floor(formData.allocations.items / COSTS.ITEMS),
                companionCount: Math.floor(formData.allocations.companions / COSTS.COMPANIONS)
            };
        });

        // 🟢 [新增] 监听伴侣数量变化，动态调整输入框数组
        watch(() => expectedResources.value.companionCount, (newCount) => {
            const currentLen = formData.companionDetails.length;
            
            if (newCount > currentLen) {
                for (let i = 0; i < newCount - currentLen; i++) {
                    // 🟢 [优化] 初始化更详细的字段结构
                    formData.companionDetails.push({ 
                        name: "", 
                        identity: "",   // 身份
                        appearance: "", // 外貌
                        character: ""   // 性格
                    });
                }
            } 
            else if (newCount < currentLen) {
                formData.companionDetails.splice(newCount);
            }
        }, { immediate: true });

        // 调整点数分配
        // type: 'gold' | 'items' | 'companions'
        // delta: +1/-1 (对于 items 实际是 +/-10点，companions 是 +/-50点)
        const adjustAllocation = (type, direction) => {
            const cost = COSTS[type.toUpperCase()] || 1;
            const currentPoints = formData.allocations[type];
            
            // 增加投入
            if (direction > 0) {
                // 检查剩余点数是否足够
                if (remainingPoints.value >= cost) {
                    formData.allocations[type] += cost;
                }
            } 
            // 减少投入
            else {
                if (currentPoints >= cost) {
                    formData.allocations[type] -= cost;
                }
            }
        };

        // 计算当前选中的难度信息
        const currentDiffInfo = computed(() => {
            return DIFFICULTY_PRESETS[formData.difficultyIdx] || DIFFICULTY_PRESETS[2];
        });

        // ==========================================
        // 4. 交互逻辑
        // ==========================================

        // 切换难度
        const cycleDiff = (delta) => {
            const newIdx = formData.difficultyIdx + delta;
            if (newIdx >= 1 && newIdx < DIFFICULTY_PRESETS.length) {
                formData.difficultyIdx = newIdx;
            }
        };

        // 🟢 [新增] 切换初始点数档位
        const cyclePoints = (delta) => {
            const newIdx = formData.pointPresetIdx + delta;
            // 边界检查：确保在 POINT_PRESETS 数组范围内
            if (newIdx >= 0 && newIdx < POINT_PRESETS.length) {
                formData.pointPresetIdx = newIdx;
            }
        };

        // ==========================================
        //  监听 LLM 生成结果
        // ==========================================
        // 当 store.tempOpeningResult 有值时，说明生成成功
        const stopResultWatch = watch(() => store.tempOpeningResult, (newVal) => {
            if (newVal && viewMode.value === 'LOADING') {
                console.log("[CustomOpeningOverlay] 捕获到生成结果:", newVal);
                
                // 1. 将结果赋值给本地状态
                generatedResult.value = newVal;
                
                // 2. 切换视图到预览
                viewMode.value = 'PREVIEW';
                
                // 3. 消费掉 store 中的临时数据 (防止重复触发)
                store.tempOpeningResult = null;
            }
        });
        
        // 组件销毁时清理 watcher (可选，但在 Vue3 中通常自动处理)
        onUnmounted(() => {
            stopResultWatch();
        });

        // --- 核心流程：初始化 (接入 LLM) ---
        const handleInitialize = async () => {
            if (!formData.playerName.trim()) {
                errorMessage.value = "必须输入【契约者真名】才能缔结连接。";
                return;
            }
            errorMessage.value = "";
            viewMode.value = 'LOADING';
            
            // 🟢 [新增] 确保清理旧数据
            store.tempOpeningResult = null;
            
            try {

                // 🔴 [核心修复]：手动合并 expectedResources
                // computed 属性 (.value) 必须手动解包传给普通 JS 函数
                const requestPayload = {
                    ...formData,
                    expectedResources: expectedResources.value 
                };

                // 1. 使用 Call 构造标准请求 Payload
                const requestCall = Call_Custom_Opening.constructRequest(requestPayload);

                console.log("[CustomOpening] 发送 LLM 请求...", requestCall);

                // 2. 通过 Manager 发送 (Game_Manager 会负责处理超时和错误状态)
                const success = await Game_Manager.sendRequest(requestCall);

                // 注意：这里不需要直接处理 success 为 true 的情况，
                // 因为成功的数据回填是通过上面的 watch(() => store.tempOpeningResult) 异步处理的。
                // 我们只需要处理同步返回 false (请求未发出/立即失败) 的情况。

                if (!success) {
                   throw new Error("请求发送失败或被拒绝");
                }

            } catch (err) {
                console.error("生成流程异常:", err);
                errorMessage.value = "命运链接断开，请检查连接后重试。";
                viewMode.value = 'EDIT';
            }
        };

        // --- 核心流程：重新生成 (Reroll) ---
        const handleReroll = () => {
            // 保持 formData 不变，重新触发生成
            handleInitialize(); 
        };

        // --- 核心流程：返回编辑 (Back to Edit) ---
        const handleEdit = () => {
            viewMode.value = 'EDIT';
            generatedResult.value = null; // 清空旧结果
        };

        // --- 核心流程：正式开始 (Start Game) ---
        const handleStartGame = () => {
            if (!generatedResult.value) return;

            // 🟢 [修改] 优先使用 generatedResult 中的名字 (因为预览界面可能修改了名字)
            // 如果 generatedResult.openingData.playerConfig.name 存在，则使用它，否则回退到 formData
            const finalName = generatedResult.value.openingData.playerConfig.name || formData.playerName;

            // 组装最终 Payload 发送给 App.js
            const payload = {
                playerName: finalName, 
                openingId: 'DYNAMIC_OPENING',    
                difficultyParams: currentDiffInfo.value.params,
                
                // 核心：LLM 生成的数据 (包含可能在预览界面被玩家修改过的 playerConfig)
                dynamicData: generatedResult.value 
            };

            console.log("[CustomOpening] 发送动态开局 Payload:", payload);
            emit('start-game', payload);
        };

        const handleCancel = () => {
            emit('back-to-title');
        };

        // 辅助显示：将生成的 Tags 数组转为字符串
        const tagsDisplay = computed(() => {
            if (!generatedResult.value?.meta?.tags) return "";
            return generatedResult.value.meta.tags.join(" / ");
        });

        return {
            viewMode,
            formData,
            errorMessage,
            currentDiffInfo,
            generatedResult,
            tagsDisplay,
            cycleDiff,
            handleInitialize,
            handleReroll,
            handleEdit,
            handleStartGame,
            handleCancel,
            // 点数系统
            totalPoints,
            remainingPoints,
            expectedResources,
            adjustAllocation,
            POINT_PRESETS,    // 导出配置供模板显示 Label
            currentPointConfig,
            cyclePoints,      // 导出切换函数
            
            // UI 状态
            showItemTooltip,

            // 🟢 [新增] 导入导出暴露
            fileInput,
            handleExportTemplate,
            handleImportClick,
            handleFileChange
        };
    },
    template: `
    <div class="co-overlay">
        <div class="co-header">
            <h2>自定义轮回</h2>
            <div class="co-subtitle">
                <span v-if="viewMode === 'EDIT'">书写你的起源，世界将随之而变</span>
                <span v-else-if="viewMode === 'LOADING'">正在编织命运线...</span>
                <span v-else>命运已定，是否缔结契约？</span>
            </div>
        </div>

        <div class="co-body">
            
            <div v-if="viewMode === 'EDIT'" class="co-edit-container">
                <div class="co-column">
                    <div class="co-section-title">✦ 主角设定</div>
                    
                    <div class="co-form-group required">
                        <label>契约者真名 <span class="req-star">*</span></label>
                        <input type="text" v-model="formData.playerName" class="co-input main-input" placeholder="必填..." maxlength="12">
                    </div>

                    <div class="co-form-group">
                        <label>身份 / 职业</label>
                        <input type="text" v-model="formData.playerIdentity" class="co-input" placeholder="描述身份...">
                    </div>

                    <div class="co-form-group">
                        <label>外貌特征 (Appearance)</label>
                        <textarea v-model="formData.playerAppearance" class="co-textarea" rows="2" placeholder="描述外貌..."></textarea>
                    </div>

                    <div class="co-form-group">
                        <label>性格特征 (Personality)</label>
                        <textarea v-model="formData.playerPersonality" class="co-textarea" rows="2" placeholder="描述性格..."></textarea>
                    </div>

                    <div class="co-form-group">
                        <label>核心驱动 (Objective)</label>
                        <input type="text" v-model="formData.playerObjective" class="co-input" placeholder="复仇、或者仅仅是为了活下去...">
                    </div>

                    <div class="co-form-group">
                        <label>世界法则 (难度)</label>
                        <div class="co-diff-selector">
                            <button class="co-arrow-btn" @click="cycleDiff(-1)" :class="{ disabled: formData.difficultyIdx <= 1 }">◀</button>
                            <div class="co-diff-display">
                                <span class="co-diff-name" :class="'diff-color-' + formData.difficultyIdx">{{ currentDiffInfo.label }}</span>
                            </div>
                            <button class="co-arrow-btn" @click="cycleDiff(1)" :class="{ disabled: formData.difficultyIdx >= 5 }">▶</button>
                        </div>
                    </div>
                </div>

                <div class="co-column">
                    <div class="co-section-title" style="border-color: #ffd700; color: #ffd700; display: flex; justify-content: space-between; align-items: center;">
                        <span>✦ 命运天平</span>
                        
                        <div class="co-diff-selector" style="transform: scale(0.9); margin-right: -10px;">
                            <button class="co-arrow-btn" @click="cyclePoints(-1)" :class="{ disabled: formData.pointPresetIdx <= 0 }">◀</button>
                            <div class="co-diff-display" style="min-width: 80px;">
                                <span class="co-diff-name" style="color: #ffd700;">{{ currentPointConfig.label }}</span>
                            </div>
                            <button class="co-arrow-btn" @click="cyclePoints(1)" :class="{ disabled: formData.pointPresetIdx >= POINT_PRESETS.length - 1 }">▶</button>
                        </div>
                    </div>
                    
                    <div style="text-align: right; font-size: 0.8em; color: #888; margin-bottom: 10px; margin-top: -5px;">
                        (总预算: {{ totalPoints }} / 剩余: {{ remainingPoints }})
                    </div>

                    <div class="co-balance-container">
                        <div class="co-balance-row">
                            <span class="lbl">初始金币 ({{ expectedResources.gold }})</span>
                            <div class="ctrl-group">
                                <button class="btn-mini" @click="adjustAllocation('gold', -1)">-</button>
                                <div class="progress-bar">
                                    <div class="fill gold" :style="{width: (totalPoints > 0 ? (formData.allocations.gold / totalPoints * 100) : 0) + '%'}"></div>
                                </div>
                                <button class="btn-mini" @click="adjustAllocation('gold', 1)" :disabled="remainingPoints < 1">+</button>
                            </div>
                        </div>

                        <div class="co-balance-row">
                            <span class="lbl">随机物资 ({{ expectedResources.itemCount }})</span>
                            <div class="ctrl-group">
                                <button class="btn-mini" @click="adjustAllocation('items', -1)">-</button>
                                <div class="progress-bar">
                                    <div class="fill blue" :style="{width: (totalPoints > 0 ? (formData.allocations.items / totalPoints * 100) : 0) + '%'}"></div>
                                </div>
                                <button class="btn-mini" @click="adjustAllocation('items', 1)" :disabled="remainingPoints < 10">+</button>
                            </div>
                        </div>

                        <div class="co-balance-row">
                            <span class="lbl">额外伴侣 ({{ expectedResources.companionCount }})</span>
                            <div class="ctrl-group">
                                <button class="btn-mini" @click="adjustAllocation('companions', -1)">-</button>
                                <div class="progress-bar">
                                    <div class="fill pink" :style="{width: (totalPoints > 0 ? (formData.allocations.companions / totalPoints * 100) : 0) + '%'}"></div>
                                </div>
                                <button class="btn-mini" @click="adjustAllocation('companions', 1)" :disabled="remainingPoints < 50">+</button>
                            </div>
                        </div>
                    </div>

                    <div class="co-section-title">✦ 伴侣与世界</div>
                    
                    <div v-if="expectedResources.companionCount === 0" class="co-form-group" style="text-align: center; color: #666; padding: 1rem; border: 1px dashed #333; border-radius: 4px;">
                        暂无额外伴侣，点击上方 ⊕ 增加
                    </div>

                    <div v-else v-for="(comp, index) in formData.companionDetails" :key="index" class="co-companion-editor-card">
                        <div class="co-comp-header">❤ 伴侣 #{{ index + 1 }}</div>
                        
                        <div class="co-form-group">
                            <label>名字</label>
                            <input type="text" v-model="comp.name" class="co-input" placeholder="留空则由 AI 随机生成...">
                        </div>

                        <div class="co-form-group">
                            <label>身份 (Identity)</label>
                            <input type="text" v-model="comp.identity" class="co-input" placeholder="如：落难公主、黑市医生、魔王副官...">
                        </div>

                        <div class="co-form-group">
                            <label>外貌特征 (Appearance)</label>
                            <textarea v-model="comp.appearance" class="co-textarea" rows="2" placeholder="发色、瞳色、穿着风格..."></textarea>
                        </div>

                        <div class="co-form-group">
                            <label>性格与驱动 (Personality)</label>
                            <textarea v-model="comp.character" class="co-textarea" rows="2" placeholder="傲娇、忠诚、或是怀揣复仇之心..."></textarea>
                        </div>
                    </div>

                    <div class="co-divider"></div>

                    <div class="co-form-group">
                        <label>期望开局情节</label>
                        <textarea v-model="formData.worldStyle" class="co-textarea" rows="2" placeholder="写一个喜欢的开局"></textarea>
                    </div>
                </div>
            </div>

            <div v-else-if="viewMode === 'LOADING'" class="co-loading-container">
                <div class="co-spinner"></div>
                <div class="co-loading-text">正在向虚空请求数据...</div>
                <div class="co-loading-subtext">AI 正在构筑地图、生成剧情与计算属性</div>
            </div>

            <div v-else-if="viewMode === 'PREVIEW' && generatedResult" class="co-preview-container">
                
                <div class="co-result-card">
                    <div class="co-result-header">
                        <div class="co-result-title">{{ generatedResult.meta.title }}</div>
                        <div class="co-result-tags">{{ tagsDisplay }}</div>
                    </div>
                    
                    <textarea v-model="generatedResult.meta.description" class="co-textarea-transparent" rows="2"></textarea>
                    
                    <div class="co-divider"></div>

                    <div class="co-player-edit-grid">
                        <div class="pe-group">
                            <label>真名</label>
                            <input v-model="generatedResult.openingData.playerConfig.name" class="pe-input">
                        </div>
                        <div class="pe-group">
                            <label>身份</label>
                            <input v-model="generatedResult.openingData.playerConfig.identity" class="pe-input">
                        </div>
                        <div class="pe-group full">
                            <label>外貌</label>
                            <input v-model="generatedResult.openingData.playerConfig.appearance" class="pe-input">
                        </div>
                        <div class="pe-group full">
                            <label>性格</label>
                            <input v-model="generatedResult.openingData.playerConfig.character" class="pe-input">
                        </div>
                        <div class="pe-group full">
                            <label>核心驱动</label>
                            <input v-model="generatedResult.openingData.playerConfig.core_objective" class="pe-input">
                        </div>
                    </div>

                    <div class="co-divider"></div>

                    <div class="co-stats-grid">
                        <div class="co-stat-box">
                            <div class="label">当前地图</div>
                            <div class="value">{{ generatedResult.mapTheme.name }}</div>
                        </div>
                        
                        <div class="co-stat-box interactive" 
                             @mouseenter="showItemTooltip = true"
                             @mouseleave="showItemTooltip = false">
                            <div class="label">开局物资 🔒</div>
                            <div class="value">{{ generatedResult.openingData.items.length }} 件物品</div>
                            
                            <transition name="fade">
                                <div v-if="showItemTooltip && generatedResult.openingData.items.length > 0" class="co-tooltip-list">
                                    <div v-for="(item, idx) in generatedResult.openingData.items" :key="idx" class="tooltip-item">
                                        <span :class="'q-' + (item.quality || 'GRAY')">{{ item.name }}</span>
                                        <span>x{{ item.count }}</span>
                                    </div>
                                </div>
                            </transition>
                        </div>
                        
                        <div class="co-stat-box">
                            <div class="label">初始金币 🔒</div>
                            <div class="value highlight">{{ generatedResult.openingData.playerConfig.extraGold }}</div>
                        </div>
                    </div>

                    <div class="co-divider"></div>

                    <div v-if="generatedResult.companionData && generatedResult.companionData.length > 0">
                        <div class="label" style="color:#aaa; margin-bottom:0.5rem; font-size:0.8rem;">同行伙伴 ({{ generatedResult.companionData.length }}人)</div>
                        
                        <div v-for="(comp, idx) in generatedResult.companionData" :key="comp.id" class="co-companion-preview" style="margin-bottom: 10px;">
                            <div class="cp-row">
                                <span class="cp-name">{{ comp.base_info.name }}</span>
                                <span class="cp-identity">{{ comp.base_info.identity }}</span>
                            </div>
                            <div class="cp-desc">"{{ comp.base_info.character }}"</div>
                            <div class="cp-stats">
                                <span>好感: {{ comp.h_state_init.affection }}</span>
                                <span>堕落: {{ comp.h_state_init.depravity }}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="co-companion-preview" v-else>
                        <div class="cp-row" style="color:#888;">
                            <span class="cp-name">孤狼行动</span>
                        </div>
                        <div class="cp-desc">未雇佣任何伴侣，独自踏上旅程。</div>
                    </div>
                </div>

            </div>
        </div>

        <div v-if="errorMessage" class="co-error-bar">{{ errorMessage }}</div>

        <div class="co-action-bar">
            <template v-if="viewMode === 'EDIT'">
                <button class="co-btn co-btn-cancel" @click="handleCancel">返回</button>
                
                <div class="co-template-tools">
                    <button class="co-btn co-btn-tool" @click="handleImportClick" title="读取本地模板文件">
                        <span class="icon">📂</span> 导入模板
                    </button>
                    
                    <button class="co-btn co-btn-tool" @click="handleExportTemplate" title="保存当前设定到本地">
                        <span class="icon">💾</span> 导出模板
                    </button>

                    <input 
                        type="file" 
                        ref="fileInput" 
                        accept=".json" 
                        class="co-hidden-input" 
                        @change="handleFileChange"
                    >
                </div>

                <button class="co-btn co-btn-init" @click="handleInitialize">
                    <span>初始化世界</span>
                </button>
            </template>

            <template v-if="viewMode === 'PREVIEW'">
                <div class="co-btn-group-left">
                    <button class="co-btn co-btn-sub" @click="handleEdit">修改设定</button>
                    <button class="co-btn co-btn-sub" @click="handleReroll">🎲 重新生成</button>
                </div>
                <button class="co-btn co-btn-start" @click="handleStartGame">
                    <span>正式开始</span>
                    <div class="co-btn-glow"></div>
                </button>
            </template>
        </div>
    </div>
    `
};