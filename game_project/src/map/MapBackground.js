/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/map/MapBackground.js

/**
 * 3D 视差深空背景 (MapBackground)
 * 职责：
 * 1. 程序化生成深邃的星空渐变背景 (无素材)。
 * 2. 渲染分层星空，并根据 Map3DCamera 的旋转角度实现视差滚动。
 */
export class MapBackground {
    constructor(scene) {
        this.scene = scene;
        this.width = scene.scale.width;
        this.height = scene.scale.height;

        // 星空层级数据
        // factor: 视差系数 (越大移动越快)
        // count: 星星数量
        // alpha: 基础透明度
        this.layers = [
            { name: 'far', factor: 50, count: 200, alpha: 0.4, size: 1, data: [] },
            { name: 'mid', factor: 120, count: 100, alpha: 0.7, size: 2, data: [] },
            { name: 'near', factor: 250, count: 40, alpha: 1.0, size: 3, data: [] }
        ];
        
        // 渲染容器
        this.starGraphics = null;
    }

    create() {
        // 1. 创建深空渐变背景 (无需外部素材)
        this._createDeepSpaceGradient();

        // 2. 初始化星空绘制层
        this.starGraphics = this.scene.add.graphics();
        this.starGraphics.setScrollFactor(0); // 固定在屏幕上
        this.starGraphics.setDepth(-90);      // 位于渐变背景之上，地图节点之下

        // 3. 生成星星数据
        this._generateStars();
    }

    /**
     * 在 update 循环中调用，实现视差滚动
     */
    update() {
        // 获取 MapRenderer 中的相机引用
        const mapRenderer = this.scene.mapRenderer;
        if (!mapRenderer || !mapRenderer.camera) return;

        // 1. 获取相机参数
        const rotationY = mapRenderer.camera.rotation.y; // 水平旋转
        const panY = mapRenderer.camera.panY;           // 🟢 垂直位移

        // 重绘星空
        this.starGraphics.clear();

        this.layers.forEach(layer => {
            this.starGraphics.fillStyle(0xFFFFFF, layer.alpha);

            // 2. 计算位移量 (Parallax Offset)
            // X轴：基于旋转角度
            const offsetX = -rotationY * layer.factor; 
            // 🟢 Y轴：基于垂直位移 (系数设小一点，0.5倍率，避免背景动得比前景还快)
            // 负号逻辑：摄像机向下移(panY增加)，星星应该向上跑，产生下潜感
            const offsetY = -panY * 0.5; 

            layer.data.forEach(star => {
                // 3. 计算最终坐标 (含无限滚动逻辑)
                
                // --- X轴处理 ---
                let finalX = (star.x + offsetX) % this.width;
                if (finalX < 0) finalX += this.width;

                // 🟢 --- Y轴处理 ---
                let finalY = (star.y + offsetY) % this.height;
                if (finalY < 0) finalY += this.height;

                // 4. 闪烁效果
                const twinkle = Math.sin(this.scene.time.now * 0.005 + star.randomPhase);
                const currentAlpha = layer.alpha + (twinkle * 0.3);

                this.starGraphics.fillStyle(0xFFFFFF, Phaser.Math.Clamp(currentAlpha, 0.1, 1));
                
                // 5. 绘制
                this.starGraphics.fillRect(finalX, finalY, layer.size, layer.size);
            });
        });
    }

    // ==========================================
    // 内部生成逻辑
    // ==========================================

    /**
     * 使用 Canvas Texture 生成径向渐变背景
     */
    _createDeepSpaceGradient() {
        const textureKey = 'bg_deep_space';
        
        // 如果纹理已存在，直接使用 (防止重复生成)
        if (!this.scene.textures.exists(textureKey)) {
            const canvasTexture = this.scene.textures.createCanvas(textureKey, this.width, this.height);
            const ctx = canvasTexture.getContext();

            // 创建径向渐变: 中心是深紫/蓝，边缘是纯黑
            // 参数: x0, y0, r0, x1, y1, r1
            const grd = ctx.createRadialGradient(
                this.width / 2, this.height / 2, 0, 
                this.width / 2, this.height / 2, this.width * 0.8
            );

            // 配色方案：魔界深空
            grd.addColorStop(0, '#1a0b2e');   // 中心: 深邃紫
            grd.addColorStop(0.4, '#0f0518'); // 过渡: 暗紫黑
            grd.addColorStop(1, '#000000');   // 边缘: 纯黑

            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, this.width, this.height);
            
            canvasTexture.refresh();
        }

        const bg = this.scene.add.image(0, 0, textureKey);
        bg.setOrigin(0);
        bg.setScrollFactor(0);
        bg.setDepth(-100); // 最底层
    }

    _generateStars() {
        this.layers.forEach(layer => {
            for (let i = 0; i < layer.count; i++) {
                layer.data.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height,
                    randomPhase: Math.random() * Math.PI * 2 // 用于闪烁相位
                });
            }
        });
    }
}