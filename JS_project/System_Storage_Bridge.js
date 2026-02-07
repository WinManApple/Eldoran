/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// System_Storage_Bridge.js
// 作用：监听游戏端的存档 RPC 请求，代理访问后端 API
// 运行环境：SillyTavern (JSR)

(function() {
    console.log("💾 [Storage_Bridge] 正在启动...");

    // 1. 定义协议 (需与 Protocol.js 一致)
    const Protocol = {
        STORAGE: {
            SAVE: 'STORAGE:SAVE',
            LOAD: 'STORAGE:LOAD',
            LIST: 'STORAGE:LIST',
            DELETE: 'STORAGE:DELETE'
        }
    };

    // 后端插件的 API 地址
    const API_BASE = '/api/plugins/rpg_save_system';

    // 2. 启动广播频道
    const bus = new BroadcastChannel('rpg_sync');

    bus.onmessage = async (event) => {
        const packet = event.data;
        if (!packet || !packet.type || packet.sender !== 'client') return;

        // console.log(`💾 [Storage_Bridge] 收到请求: ${packet.type}`);

        switch (packet.type) {
            case Protocol.STORAGE.LIST:
                await handleList(bus, packet.id);
                break;
            case Protocol.STORAGE.SAVE:
                await handleSave(bus, packet.id, packet.payload);
                break;
            case Protocol.STORAGE.LOAD:
                await handleLoad(bus, packet.id, packet.payload);
                break;
            case Protocol.STORAGE.DELETE:
                await handleDelete(bus, packet.id, packet.payload);
                break;
        }
    };
    
    console.log("✅ [Storage_Bridge] 监听中...");

    // ================= 业务逻辑 =================

    async function handleList(bus, reqId) {
        try {
            const res = await fetch(`${API_BASE}/list`);
            const json = await res.json();
            _reply(bus, Protocol.STORAGE.LIST, json.list || [], reqId);
        } catch (e) {
            console.error("获取列表失败", e);
            _reply(bus, 'SYS:ERROR', e.message, reqId);
        }
    }

    async function handleSave(bus, reqId, payload) {
        try {
            const res = await fetch(`${API_BASE}/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload) // { slotId, data }
            });
            const json = await res.json();
            _reply(bus, Protocol.STORAGE.SAVE, json.success, reqId);
        } catch (e) {
            _reply(bus, 'SYS:ERROR', e.message, reqId);
        }
    }

    async function handleLoad(bus, reqId, slotId) {
        try {
            const res = await fetch(`${API_BASE}/load/${slotId}`);
            const json = await res.json();
            _reply(bus, Protocol.STORAGE.LOAD, json.data, reqId);
        } catch (e) {
            _reply(bus, 'SYS:ERROR', e.message, reqId);
        }
    }

    async function handleDelete(bus, reqId, slotId) {
        try {
            const res = await fetch(`${API_BASE}/delete/${slotId}`, { method: 'DELETE' });
            const json = await res.json();
            _reply(bus, Protocol.STORAGE.DELETE, json.success, reqId);
        } catch (e) {
            _reply(bus, 'SYS:ERROR', e.message, reqId);
        }
    }

    function _reply(bus, type, payload, id) {
        bus.postMessage({
            type: type,
            payload: payload,
            id: id,
            timestamp: Date.now(),
            sender: 'server'
        });
    }
})();