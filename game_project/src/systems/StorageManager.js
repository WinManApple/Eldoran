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