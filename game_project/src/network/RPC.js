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

import { ClientCommunicator } from './ClientCommunicator.js';
import { Protocol } from '../config/Protocol.js';
import { store } from '../ui/modules/store.js'; 

export class RPC {
    constructor() {
        this.comm = new ClientCommunicator();
        this.pendingRequests = new Map(); 
        
        // 用于管理握手定时器，防止多重启动
        this.handshakeTimer = null;

        this._setupRoutes();
    }

    _setupRoutes() {
        this.comm.channel.onmessage = (event) => {
            const packet = event.data;
            // 过滤：只处理服务端发来的消息
            if (!packet || packet.sender !== 'server') return;

            // [逻辑 A] 处理握手回执 (SYS:PAIRED)
            if (packet.type === Protocol.SYS.PAIRED) {
                this._handleConnectionSuccess();
            }

            // [逻辑 B] 处理 RPC 响应 (Resolving Promises)
            if (packet.id && this.pendingRequests.has(packet.id)) {
                const { resolve, timer } = this.pendingRequests.get(packet.id);
                clearTimeout(timer);
                this.pendingRequests.delete(packet.id);
                resolve(packet.payload);
            }
        };
    }

    /**
     * 处理连接成功逻辑
     * 核心原则：只改变状态，不执行业务逻辑（如读取存档）
     */
    _handleConnectionSuccess() {
        // 防止重复触发
        if (store.aiStatus.connectionState === 'connected') return;

        console.log("✅ [RPC] 连接已建立");
        
        // 1. 更新 UI 状态
        store.aiStatus.connectionState = 'connected';
        store.debugMsg = "服务已连接";

        // 2. 🛑 停止广播握手请求 (停止刷屏)
        if (this.handshakeTimer) {
            clearInterval(this.handshakeTimer);
            this.handshakeTimer = null;
        }
    }

    /**
     * 启动连接流程
     * 核心原则：发送握手包直到收到回执
     */
    connect() {
        // 如果已经是连接状态或正在握手，则跳过
        if (this.handshakeTimer || store.aiStatus.connectionState === 'connected') return;

        store.aiStatus.connectionState = 'connecting';
        store.debugMsg = "正在连接服务端...";
        
        console.log("[RPC] 开始广播握手信号...");

        // 每 3 秒发送一次握手，直到 _handleConnectionSuccess 被触发
        this.handshakeTimer = setInterval(() => {
            this.comm.send(Protocol.SYS.HANDSHAKE, { version: "2.0.0" });
        }, 3000);
    }

    /**
     * 通用远程调用方法
     */
    call(method, params = {}, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const id = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            
            const timer = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    console.warn(`[RPC] 调用超时: ${method}`);
                    // 可选：reject(new Error("Timeout")); 
                }
            }, timeout);

            this.pendingRequests.set(id, { resolve, reject, timer });
            this.comm.send(method, params, id);
        });
    }
}