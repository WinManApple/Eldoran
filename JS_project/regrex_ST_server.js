/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// 注意,这个脚本为网关层脚本
// 用于正则替换渲染
// 它的作用是:
// 渲染“启动游戏”按钮（UI）。
// 管理 window.open 窗口句柄。
// 监听 postMessage 消息。
// 收到消息后，它直接调用其他脚本的某个公共函数就行


```
<html>
<div style="padding: 10px; text-align: center; border: 1px dashed #555; border-radius: 8px; margin: 10px 0; background: rgba(0,0,0,0.2);">
    <button 
        onclick="window.launchLocalGame()"
        style="
            background: linear-gradient(135deg, #9C27B0 0%, #E040FB 100%);
            color: white;
            border: none;
            padding: 10px 25px;
            font-size: 16px;
            font-weight: bold;
            border-radius: 25px;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(156, 39, 176, 0.4);
            transition: all 0.3s ease;
        "
    >
        <span>🔮</span>
        <span>点击开始游戏</span>
    </button>
</div>

<script>
    if (!window.launchLocalGame) {
        // 路径
        const RELATIVE_PATH = '/Eldoran/game_project/index.html';
        
        window.rpgWindow = null;

        window.launchLocalGame = function() {
            // ★关键修改：使用 window.top.location.origin 获取主窗口域名 (http://127.0.0.1:8000)
            // 这样就不会出现 /null/ 了
            const origin = window.top.location.origin;
            const fullUrl = origin + RELATIVE_PATH;
            
            console.log("[Gateway] 修正后的启动地址:", fullUrl);

            if (window.rpgWindow && !window.rpgWindow.closed) {
                window.rpgWindow.focus();
            } else {
                window.rpgWindow = window.open(fullUrl, 'PhaserRPG', 'width=1280,height=720');
            }
        };
    }
</script>
</html>
```