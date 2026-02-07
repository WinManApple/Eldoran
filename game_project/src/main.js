/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/main.js
import { initVue } from './ui/App.js';
import { BootScene } from './scenes/BootScene.js';
import { ExplorationScene } from './scenes/ExplorationScene.js'; 
import { RPC } from './network/RPC.js';
import './systems/StorageManager.js'; 
//  引入世界管理器
import { MapManager } from './map/MapManager.js';
// 引入情节
import { Plot_Memory } from './LLM/memory/Plot_Memory.js';


// 初始化网络层
window.rpc = new RPC();
window.rpc.connect();

// 初始化世界管理器 (单例)
// 让它成为全局对象，方便 App.js (Vue) 和 ExplorationScene (Phaser) 共同访问
window.mapManager = new MapManager();

// 情节挂载
window.Plot_Memory = Plot_Memory;

// 启动 UI
initVue();

// 启动游戏引擎
const gameConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 1280,
    height: 720,
    transparent: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, ExplorationScene], 
    physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } }
};

window.game = new Phaser.Game(gameConfig);
