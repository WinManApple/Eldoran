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