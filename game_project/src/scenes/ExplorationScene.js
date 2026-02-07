/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/scenes/ExplorationScene.js
import { MapBackground } from '../map/MapBackground.js';
import { MapRenderer } from '../map/MapRenderer.js';
import { watch } from '../../lib/vue.esm-browser.js';
import { InputBlocker } from '../systems/InputBlocker.js';

export class ExplorationScene extends Phaser.Scene {
    constructor() {
        super({ key: 'ExplorationScene' });
    }

    create() {
        // 1. 初始化 3D 渲染器
        // 注意：我们将其命名为 mapRenderer 以便 MapBackground 访问
        this.mapRenderer = new MapRenderer(this);

        // 将摄像机暴露给全局，供 SnapshotManager 抓取
        // 确保 SnapshotManager 不会因为找不到 window.game 而抓取失败
        window.currentMapCamera = this.mapRenderer.camera;

        // 2. 初始化动态深空背景
        // 背景依赖 mapRenderer 的相机参数来做视差，所以要在 renderer 之后创建
        this.background = new MapBackground(this);
        this.background.create();

        // 3. UI 标题 (未知区域)
        // 保持在最上层，白色高亮
        this.mapTitle = this.add.text(this.scale.width / 2, 50, "未知区域", {
            fontSize: '32px',
            fontFamily: 'Microsoft YaHei',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        this.mapTitle.setScrollFactor(0);
        this.mapTitle.setDepth(2000); // 确保盖住 3D 节点

        // 4. 初始化地图数据逻辑
        if (!window.mapManager.currentMap) {
            window.mapManager.initNewGame();
        }

        // 5. 监听全局 Store 刷新信号
        if (window.uiStore) {
            watch(
                () => window.uiStore.tempMapData,
                (newVal, oldVal) => {
                    console.log(`[ExplorationScene] 收到刷新信号 (${newVal})，正在重绘...`);
                    this.refreshMap();
                }
            );
        }

        // 6. 初始化悬浮提示系统
        this.createTooltipSystem();

        // 7. 首次渲染
        this.refreshMap();
        
        // 8. 全局输入拦截 (兜底)
        // 虽然 MapRenderer 内部有 InputBlocker 检查，但 Scene 级别也可以做一层
        this.input.on('pointerdown', (pointer) => {
            if (InputBlocker.isBlocked()) {
                // 可以在这里阻止事件冒泡，但在 Phaser 中主要是逻辑判断
            }
        });
    }

    /**
     * 核心循环：驱动 3D 动画与视差背景
     * @param {number} time - 系统运行总时间
     * @param {number} delta - 上一帧间隔 (ms)
     */
    update(time, delta) {
        // 1. 更新背景 (星空视差滚动)
        if (this.background) {
            this.background.update();
        }

        // 2. 更新地图渲染器 (3D 投影、自转动画、连线重绘)
        if (this.mapRenderer) {
            this.mapRenderer.update(time, delta);
        }
    }

    /**
     * 刷新地图视图 (切换地图或生成新内容时调用)
     */
    refreshMap() {
        const currentMap = window.mapManager.currentMap;
        if (!currentMap) return;

        // 🟢 [标记位] 标记本次刷新是否来自读档恢复
        // 如果是恢复模式，我们将禁止后续的“智能锁定”逻辑修改镜头位置
        let isRestored = false;

        // A. 更新 UI 标题
        this.mapTitle.setText(currentMap.name);
        if (currentMap.type === 'SUB') {
            this.mapTitle.setColor('#A569BD');
        } else {
            this.mapTitle.setColor('#FFFFFF');
        }

        // B. 更新 DOM HUD (写入 Store 以触发 Vue 响应)
        this.updateHUD();

        // C. 重置/恢复 3D 布局
        // ============================================================
        // 🟢 [代码清理] 视角恢复逻辑 (托管给 Camera)
        // ============================================================
        
        // 1. 获取恢复数据源
        // 优先检查全局锁 (来自 SnapshotManager)，其次检查临时状态 (来自 MapManager 切图)
        let restoreData = null;

        if (window.__RestorationContext && window.__RestorationContext.camera) {
            restoreData = window.__RestorationContext.camera;
            console.log("[ExplorationScene] 🛡️ 命中恢复锁，准备应用快照视角");
        } else if (window.mapManager.pendingCameraState) {
            restoreData = window.mapManager.pendingCameraState;
        }

        // 2. 执行恢复或重置
        if (restoreData) {
            // [模式 A: 读档/恢复]
            isRestored = true; 
            
            // ✅ 核心修改：一键恢复，不再手动赋值
            this.mapRenderer.camera.deserialize(restoreData);

            // 清理单次状态 (如果是全局锁则保留，由管理者清理)
            if (!window.__RestorationContext) {
                // window.mapManager.pendingCameraState = null;
            }
        } else {
            // [模式 B: 正常新游戏/常规切图]
            // 重置为默认视角 (Zoom=1, Rot=0, Pan=0)
            this.mapRenderer.camera.reset();
        }

        // D. 重建 3D 节点布局
        this.mapRenderer.init3DLayout();

        // 🟢 强制执行一次 update 以计算最新坐标 (修复闪烁问题)
        this.mapRenderer.update(0, 16); 

        // ============================================================
        // 🟢 智能锁定目标 (Smart Lock)
        // ============================================================
        const currentNodeId = currentMap.currentNodeId;
        
        // [核心逻辑] 只有在“非读档”状态下，才强制把镜头吸附到当前节点
        // 如果是读档 (isRestored = true)，我们信任快照里保存的位置 (可能是玩家查看地图其他位置时的状态)
        if (!isRestored && currentNodeId) {
            const currentNode = currentMap.nodes.find(n => n.id === currentNodeId);
            
            if (currentNode && currentNode._pos3D) {
                const camera = this.mapRenderer.camera;
                const targetY = currentNode._pos3D.y;

                // 瞬间锁定，无动画 (避免切图时的推拉感)
                camera.panY = targetY;
                camera.targetPanY = targetY; 
            }
        }
    }

    /**
     * 更新 HTML HUD 文本 (左上角)
     */
    updateHUD() {
        const mapManager = window.mapManager;
        if (!mapManager || !mapManager.currentMap) return;

        const currentLayer = mapManager.getCurrentNodeLayer();
        let nodeName = "虚空";
        
        // 尝试获取当前节点的名称
        if (mapManager.currentMap.currentNodeId) {
            const currentNode = mapManager.currentMap.nodes.find(n => n.id === mapManager.currentMap.currentNodeId);
            if (currentNode) {
                nodeName = currentNode.name || currentNode.type;
            }
        }

        // 构建完整的显示字符串
        const fullLocationString = `DEPTH: ${currentLayer} | LOC: ${nodeName}`;

        // ============================================================
        // 🟢 [核心修复] 将数据回写到 Vue Store，而不是直接操作 DOM
        // ============================================================
        // 这样做的原因是：Vue 是响应式的。如果我们只改 DOM，一旦打开菜单触发 Vue 重绘，
        // Vue 就会用 Store 里的旧值 ("灰烬荒原") 覆盖掉我们的 DOM 修改。
        // 只有修改了 Store，Vue 才知道这个标题变了，重绘时也会保持这个长标题。
        
        if (window.uiStore && window.uiStore.worldState) {
            window.uiStore.worldState.mapName = fullLocationString;
        }

    }

    /**
     * 处理节点点击事件 (由 MapRenderer 的 Hitbox 触发)
     */
    handleNodeClick(node) {
        // 二次防穿透检查
        if (InputBlocker.isBlocked()) return;

        // 1. 调用逻辑层移动
        const result = window.mapManager.moveToNode(node.id);

        if (result.success) {
            if (window.uiStore && result.message) {
                 console.log(result.message);
            }

            // 2. 只有当地图发生实质变化(切换层级/地图)时才需要完全刷新布局
            // 如果只是移动到相邻节点，update() 循环会自动处理高亮状态变化(Current状态)
            if (result.mapChanged) {
                this.refreshMap();
            } else {
                // 仅更新 HUD 文本
                this.updateHUD();
                // 可以在这里加一个摄像机看向新节点的缓动效果(ToDo)
            }
            
            // 触发 LLM 交互 (预留)
            if (window.handleUserChat && node.shouldTriggerEvent) {
                // window.handleUserChat(...)
            }
        }
    }

    // ==========================================
    // UI: 悬浮提示系统 (Tooltip)
    // ==========================================

    createTooltipSystem() {
        this.tooltipBg = this.add.graphics();
        
        this.tooltipText = this.add.text(0, 0, "", {
            fontFamily: 'Microsoft YaHei',
            fontSize: '14px',
            color: '#aaddff', // 浅蓝文字
            backgroundColor: null,
            wordWrap: { width: 220 } 
        });

        this.tooltipContainer = this.add.container(0, 0, [this.tooltipBg, this.tooltipText]);
        this.tooltipContainer.setDepth(3000); // 最高层级
        this.tooltipContainer.setScrollFactor(0);
        this.tooltipContainer.setVisible(false);
    }

    showTooltip(text, x, y) {
        if (!text || text === "(待填充)") return;

        this.tooltipText.setText(text);

        const bounds = this.tooltipText.getBounds();
        const padding = 12;
        const width = bounds.width + padding * 2;
        const height = bounds.height + padding * 2;

        // 绘制科技感边框
        this.tooltipBg.clear();
        this.tooltipBg.fillStyle(0x001122, 0.9); // 深蓝黑底
        this.tooltipBg.lineStyle(2, 0x00ccff, 1); // 霓虹蓝边
        this.tooltipBg.fillRoundedRect(0, 0, width, height, 4);
        this.tooltipBg.strokeRoundedRect(0, 0, width, height, 4);

        this.tooltipText.setPosition(padding, padding);

        // 智能定位防止溢出
        let finalX = x + 20;
        let finalY = y + 20;

        if (finalX + width > this.scale.width) finalX = x - width - 10;
        if (finalY + height > this.scale.height) finalY = y - height - 10;

        this.tooltipContainer.setPosition(finalX, finalY);
        this.tooltipContainer.setVisible(true);
    }

    hideTooltip() {
        if (this.tooltipContainer) {
            this.tooltipContainer.setVisible(false);
        }
    }
}