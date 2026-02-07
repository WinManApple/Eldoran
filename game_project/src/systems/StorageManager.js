/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/system/StorageManager.js
import { Protocol } from '../config/Protocol.js';

export class StorageManager {
    constructor() {
        console.log("[Storage] RPC 模式已就绪");
    }

    // 1. 获取列表
    async getList() {
        try {
            // 通过 RPC 呼叫 ST 端
            const list = await window.rpc.call(Protocol.STORAGE.LIST, null);
            return list || [];
        } catch (e) {
            console.error("[Storage] RPC getList 失败:", e);
            return [];
        }
    }

    // 2. 保存
    async save(slotId, data) {
        try {
            const success = await window.rpc.call(Protocol.STORAGE.SAVE, {
                slotId: slotId,
                data: data
            });
            return success;
        } catch (e) {
            console.error("[Storage] RPC save 失败:", e);
            throw e;
        }
    }

    // 3. 读取
    async load(slotId) {
        try {
            const data = await window.rpc.call(Protocol.STORAGE.LOAD, slotId);
            return data;
        } catch (e) {
            console.error("[Storage] RPC load 失败:", e);
            throw e;
        }
    }

    // 4. 删除
    async delete(slotId) {
        try {
            const success = await window.rpc.call(Protocol.STORAGE.DELETE, slotId);
            return success;
        } catch (e) {
            console.error("[Storage] RPC delete 失败:", e);
            return false;
        }
    }
}

// 挂载
window.gameStorage = new StorageManager();