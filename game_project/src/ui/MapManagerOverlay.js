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

// src/ui/MapManagerOverlay.js
import { store } from './modules/store.js';

export default {
    name: 'MapManagerOverlay',
    emits: ['close'],
    template: `
    <div class="map-manager-overlay" @click.self="$emit('close')">
        <div class="map-manager-panel">
            <div class="map-manager-header">
                <div class="map-manager-title">
                    <span>🗺️ 地图数据管理</span>
                    <span v-if="mapData" style="font-size: 0.8em; color: #888; margin-left: 10px;">
                        {{ mapData.type === 'MAIN' ? '主线' : '支线' }}
                    </span>
                </div>
                <button class="map-manager-close-btn" @click="$emit('close')">关闭 (ESC)</button>
            </div>

            <div class="map-manager-body" v-if="mapData" style="display: flex; flex-direction: row; gap: 20px; padding: 0;">
                
                <div class="mm-sidebar" style="width: 260px; background: rgba(0,0,0,0.2); border-right: 1px solid #3a4a5a; display: flex; flex-direction: column; overflow-y: auto;">
                    <div style="padding: 15px; font-weight: bold; color: #888; border-bottom: 1px solid rgba(255,255,255,0.1);">
                        已探索区域 ({{ worldMapList.length }})
                    </div>
                    
                    <div v-for="map in worldMapList" :key="map.mapId" 
                         class="mm-nav-item"
                         :class="{ 'is-active': map.mapId === mapData.mapId, 'is-current-location': map.mapId === currentRealMapId }"
                         @click="selectMap(map)"
                         style="padding: 12px 15px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s;">
                        
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="font-weight: bold; font-size: 0.95rem; color: #e0e6ed;">{{ map.name }}</span>
                            <span v-if="map.mapId === currentRealMapId" style="font-size: 0.7rem; background: #2ecc71; color: #fff; padding: 1px 6px; border-radius: 4px;">当前</span>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 0.8rem; color: #666;">{{ map.type === 'MAIN' ? '主线章节' : '支线区域' }}</span>
                            
                            <button v-if="map.mapId !== currentRealMapId"
                                    class="mm-teleport-btn"
                                    @click.stop="teleportToMap(map.mapId)">
                                🚀 传送
                            </button>
                        </div>
                    </div>
                </div>

                <div class="mm-content-area" style="flex: 1; padding: 20px; overflow-y: auto;">
                    <div class="map-manager-info-card">
                        <div class="mm-info-item">
                            <span class="mm-info-label">地图名称</span>
                            <span class="mm-info-value highlight">{{ mapData.name }}</span>
                        </div>
                        <div class="mm-info-item">
                            <span class="mm-info-label">唯一标识 (ID)</span>
                            <span class="mm-info-value">{{ mapData.mapId }}</span>
                        </div>
                        <div class="mm-info-item">
                            <span class="mm-info-label">主题配置 (Theme)</span>
                            <span class="mm-info-value">{{ mapData.themeId }}</span>
                        </div>
                        <div class="mm-info-item">
                            <span class="mm-info-label">LLM 生成进度</span>
                            <span class="mm-info-value" :class="isGenerationComplete ? 'highlight' : ''">
                                已生成 {{ mapData.maxGeneratedLayer + 1 }} 层 / 共 {{ mapData.maxDepth + 1 }} 层
                            </span>
                        </div>
                    </div>

                    <div class="map-manager-layers-container" style="margin-top: 20px;">
                        <div class="mm-section-title">层级拓扑视图</div>
                        
                        <div v-for="layer in layers" :key="layer.index" 
                             class="map-manager-layer-row"
                             :class="{ 
                                'is-generated': layer.index <= mapData.maxGeneratedLayer,
                                'is-current': (mapData.mapId === currentRealMapId && layer.index === currentLayerIndex)
                             }">
                            
                            <div class="mm-layer-header">
                                <span class="mm-layer-index">L-{{ layer.index }}</span>
                                <span class="mm-layer-status">
                                    {{ getLayerStatusText(layer.index) }}
                                </span>
                            </div>

                            <div class="mm-layer-nodes">
                                <div v-for="node in layer.nodes" :key="node.id"
                                     class="mm-node-indicator"
                                     :class="getNodeClasses(node)"
                                     :title="getNodeTooltip(node)">
                                     {{ getNodeIcon(node) }}
                                </div>
                                
                                <div v-if="layer.nodes.length === 0" style="color: #666; font-size: 0.8rem; font-style: italic;">
                                    (空层级)
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
            
            <div v-else class="map-manager-body" style="justify-content: center; align-items: center;">
                <p style="color: #aaa; font-size: 1.2rem;">
                    ⚠️ 当前未加载任何地图数据
                </p>
            </div>
        </div>
    </div>
    `,
    data() {
        return {
            mapData: null,       // 当前正在查看的地图 (View Model)
            currentNodeId: null, // 玩家实际所在节点 ID (用于高亮)
            allMaps: {},         // 所有地图数据的缓存
            currentRealMapId: null // 玩家当前实际所在的地图 ID
        };
    },
    computed: {
        layers() {
            if (!this.mapData) return [];
            const list = [];
            for (let i = 0; i <= this.mapData.maxDepth; i++) {
                const nodesInLayer = (this.mapData.nodes || [])
                    .filter(n => n.layerIndex === i)
                    .sort((a, b) => a.x - b.x);
                list.push({ index: i, nodes: nodesInLayer });
            }
            return list;
        },
        currentLayerIndex() {
            if (!this.mapData || !this.currentNodeId) return -1;
            const node = this.mapData.nodes.find(n => n.id === this.currentNodeId);
            return node ? node.layerIndex : -1;
        },
        isGenerationComplete() {
            if (!this.mapData) return false;
            return this.mapData.maxGeneratedLayer >= this.mapData.maxDepth;
        },
        worldMapList() {
            if (!this.allMaps) return [];
            
            const list = Object.values(this.allMaps);
            
            return list.sort((a, b) => {
                // 1. 当前所在地图置顶
                if (a.mapId === this.currentRealMapId) return -1;
                if (b.mapId === this.currentRealMapId) return 1;
                
                // 2. 主线优先
                if (a.type === 'MAIN' && b.type !== 'MAIN') return -1;
                if (a.type !== 'MAIN' && b.type === 'MAIN') return 1;
                
                // 3. 按 ID 或 名称排序
                return a.mapId.localeCompare(b.mapId);
            });
        },
    },
    methods: {
        
        refreshData() {
            if (window.mapManager) {
                // 1. 获取基础状态
                this.currentRealMapId = window.mapManager.activeMapId;
                this.allMaps = window.mapManager.maps || {};

                // 2. 默认显示当前所在的地图 (如果尚未选择查看其他地图)
                if (!this.mapData || this.mapData.mapId === this.currentRealMapId) {
                    this.mapData = window.mapManager.currentMap;
                }
                
                // 3. 更新节点位置 (仅当查看的是当前地图时才有效)
                if (this.mapData && this.mapData.mapId === this.currentRealMapId) {
                    this.currentNodeId = this.mapData.currentNodeId;
                } else {
                    this.currentNodeId = null; // 查看其他地图时，不显示"当前节点"高亮
                }

            } else {
                this.mapData = null;
                this.allMaps = {};
            }
        },

        selectMap(map) {
            this.mapData = map;
            // 如果切回了当前地图，恢复节点高亮
            if (map.mapId === this.currentRealMapId) {
                this.currentNodeId = map.currentNodeId;
            } else {
                this.currentNodeId = null;
            }
        },

        teleportToMap(targetMapId) {
            if (!window.mapManager) return;
            
            if (!confirm(`确定要传送到 [${targetMapId}] 吗？`)) return;

            const result = window.mapManager.teleportToMap(targetMapId);
            
            if (result && result.success) {
                // 1. 关闭当前窗口
                this.$emit('close'); 

                // 2. 🟢 [关键新增] 触发 Phaser 重绘信号
                // ExplorationScene 监听了 store.tempMapData 的变化
                if (window.uiStore) {
                    window.uiStore.tempMapData = Date.now();
                }

            } else {
                alert(result?.message || "传送失败");
            }
        },

        getLayerStatusText(layerIndex) {
            if (!this.mapData) return '';
            // 只有查看当前地图时，才显示"当前所在"
            if (this.mapData.mapId === this.currentRealMapId && layerIndex === this.currentLayerIndex) return '当前所在';
            if (layerIndex <= this.mapData.maxGeneratedLayer) return '已生成';
            return '待生成';
        },

        isSubMapPortal(node) {
            return node.type === 'PORTAL_NEXT_CHAPTER' && 
                   node.portalTarget && 
                   String(node.portalTarget).startsWith('sub_');
        },

        getNodeClasses(node) {
            if (node.state === 'LOCKED') {
                return ['type-UNKNOWN', 'state-LOCKED'];
            }

            const hasPayload = node.payload && 
                              (node.payload.description || 
                               node.payload.enemies || 
                               node.payload.choice_scenes);

            const classes = [
                `type-${node.type}`,
                `state-${node.state}`,
                node.id === this.currentNodeId ? 'is-active-node' : '',
                hasPayload ? 'has-payload' : ''
            ];

            if (this.isSubMapPortal(node)) {
                classes.push('is-sub-portal');
            }

            return classes;
        },

        getNodeIcon(node) {
            if (node.state === 'LOCKED') {
                return '?';
            }

            if (this.isSubMapPortal(node)) {
                return '🌀';
            }

            const iconMap = {
                'ROOT': '🏁',
                'COMBAT': '⚔️',
                'EVENT_CHOICE': '⚖️',
                'EVENT_H': '❤️',
                'EVENT_QUEST': '📜',
                'RESOURCE': '💎',
                'SHOP': '🛒',
                'REST': '🔥',
                'PORTAL_NEXT_FLOOR': '🚪',
                'PORTAL_NEXT_CHAPTER': '🛑', 
                'LOCATION': '📍'
            };
            return iconMap[node.type] || '?';
        },

        getNodeTooltip(node) {
            if (node.state === 'LOCKED') {
                return "??? (未探索区域)";
            }

            let info = `[${node.type}] ${node.name}\nID: ${node.id}`;
            
            if (this.isSubMapPortal(node)) {
                info += `\n🌀 支线裂缝 -> ${node.portalTarget}`;
            } else if (node.portalTarget) {
                info += `\nTarget: ${node.portalTarget}`;
            }

            if (node.payload && node.payload.enemies) {
                info += `\nEnemies: ${node.payload.enemies.length}`;
            }
            return info;
        },

        // 🟢 [修正] 将 ESC 监听函数提取为方法，以便正确移除监听
        handleKeydown(e) {
            if (e.key === 'Escape') this.$emit('close');
        }

    },
    mounted() {
        this.refreshData();
        // 🟢 使用具名方法绑定
        window.addEventListener('keydown', this.handleKeydown);
    },
    unmounted() {
        // 🟢 正确移除监听
        window.removeEventListener('keydown', this.handleKeydown);
    }
};