/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/map/Map3DCamera.js

/**
 * 3D 摄像机与投影控制器
 * 职责：负责管理观察角度、焦距、缩放，并将 3D 坐标投影为屏幕 2D 坐标。
 * 特性：完全解耦，不依赖具体节点数据，仅处理数学运算。
 */
export class Map3DCamera {
    /**
     * @param {Phaser.Scene} scene - Phaser 场景实例，用于获取屏幕尺寸
     */
    constructor(scene) {
        // --- 屏幕参数 ---
        this.viewportWidth = scene.scale.width;
        this.viewportHeight = scene.scale.height;
        this.centerX = this.viewportWidth / 2;
        this.centerY = this.viewportHeight / 2;

        // --- 摄像机参数 ---
        // 焦距：决定了透视感的强弱。数值越小，透视越夸张（广角）；数值越大，越接近正交视图。
        this.focalLength = 800; 
        
        // 基础缩放：控制整体物体的大小
        this.zoom = 1.0;
        this.minZoom = 0.5;
        this.maxZoom = 2.5;

        // --- 旋转参数 (弧度) ---
        // angleY: 绕 Y 轴旋转 (水平旋转地图)
        // angleX: 绕 X 轴旋转 (垂直倾角)
        this.rotation = {
            x: 0.2, // 初始带一点俯视倾角，更有立体感
            y: 0,
            z: 0
        };

        // --- 摄像机位移 (Pan) ---
        // 🟢 新增: 垂直位移，模拟电梯升降
        this.panY = 0; 
        
        // --- 缓动/阻尼参数 ---
        this.targetRotationY = 0;
        this.rotationDamping = 0.1;
        
        // 🟢 新增: 位移缓动
        this.targetPanY = 0;
        this.panDamping = 0.15; // 位移稍微有一点点重量感
    }

    /**
     * 更新摄像机状态 (通常在 update 循环中调用)
     * 用于处理惯性、平滑过渡等逻辑
     */
    update() {
        // 1. 平滑旋转 (Lerp)
        const diffRot = this.targetRotationY - this.rotation.y;
        if (Math.abs(diffRot) > 0.001) {
            this.rotation.y += diffRot * this.rotationDamping;
        } else {
            this.rotation.y = this.targetRotationY;
        }

        // 🟢 2. 平滑位移 (Lerp)
        const diffPan = this.targetPanY - this.panY;
        if (Math.abs(diffPan) > 0.1) {
            this.panY += diffPan * this.panDamping;
        } else {
            this.panY = this.targetPanY;
        }
    }

    /**
     * 核心方法：3D -> 2D 投影
     * @param {number} x - 世界坐标 X
     * @param {number} y - 世界坐标 Y
     * @param {number} z - 世界坐标 Z
     * @returns {Object|null} 返回 {x, y, scale, depth}，如果在摄像机背面则返回 null
     */
    project(x, y, z) {
        // 🟢 0. 应用摄像机位移 (View Translation)
        // 物体是静止的，摄像机向下移动(panY变大)，物体相对向上移动
        let ry = y - this.panY; 

        // 1. 旋转变换 (World Rotation)
        const cosY = Math.cos(this.rotation.y);
        const sinY = Math.sin(this.rotation.y);

        let rx = x * cosY - z * sinY;
        let rz = z * cosY + x * sinY;

        // 引入微弱的 X 轴倾角 (俯视/仰视)，增强 3D 感
        if (this.rotation.x !== 0) {
            const cosX = Math.cos(this.rotation.x);
            const sinX = Math.sin(this.rotation.x);
            
            const tempY = ry * cosX - rz * sinX;
            const tempZ = rz * cosX + ry * sinX;
            ry = tempY;
            rz = tempZ;
        }

        // 2. 深度计算 (Depth)
        // 物体在摄像机前方的距离 = 焦距 + Z轴深度 (假设摄像机位于 z = -focalLength)
        // 我们假设摄像机不动，物体动。rz 越大，离摄像机越远（或越近，取决于坐标系定义）。
        // 这里定义：rz > 0 为远，rz < 0 为近。
        // 为了防止除零错误，我们加上焦距作为偏移。
        const depth = this.focalLength + rz;

        // 3. 裁剪 (Culling)
        // 如果物体在摄像机后面 (depth <= 0)，则不渲染
        if (depth <= 10) return null;

        // 4. 透视投影 (Perspective Projection)
        // 核心公式：scale = focalLength / depth
        const scale = (this.focalLength / depth) * this.zoom;

        // 5. 屏幕映射 (Screen Mapping)
        // 将以 (0,0) 为中心的世界坐标映射到以 (centerX, centerY) 为中心的屏幕坐标
        const screenX = rx * scale + this.centerX;
        const screenY = ry * scale + this.centerY;

        return {
            x: screenX,
            y: screenY,
            scale: scale,
            depth: depth, // 用于 Z-Sorting (遮挡排序)
            z: rz         // 原始旋转后的 Z 值
        };
    }

    // ==========================================
    // 交互控制接口
    // ==========================================

    /**
     * 水平旋转摄像机
     * @param {number} deltaAngle - 旋转增量 (弧度)
     */
    rotate(deltaAngle) {
        this.targetRotationY += deltaAngle;
    }

    /**
     *  垂直位移摄像机
     * @param {number} deltaY - 位移增量
     */
    pan(deltaY) {
        this.targetPanY += deltaY;
    }

    /**
     * 设置缩放级别
     * @param {number} deltaZoom - 缩放增量
     */
    zoomChange(deltaZoom) {
        this.zoom += deltaZoom;
        // 限制缩放范围，防止穿模或过小
        if (this.zoom < this.minZoom) this.zoom = this.minZoom;
        if (this.zoom > this.maxZoom) this.zoom = this.maxZoom;
    }

    /**
     * 重置摄像机视角
     */
    reset() {
        this.targetRotationY = 0;
        this.zoom = 1.0;
        // 🟢 重置位移
        this.targetPanY = 0;
        this.panY = 0;
    }
    
    // ==========================================
    // 持久化接口 (Persistence)
    // ==========================================

    /**
     * 导出摄像机状态快照
     * @returns {Object} 包含恢复视角所需的核心数据
     */
    serialize() {
        return {
            zoom: this.zoom,
            
            // 垂直位移 (决定查看的层级深度)
            panY: this.panY,
            targetPanY: this.targetPanY, // 必须保存目标值，否则读档后会因插值逻辑导致镜头“跳楼”

            // 旋转状态
            rotation: { 
                x: this.rotation.x,
                y: this.rotation.y,
                z: this.rotation.z
            },
            targetRotationY: this.targetRotationY // 必须保存旋转目标
        };
    }

    /**
     * 恢复摄像机状态
     * @param {Object} data - serialize 返回的数据
     */
    deserialize(data) {
        if (!data) return;

        // 1. 恢复基础属性
        if (typeof data.zoom === 'number') this.zoom = data.zoom;
        if (typeof data.panY === 'number') this.panY = data.panY;

        // 2. 恢复旋转向量
        if (data.rotation) {
            this.rotation.x = (data.rotation.x !== undefined) ? data.rotation.x : this.rotation.x;
            this.rotation.y = (data.rotation.y !== undefined) ? data.rotation.y : this.rotation.y;
            this.rotation.z = (data.rotation.z !== undefined) ? data.rotation.z : this.rotation.z;
        }

        // 3. 恢复缓动目标 (关键防抖逻辑)
        // 如果存档里没有 target (比如旧存档)，则强制将其设为当前值，禁止发生任何惯性移动
        this.targetPanY = (data.targetPanY !== undefined) ? data.targetPanY : this.panY;
        this.targetRotationY = (data.targetRotationY !== undefined) ? data.targetRotationY : this.rotation.y;
        
        // 可选：重置一下阻尼速度（虽然 update 里是用位置差计算的，但为了保险）
        // 如果有独立的 velocity 属性也应该在这里清零
        
        console.log(`[Map3DCamera] 📷 视角已恢复 (PanY: ${this.panY.toFixed(1)}, Zoom: ${this.zoom.toFixed(2)})`);
    }
    
}
