/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/scenes/BootScene.js
import { store } from '../ui/modules/store.js';
import { Map3DGeometries } from '../map/Map3DGeometries.js';

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // 这里以后用来加载图片和音乐
        // [新增] 自动批量加载 3D 地图模型 (.obj 视为 text 加载)
        // 确保 assets/maps/ 目录下存在对应的 .obj 文件
        console.log("[Phaser] Preloading assets...");
        Object.entries(Map3DGeometries.MAPPING).forEach(([type, key]) => {
            const path = `assets/maps/${key}.obj`;
            this.load.text(key, path);
            console.log(`[BootScene] Loading OBJ: ${key} -> ${path}`);
        });
        console.log("[Phaser] Preload Succeess");
    }

    create() {

        // 2. 通知 Vue
        store.phaserStatus = "Phaser 已启动 (资源就绪)";
        console.log("[Phaser] BootScene created.");
        
        // 我们就在这里停下，等待玩家在 HTML 界面点击 "开始新征程"
        // 点击后，App.js 里的 startGame() 会手动调用 scene.start('ExplorationScene')
    }
}