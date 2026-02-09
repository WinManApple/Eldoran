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

// src/ui/LLMManager.js
import { ref, reactive } from '../../lib/vue.esm-browser.js';
import { useLLM } from './modules/useLLM.js';
import { addLog,store } from './modules/store.js';

export default {
    name: 'LLMManager',
    emits: ['close'],
    template: `
    <div class="sub-menu" style="z-index: 2000;">
        <div class="panel" style="width: 600px; max-width: 95%; padding: 0; display: flex; flex-direction: column; max-height: 85vh;">
            
            <div class="panel-header" style="padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3);">
                <div>
                    <h2 class="panel-title" style="margin: 0; font-size: 22px;">🔮 创世干涉控制台</h2>
                    <span style="font-size: 12px; color: #888;">AI GENERATION MANAGEMENT</span>
                </div>
                <button class="rpg-btn small danger" @click="$emit('close')" title="关闭">✖</button>
            </div>
            
            <div class="panel-content" style="padding: 20px; overflow-y: auto; flex: 1;">
                
                <div v-for="feature in featureList" :key="feature.id" 
                     class="feature-card"
                     style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                    
                    <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">
                        <div style="font-size: 24px; margin-right: 15px; background: rgba(0,0,0,0.3); width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">
                            {{ feature.icon }}
                        </div>
                        <div>
                            <h3 style="color: #E8DFCA; margin: 0 0 5px 0; font-size: 18px;">{{ feature.title }}</h3>
                            <p style="color: #aaa; font-size: 13px; margin: 0; line-height: 1.4;">
                                {{ feature.description }}
                            </p>
                        </div>
                    </div>

                    <div v-if="feature.inputs && feature.inputs.length > 0" 
                         style="background: rgba(0,0,0,0.2); padding: 10px; margin: 10px 0; border-radius: 4px; border-left: 2px solid #6495ED;">
                        
                        <div v-for="input in feature.inputs" :key="input.model" style="display: flex; align-items: center; margin-bottom: 8px; font-size: 14px;">
                            <label style="width: 100px; color: #ccc;">{{ input.label }}:</label>
                            
                            <input v-if="input.type === 'number'" 
                                   type="number" 
                                   v-model.number="feature.params[input.model]"
                                   :min="input.min" :max="input.max"
                                   style="background: rgba(0,0,0,0.5); border: 1px solid #444; color: white; padding: 4px 8px; border-radius: 4px; width: 80px;">
                            
                            <input v-else-if="input.type === 'text'"
                                   type="text"
                                   v-model="feature.params[input.model]"
                                   style="background: rgba(0,0,0,0.5); border: 1px solid #444; color: white; padding: 4px 8px; border-radius: 4px; flex: 1;">
                                   
                            <span v-if="input.desc" style="margin-left: 10px; font-size: 12px; color: #666;">{{ input.desc }}</span>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
                        <button class="rpg-btn" 
                                :class="feature.btnClass || 'primary'"
                                style="padding: 8px 20px; font-size: 14px;"
                                :disabled="isProcessing"
                                @click="handleAction(feature)">
                            <span v-if="isProcessing && activeFeatureId === feature.id">⏳ 执行中...</span>
                            <span v-else>{{ feature.btnText }}</span>
                        </button>
                    </div>

                </div>

            </div>
            
            <div style="padding: 10px 20px; background: rgba(0,0,0,0.5); font-size: 12px; color: #666; text-align: center; border-top: 1px solid rgba(255,255,255,0.05);">
                警告：AI 生成操作具有不可逆性，建议操作前手动存档。
            </div>

        </div>
    </div>
    `,
    setup(props, { emit }) {
        const { reInitializeWorld, reshapeLayerPayload } = useLLM();
        
        const isProcessing = ref(false);
        const activeFeatureId = ref(null);

        // ==========================================
        // 核心配置：功能列表 (Feature List)
        // ==========================================
        const featureList = reactive([
            {
                id: 'reshape_nodes',
                icon: '🛠️',
                title: '局部节点重塑 (Reshape)',
                description: '保留地图骨架与名称，仅重新生成指定层级的事件与描述。注意：初始层数从第0层开始。',
                btnText: '执行重塑',
                btnClass: 'primary',
                // 动态参数定义
                inputs: [
                    { label: '起始层级', model: 'startLayer', type: 'number', min: 0, desc: '(包含)' },
                    { label: '重塑层数', model: 'count', type: 'number', min: 1, max: 5, desc: '(建议 1-3 层)' }
                ],
                // 参数绑定对象
                params: {
                    startLayer: window.mapManager?.getCurrentNodeLayer() || 0, // 默认当前层
                    count: 3
                },
                // 执行逻辑
                // 🟢 [修改] Action 执行逻辑：添加边界检查与日志提示
                action: async (params) => {
                    const currentMap = window.mapManager?.currentMap;
                    let finalCount = params.count; // 1. 默认使用玩家输入的数量
                    
                    // 检查地图最大深度限制
                    if (currentMap && typeof currentMap.maxDepth === 'number') {
                        // 计算玩家想要到达的层级 (Start + Count)
                        const targetEndLayer = params.startLayer + params.count;
                        // 地图实际边界 (maxDepth 是索引，比如 5，意味着最大到 Layer 5，这里 +1 转换为数量边界)
                        const limitLayer = currentMap.maxDepth + 1;

                        if (targetEndLayer > limitLayer) {
                            // 2. 计算修正后的数量
                            const correctedCount = Math.max(0, limitLayer - params.startLayer);
                            
                            // 3. 更新最终使用的数量变量
                            finalCount = correctedCount; 

                            // 💡 在这里向控制台发送提示
                            addLog(`⚠️ 请求超出地图边界 (Max: Layer ${currentMap.maxDepth})，将自动修正为生成 ${correctedCount} 层。`);
                        }
                    }

                    // 4. 执行生成请求
                    // 🔴 关键修正：这里传入 finalCount，而不是 params.count
                    const success = await reshapeLayerPayload(params.startLayer, finalCount);

                    // 5. 🟢 [修复] 手动生成成功后，更新地图的进度标记
                    // 防止 MapNavigation.js 在玩家移动时误判这些层级为空，再次触发自动生成
                    if (success && currentMap) {
                        // 计算本次操作覆盖到的最高层级索引
                        const generatedMaxLayer = params.startLayer + finalCount - 1;

                        // 获取当前记录的最大层级 (如果没有则设为 -1)
                        const currentRecord = typeof currentMap.maxGeneratedLayer === 'number' 
                                            ? currentMap.maxGeneratedLayer 
                                            : -1;

                        // 只有当生成的层级确实推进了地图进度时，才更新标记
                        // (避免玩家只是重塑前面的旧层级时，意外把进度倒退)
                        if (generatedMaxLayer > currentRecord) {
                            currentMap.maxGeneratedLayer = generatedMaxLayer;
                            addLog(`[LLMManager] 📍 手动生成更新: 地图进度已推进至 Layer ${generatedMaxLayer} (原: ${currentRecord})`);
                            // 打印日志方便调试
                            console.log(`[LLMManager] 📍 手动生成更新: 地图进度已推进至 Layer ${generatedMaxLayer} (原: ${currentRecord})`);
                        }
                    }

                    return success;
                }
            },
            {
                id: 'reinit_world',
                icon: '🌋',
                title: '世界回炉重造 (Re-Initialize)',
                description: '【危险操作】强制将位置归零，清空当前地图的所有数据（名字、剧情、所有节点），并请求 AI 重新创造一切。',
                btnText: '⚠️ 确认重置',
                btnClass: 'danger', // 红色按钮
                inputs: [],
                params: {},
                action: async () => {
                    if (!confirm("确定要彻底重置当前地图吗？\n所有未保存的探索进度都将丢失！")) return false;
                    return await reInitializeWorld();
                }
            },
            // 🟢 [修改] 神经参数调优 (专注 AI 记忆逻辑)
            {
                id: 'ai_config_tuning',
                icon: '🧠',
                title: '神经网络参数微调',
                description: '调整 AI 上下文记忆的触发阈值与保留策略。当对话条数达到[触发阈值]时，会进行总结并只保留[保留条数]以维持上下文连贯。',
                btnText: '应用 AI 配置',
                btnClass: 'rpg-btn',
                
                // 定义输入框
                inputs: [
                    // --- 近期对话配置 ---
                    { 
                        label: '触发总结阈值', 
                        model: 'chat_max_recent', 
                        type: 'number', 
                        min: 5, max: 50, 
                        desc: '当近期对话达到 N 条时触发总结' 
                    },
                    { 
                        label: '总结后保留数', 
                        model: 'chat_recent', 
                        type: 'number', 
                        min: 1, max: 20, 
                        desc: '总结后保留最近 N 条原始对话' 
                    },
                    
                    // --- 阶段总结配置 ---
                    { 
                        label: '触发宏观阈值', 
                        model: 'chat_max_summary', 
                        type: 'number', 
                        min: 2, max: 20, 
                        desc: '当阶段总结达到 N 条时触发宏观总结' 
                    },
                    { 
                        label: '宏观后保留数', 
                        model: 'chat_summary', 
                        type: 'number', 
                        min: 1, max: 10, 
                        desc: '宏观总结后保留最近 N 条阶段总结' 
                    }
                ],
                
                // 初始化参数
                params: {
                    chat_max_recent: store.config?.ai?.chat?.maxRecentInteractions || 10,
                    chat_recent: store.config?.ai?.chat?.retentionRecent || 5,
                    chat_max_summary: store.config?.ai?.chat?.maxSummaries || 5,
                    chat_summary: store.config?.ai?.chat?.retentionSummary || 3
                },

                // 执行逻辑
                action: async (params) => {
                    if (!store.config || !store.config.ai || !store.config.ai.chat) return false;

                    // 1. 简单的合法性校验 (保留数不能大于阈值)
                    if (params.chat_recent >= params.chat_max_recent) {
                        alert("配置错误：[总结后保留数] 必须小于 [触发总结阈值]");
                        return false;
                    }
                    if (params.chat_summary >= params.chat_max_summary) {
                        alert("配置错误：[宏观后保留数] 必须小于 [触发宏观阈值]");
                        return false;
                    }

                    // 2. 写回 AI 配置 (完全由用户指定，不再自动计算)
                    store.config.ai.chat.maxRecentInteractions = params.chat_max_recent;
                    store.config.ai.chat.retentionRecent = params.chat_recent;
                    
                    store.config.ai.chat.maxSummaries = params.chat_max_summary;
                    store.config.ai.chat.retentionSummary = params.chat_summary;

                    addLog(`⚙️ AI 记忆参数已更新 (近期:${params.chat_recent}/${params.chat_max_recent}, 总结:${params.chat_summary}/${params.chat_max_summary})`);
                    return true;
                }
            },
            // 🟢 [新增] 地图生成参数 (独立的地图模块)
            {
                id: 'map_config_tuning',
                icon: '🗺️',
                title: '地图生成参数',
                description: '调整地图生成的性能与规模参数。惰性生成层数越高，生成等待时间越长，但探索流畅度越高。',
                btnText: '应用地图配置',
                btnClass: 'rpg-btn',
                
                inputs: [
                    { 
                        label: '地图惰性生成', 
                        model: 'map_lazy', 
                        type: 'number', 
                        min: 1, max: 10, 
                        desc: '每次触发生成时的预加载层数' 
                    },
                    // 可选：如果想暴露初始层数也可以加在这里
                    { 
                        label: '新章节初始层', 
                        model: 'map_initial', 
                        type: 'number', 
                        min: 1, max: 10, 
                        desc: '进入新地图时首次生成的层数' 
                    }
                ],
                
                params: {
                    map_lazy: store.config?.map?.lazyGenLayers || 3,
                    map_initial: store.config?.map?.initialGenLayers || 1
                },

                action: async (params) => {
                    if (!store.config || !store.config.map) return false;

                    store.config.map.lazyGenLayers = params.map_lazy;
                    store.config.map.initialGenLayers = params.map_initial;

                    addLog(`⚙️ 地图生成参数已更新 (预加载:${params.map_lazy}层, 初始:${params.map_initial}层)`);
                    return true;
                }
            },
        ]);

        // ==========================================
        // 统一处理逻辑
        // ==========================================
        const handleAction = async (feature) => {
            if (isProcessing.value) return;

            activeFeatureId.value = feature.id;
            isProcessing.value = true;

            try {
                // 执行配置中的 action 函数，并传入绑定的 params
                const success = await feature.action(feature.params);
                
                if (success) {
                    // 如果需要在成功后自动关闭窗口，可取消注释
                    // emit('close');
                }
            } catch (err) {
                console.error("AI 操作执行失败:", err);
                addLog(`❌ 操作异常: ${err.message}`);
            } finally {
                isProcessing.value = false;
                activeFeatureId.value = null;
            }
        };

        return {
            featureList,
            isProcessing,
            activeFeatureId,
            handleAction
        };
    }
};