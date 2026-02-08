/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Protocol } from '../config/Protocol.js';

export class ClientCommunicator {
    constructor() {
        // 1. 建立频道 (不再依赖 window.opener)
        // 'rpg_sync' 是我们约定的公共频道名称，必须与 Core 一致
        this.channel = new BroadcastChannel('rpg_sync');
        
        this.handlers = new Map();
        this._initListener();
    }

    _initListener() {
        // 2. 监听频道消息
        this.channel.onmessage = (event) => {
            const packet = event.data;
            if (!packet || !packet.type) return;

            // 过滤：自己发出的消息自己也会收到，需要忽略吗？
            // 通常不需要，因为 RPC 层会根据 ID 过滤。
            // 但为了清晰，我们这里只处理接收到的逻辑。
            
            // console.log('[Client] 收到广播:', packet);

            if (this.handlers.has(packet.type)) {
                this.handlers.get(packet.type)(packet);
            }
        };
    }

    send(type, payload = {}, id = null) {
        // 3. 发送消息 (直接广播)
        const packet = {
            type,
            payload,
            id,
            timestamp: Date.now(),
            sender: 'client' // 标记发送者，方便调试
        };

        this.channel.postMessage(packet);
        return true; // 只要频道存在就是发送成功
    }

    on(type, callback) {
        this.handlers.set(type, callback);
    }
}