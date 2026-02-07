/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/map/MapRenderer.js
import { NodeType, NodeState } from './MapData.js';
import { InputBlocker } from '../systems/InputBlocker.js';
import { Map3DCamera } from './Map3DCamera.js';
import { Map3DGeometries } from './Map3DGeometries.js';

/**
 * 3D 地图渲染器 (MapRenderer) - v4.0 Holographic Spiral
 * 核心机制：
 * 1. 布局：使用螺旋塔 (Spiral Tower) 算法计算节点 (x,y,z)。
 * 2. 渲染：使用 Graphics 实时绘制旋转的线框几何体 (Wireframes)。
 * 3. 交互：通过投影坐标实时同步隐形 Hitbox 的位置，支持 InputBlocker。
 */
export class MapRenderer {
    /**
     * @param {Phaser.Scene} scene 
     */
    constructor(scene) {
        this.scene = scene;
        
        // --- 核心模块 ---
        this.camera = new Map3DCamera(scene);
        this.geometries = new Map3DGeometries();
        
        // 从场景 Cache 中读取并解析 OBJ 数据
        // 这会将 BootScene 加载的文本转化为 vertices/edges 供渲染使用
        this.geometries.initFromScene(scene);

        // --- 渲染容器 ---
        // 背景连线层 (最底层)
        this.lineGraphics = scene.add.graphics();
        // 节点线框层 (中间层)
        this.nodeGraphics = scene.add.graphics();
        
        // --- 交互对象池 ---
        // 存储 { nodeId: GameObject }，用于点击检测
        this.hitboxes = new Map();
        
        // --- 视觉配置 ---
        this.colors = {
            [NodeType.ROOT]:       0xE67E22, // 橙
            [NodeType.COMBAT]:     0xE74C3C, // 红
            [NodeType.EVENT_CHOICE]: 0x9B59B6, // 紫
            [NodeType.EVENT_H]:      0xFF69B4, // 粉
            [NodeType.EVENT_QUEST]:  0xF1C40F, // 金
            [NodeType.RESOURCE]:   0x2ECC71, // 绿
            [NodeType.SHOP]:       0xF39C12, // 黄
            [NodeType.REST]:       0xD35400, // 赭
            [NodeType.PORTAL_NEXT_FLOOR]: 0x1ABC9C, // 青
            [NodeType.PORTAL_NEXT_CHAPTER]: 0xFFFFFF, // 白
            [NodeType.LOCATION]: 0x3498DB, // 地标节点颜色：天青色 / 宝石蓝 (体现中立与冷静)
            LOCKED: 0x7F8C8D, // 灰
            VISITED: 0x95A5A6  // 褪色
        };

        // --- 动画状态 ---
        this.time = 0; // 用于驱动自转动画
        
        // 初始化输入监听
        this._initInput();
    }

    // ==========================================
    // 1. 初始化与布局 (Layout)
    // ==========================================

    /**
     * 清理当前场景 (切换地图时调用)
     */
    clear() {
        this.lineGraphics.clear();
        this.nodeGraphics.clear();
        
        // 销毁所有交互热区
        this.hitboxes.forEach(sprite => sprite.destroy());
        this.hitboxes.clear();
        
        // 重置相机
        this.camera.reset();
    }

    /**
     * 初始化 3D 螺旋布局
     * 这里的逻辑是"一次性"的，计算好坐标后挂载到 node 实例上
     */
    init3DLayout() {
        if (!window.mapManager) return;
        const nodes = window.mapManager.getCurrentNodes();
        if (!nodes || nodes.length === 0) return;

        // --- 深渊环界布局参数 ---
        const RADIUS_MAIN = 350;     // 主环半径
        const RADIUS_EXTEND = 550;   // 支线延伸半径 (350 + 200)
        const LAYER_HEIGHT = 250;    // 层高 (垂直间距)
        
        // 预处理：按层级分组
        const layers = {};
        nodes.forEach(node => {
            if (!layers[node.layerIndex]) layers[node.layerIndex] = [];
            layers[node.layerIndex].push(node);
        });

        // 遍历每一层进行布局
        Object.keys(layers).forEach(layerIndexStr => {
            const layerIndex = parseInt(layerIndexStr);
            const allNodes = layers[layerIndex];

            // 🟢 1. 节点分类：分离主线节点与支线挂载点
            // 判定依据：ID包含 "_sub_" 且类型为传送门 (这是 SubMapService 生成的特征)
            // 如果你的支线节点 ID 命名规则不同，请调整此处判断
            const branchNodes = allNodes.filter(n => n.id.includes('_sub_') && n.type === NodeType.PORTAL_NEXT_CHAPTER);
            const mainNodes = allNodes.filter(n => !branchNodes.includes(n));

            // 🟢 2. 计算层级高度 (Y轴向下延伸)
            // Layer 0 = 0, Layer 1 = 250, Layer 2 = 500 ...
            const layerY = layerIndex * LAYER_HEIGHT;

            // 🟢 3. 布局主环 (Main Ring) - 均匀分布
            if (mainNodes.length > 0) {
                mainNodes.forEach((node, idx) => {
                    // 计算角度：均匀切分 2PI
                    // 为了美观，可以加一个初始相位偏移 (Math.PI / 2) 让第一个节点在正下方或正上方
                    const angle = (idx / mainNodes.length) * Math.PI * 2 + (Math.PI / 2);
                    
                    node._pos3D = {
                        x: Math.cos(angle) * RADIUS_MAIN,
                        z: Math.sin(angle) * RADIUS_MAIN,
                        y: layerY
                    };
                    
                    // 记录布局角度，供后续支线或连线参考
                    node._layoutAngle = angle;
                    
                    // 初始化交互热区
                    this._createHitbox(node);
                });
            }

            // 🟢 4. 布局支线 (Radial Extension) - 径向外挂
            if (branchNodes.length > 0) {
                branchNodes.forEach(node => {
                    // A. 寻找锚点 (连接它的父节点)
                    // 通常支线入口是由上一层的某个节点指向的，或者由本层的某个节点指向
                    // 我们遍历所有节点寻找指向者 (Predecessor)
                    let parentNode = null;
                    
                    // 优先在上一层找
                    const prevLayer = layers[layerIndex - 1];
                    if (prevLayer) {
                        parentNode = prevLayer.find(p => p.nextNodes.includes(node.id));
                    }
                    // 如果没找到，在同层找 (极少数情况)
                    if (!parentNode) {
                        parentNode = mainNodes.find(p => p.nextNodes.includes(node.id));
                    }

                    // B. 确定角度
                    let angle = 0;
                    if (parentNode && parentNode._layoutAngle !== undefined) {
                        // 继承父节点的角度 (视觉上形成直线延伸)
                        angle = parentNode._layoutAngle;
                    } else {
                        // 兜底：如果找不到父节点，就根据它在数组中的位置随便算一个
                        angle = (branchNodes.indexOf(node) / branchNodes.length) * Math.PI * 2;
                    }

                    // C. 设置坐标 (半径更大)
                    node._pos3D = {
                        x: Math.cos(angle) * RADIUS_EXTEND,
                        z: Math.sin(angle) * RADIUS_EXTEND,
                        y: layerY // 保持同层高度，或稍微下沉一点 y: layerY + 20
                    };

                    node._layoutAngle = angle;
                    this._createHitbox(node);
                });
            }
        });

        // 🟢 5. 初始化动画相位 (保持原有逻辑)
        nodes.forEach(node => {
            if (!node._animPhase) node._animPhase = Math.random() * Math.PI * 2;
        });
    }

    _createHitbox(node) {
        // 创建一个透明的圆形作为点击区域
        // 使用 Image 而不是 Zone，方便调试 (setAlpha(0.5) 即可见)
        // 实际上我们用一张空白纹理或者画一个圆
        const hitbox = this.scene.add.circle(0, 0, 20, 0xff0000, 0); 
        hitbox.setInteractive({ cursor: 'pointer' });
        hitbox.setDepth(100); // 初始深度，update 中会实时更新

        // 绑定事件
        hitbox.on('pointerdown', () => {
            if (InputBlocker.isBlocked()) return; // 🛡️ 防击穿核心
            if (this.scene.handleNodeClick) {
                this.scene.handleNodeClick(node);
            }
        });

        hitbox.on('pointerover', () => {
            if (InputBlocker.isBlocked()) return;
            this._handleHover(node, true);
        });

        hitbox.on('pointerout', () => {
            // 移出时不需要防击穿，应该总是允许取消高亮
            this._handleHover(node, false);
        });

        this.hitboxes.set(node.id, hitbox);
    }

    // ==========================================
    // 2. 核心渲染循环 (Render Loop)
    // ==========================================

    /**
     * 必须在 Scene.update() 中每帧调用
     * @param {number} time - 系统时间
     * @param {number} delta - 帧间隔
     */
    update(time, delta) {
        if (!window.mapManager) return;
        const nodes = window.mapManager.getCurrentNodes();
        if (!nodes || nodes.length === 0) return;

        this.time += delta * 0.001; // 转为秒

        // 1. 更新相机逻辑 (惯性、阻尼)
        this.camera.update();

        // 2. 清空画布
        this.lineGraphics.clear();
        this.nodeGraphics.clear();

        // 3. 投影计算 (Projection Pass)
        // 先计算所有节点的 2D 坐标，存起来供连线和绘制使用
        const projectedNodes = [];

        nodes.forEach(node => {
            if (!node._pos3D) return;

            // 调用相机投影
            const p = this.camera.project(node._pos3D.x, node._pos3D.y, node._pos3D.z);
            
            if (p) {
                projectedNodes.push({
                    node: node,
                    x: p.x,
                    y: p.y,
                    scale: p.scale,
                    depth: p.depth,
                    z: p.z // 原始旋转后的 Z，用于排序
                });
            } else {
                // 如果在相机背面，隐藏对应的 Hitbox
                const hitbox = this.hitboxes.get(node.id);
                if (hitbox) hitbox.setVisible(false);
            }
        });

        // 4. Z轴排序 (Painter's Algorithm)
        // 远的先画，近的后画
        projectedNodes.sort((a, b) => b.depth - a.depth);

        // 5. 绘制连线 (Draw Lines)
        //  A. 绘制同层圆环装饰线 (The Ring Connection)
        // 这会让每一层的节点看起来连接在一个圆环轨道上
        const layerGroups = {};
        projectedNodes.forEach(p => {
            if (p.node.state === NodeState.LOCKED) return;
            // 排除支线节点(支线通常悬浮在环外)，只连接主环，防止连线穿模
            if (p.node.id.includes('_sub_')) return;
            
            const l = p.node.layerIndex;
            if (!layerGroups[l]) layerGroups[l] = [];
            layerGroups[l].push(p);
        });

        // 设置圆环连线样式：非常淡的青色，像轨道一样
        this.lineGraphics.lineStyle(1, 0x4fc3f7, 0.15); 

        Object.values(layerGroups).forEach(group => {
            if (group.length < 2) return;
            // 按布局角度排序，确保顺时针连接
            group.sort((a, b) => (a.node._layoutAngle || 0) - (b.node._layoutAngle || 0));
            
            this.lineGraphics.beginPath();
            const start = group[0];
            this.lineGraphics.moveTo(start.x, start.y);

            for (let i = 1; i < group.length; i++) {
                const p = group[i];
                this.lineGraphics.lineTo(p.x, p.y);
            }
            // 闭合圆环 (最后一个连回第一个)
            this.lineGraphics.lineTo(start.x, start.y);
            this.lineGraphics.strokePath();
        });

        // 🟢 B. 绘制原有的逻辑连线 (NextNodes)
        // 恢复原有样式
        this.lineGraphics.lineStyle(2, 0x4fc3f7, 0.3);

        projectedNodes.forEach(pItem => {
            const node = pItem.node;
            if (node.state === NodeState.LOCKED) return;

            node.nextNodes.forEach(nextId => {
                const targetP = projectedNodes.find(item => item.node.id === nextId);
                
                if (targetP && targetP.node.state !== NodeState.LOCKED) {
                    this.lineGraphics.beginPath();
                    this.lineGraphics.moveTo(pItem.x, pItem.y);
                    this.lineGraphics.lineTo(targetP.x, targetP.y);
                    this.lineGraphics.strokePath();
                }
            });
        });

        // 6. 绘制节点与更新交互 (Draw Nodes & Hitboxes)
        projectedNodes.forEach(pItem => {
            const { node, x, y, scale, depth } = pItem;
            
            // A. 同步 Hitbox 位置
            const hitbox = this.hitboxes.get(node.id);
            if (hitbox) {
                hitbox.setVisible(true);
                hitbox.setPosition(x, y);
                hitbox.setScale(scale); 
                // 设置输入系统的 hitArea (半径随缩放变化)
                hitbox.input.hitArea.radius = 25; 
                // 设置深度，保证近的节点优先响应点击
                hitbox.setDepth(1000 - depth); 
            }

            // B. 绘制 3D 线框
            this._drawWireframe(node, x, y, scale);
        });
    }

    /**
     * 绘制单个节点的线框模型
     */
    _drawWireframe(node, centerX, centerY, scale) {
        // 1. 获取基础几何数据
        const geometry = this.geometries.getGeometry(node.type);
        if (!geometry) return;

        // 🟢 2. 视觉放大处理 (Scale Up)
        // 原始 scale 是基于真实透视的，可能太小。
        // 我们乘以一个系数，让图标在视觉上更饱满，便于点击。
        const VISUAL_SCALE_MULTIPLIER = 1.5; 
        const visualScale = scale * VISUAL_SCALE_MULTIPLIER;

        // 3. 决定颜色与状态样式
        let color = this.colors[node.type] || 0xFFFFFF;
        
        // [新增] 特殊逻辑：支线传送门颜色区分
        // 虽然它们与主线出口共享 PORTAL_NEXT_CHAPTER 类型和模型，但使用紫色以示区别
        if (node.type === NodeType.PORTAL_NEXT_CHAPTER && node.id.includes('_sub_')) {
            color = 0xDA70D6; // Orchid / 兰花紫 (区别于主线的纯白 0xFFFFFF)
        }

        let alpha = 1.0;
        let lineWidth = 2;

        if (node.state === NodeState.LOCKED) {
            return; // 迷雾中不绘制
        } 
        // 🟢 当前节点：醒目高亮
        else if (node.state === NodeState.CURRENT) {
            color = 0x00FFFF; // 亮青色 (Cyan)
            // 呼吸灯特效：线宽在 4 到 6 之间波动
            lineWidth = 5 + Math.sin(this.time * 8) * 1.5; 
            alpha = 1.0;
        } 
        // 🟢 已探索节点：白色微光
        else if (node.state === NodeState.VISITED) {
            color = 0xFFFFFF; // 纯白
            alpha = 0.4;      // 低透明度 (微光)
            lineWidth = 2;    // 标准线宽
        }

        this.nodeGraphics.lineStyle(lineWidth * visualScale, color, alpha);

        // 4. 计算局部自转
        let rotationSpeed = 1.0;
        if (node.type === NodeType.COMBAT) rotationSpeed = 3.0;
        if (node.type === NodeType.ROOT) rotationSpeed = 0.2;
        // 当前节点转得稍微快一点，增加活跃感
        if (node.state === NodeState.CURRENT) rotationSpeed *= 1.5;
        // 地标节点旋转速度：极慢，像空间站或宏伟建筑一样
        if (node.type === NodeType.LOCATION) rotationSpeed = 0.15;

        const timeAngle = this.time * rotationSpeed + node._animPhase;
        const cosR = Math.cos(timeAngle);
        const sinR = Math.sin(timeAngle);

        // 5. 变换并绘制
        const transformedVertices = geometry.vertices.map(v => {
            // 本地旋转 (绕 Y 轴)
            const rx = v.x * cosR - v.z * sinR;
            const rz = v.z * cosR + v.x * sinR;
            const ry = v.y; 

            // 投影到屏幕 (使用放大后的 visualScale)
            return {
                x: centerX + rx * visualScale,
                y: centerY + ry * visualScale
            };
        });

        // 绘制连线
        this.nodeGraphics.beginPath(); // 优化：一次 beginPath 可能会把所有线连在一起，这里逐个几何体 begin 比较安全
        geometry.edges.forEach(edge => {
            const v1 = transformedVertices[edge[0]];
            const v2 = transformedVertices[edge[1]];
            
            // 移动到起点 -> 画线到终点
            this.nodeGraphics.moveTo(v1.x, v1.y);
            this.nodeGraphics.lineTo(v2.x, v2.y);
        });
        this.nodeGraphics.strokePath();
        
        // 🟢 可选：为当前节点添加一个额外的实心核心，使其更显眼
        if (node.state === NodeState.CURRENT) {
            this.nodeGraphics.fillStyle(color, 0.2); // 半透明填充
            // 简单画个中心圆或者复用顶点填充(复杂)
            // 这里简单画个小光点
            this.nodeGraphics.fillCircle(centerX, centerY, 5 * visualScale);
        }
    }

    /**
     * [新增] 动态添加节点到场景 (适配 SubMapService)
     * 核心职责：计算新节点的 3D 坐标 (_pos3D) 并注册交互热区
     * @param {MapNode} node - 已加入 MapData 但尚未渲染的新节点
     * @param {MapNode|null} anchorNode - 锚点节点 (可选，用于辅助定位)
     */
    addNodeToScene(node, anchorNode) {
        // 1. 防重校验
        if (this.hitboxes.has(node.id)) return;

        // 2. 计算 3D 坐标 (模拟 init3DLayout 中的支线布局逻辑)
        // 必须赋予 _pos3D，否则 update() 循环会跳过绘制
        const RADIUS_EXTEND = 550; // 与 init3DLayout 保持一致
        const LAYER_HEIGHT = 250;
        
        const layerY = node.layerIndex * LAYER_HEIGHT;
        
        // 尝试寻找父节点以确定辐射角度
        let parentNode = anchorNode;
        if (!parentNode && window.mapManager) {
             const nodes = window.mapManager.getCurrentNodes();
             // 在当前地图节点中寻找谁指向了这个新节点
             parentNode = nodes.find(n => n.nextNodes && n.nextNodes.includes(node.id));
        }

        let angle = 0;
        // 如果找到了父节点，就继承它的角度，形成直线延伸的视觉效果
        if (parentNode && parentNode._layoutAngle !== undefined) {
             angle = parentNode._layoutAngle;
        } else {
             // 兜底：如果找不到父节点，随机分配一个角度
             angle = Math.random() * Math.PI * 2;
        }

        // 写入 3D 坐标属性
        node._pos3D = {
            x: Math.cos(angle) * RADIUS_EXTEND,
            z: Math.sin(angle) * RADIUS_EXTEND,
            y: layerY // 保持同层高度
        };
        
        // 记录辅助属性
        node._layoutAngle = angle;
        node._animPhase = Math.random() * Math.PI * 2; // 随机动画相位

        // 3. 创建交互热区 (Hitbox)
        // 这样 update() 循环就能在下一帧正确同步它的位置了
        this._createHitbox(node);
        
        console.log(`[MapRenderer] 动态节点已挂载: ${node.name} @ Layer ${node.layerIndex}`);
    }

    /**
     * [新增] 从场景中移除节点 (适配 SubMapService)
     * @param {string} nodeId 
     */
    removeNodeFromScene(nodeId) {
        // 1. 销毁交互热区
        const hitbox = this.hitboxes.get(nodeId);
        if (hitbox) {
            hitbox.destroy();
            this.hitboxes.delete(nodeId);
        }
        
        // 2. 无需手动清除连线或图形
        // 因为 MapRenderer.update() 每一帧都会 clear() 并根据 getCurrentNodes() 重绘
        // 只要 MapManager 从数据层删除了该节点，下一帧渲染自然就消失了
    }

    // ==========================================
    // 3. 交互逻辑 (Input Handling)
    // ==========================================

    // [修改后] 
    _initInput() {
        // 统一监听 pointermove 处理旋转和位移
        this.scene.input.on('pointermove', (pointer) => {
            // 🛡️ 防击穿检查
            if (InputBlocker.isBlocked()) return;

            // 🟢 1. 垂直拖拽 (左键拖动) -> 浏览深层地图
            if (pointer.isDown && !pointer.middleButtonDown()) {
                // 灵敏度
                const PAN_SENSITIVITY = 1.5; 
                
                // 计算增量 (注意方向：鼠标往上推，视角应该往下走，即 y 增加)
                // pointer.velocity.y 有时会有噪音，用 position 差值更稳
                const deltaY = pointer.y - pointer.prevPosition.y;
                
                // 调用 Camera 的 pan 方法 (负号为了符合"拖拽画布"的直觉：鼠标往上拖，视野往下移)
                this.camera.pan(-deltaY * PAN_SENSITIVITY);
            }

            // 🟢 2. 水平旋转 (中键拖动) -> 环视
            else if (pointer.middleButtonDown()) {
                const ROTATE_SENSITIVITY = 0.01;
                this.camera.rotate(pointer.velocity.x * ROTATE_SENSITIVITY);
            }
        });

        // 3. 滚轮缩放 (保持不变)
        this.scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
            if (InputBlocker.isBlocked()) return;
            
            const zoomDir = deltaY > 0 ? -0.1 : 0.1;
            this.camera.zoomChange(zoomDir);
        });
    }

    _handleHover(node, isOver) {
        // [新增] 迷雾判定：如果节点处于锁定状态，视为不可见，不显示任何信息
        if (node.state === NodeState.LOCKED) {
            if (this.scene.hideTooltip) {
                this.scene.hideTooltip();
            }
            return;
        }

        if (this.scene.showTooltip && isOver) {
            // 🟢 [修改] 构建复合文本：同时显示名称与描述
            const nameStr = node.name || "未知节点";
            let descStr = node.payload?.description || "";
            
            // 清洗数据：如果描述是初始占位符，或者描述与名字完全一致（防止重复），则视为无描述
            if (descStr === "(待填充)" || descStr === nameStr) {
                descStr = "";
            }

            // 组合文本
            const finalTooltip = descStr ? `${nameStr}\n${descStr}` : nameStr;

            // 获取 Hitbox 的屏幕坐标
            const hitbox = this.hitboxes.get(node.id);
            if (hitbox) {
                this.scene.showTooltip(finalTooltip, hitbox.x, hitbox.y);
            }
        } else if (this.scene.hideTooltip && !isOver) {
            this.scene.hideTooltip();
        }
    }
    
}