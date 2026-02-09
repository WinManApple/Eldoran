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

// 注意,这个脚本为网关层脚本
// 用于正则替换渲染
// 它的作用是:
// 渲染“启动游戏”按钮（UI）。
// 管理 window.open 窗口句柄。
// 监听 postMessage 消息。
// 收到消息后，它直接调用其他脚本的某个公共函数就行

/<launch>(.*?)<\/launch>/g

```
<html>
<head>
    <style>
        /* 全局样式 - 解决黑色空缺问题 */
        body {
            margin: 0;
            padding: 0;
            width: 100vw;
            height: 100vh;
            /* 确保背景填满全屏 */
            background-color: #f4e4bc; 
            background-image: radial-gradient(circle at center, rgba(255,255,255,0.4) 0%, rgba(0,0,0,0.1) 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: "Palatino Linotype", "Book Antiqua", serif;
            color: #2c1e14;
            overflow: hidden; /* 防止出现滚动条 */
        }

        /* 核心卡片 - 宽而短，轻量化 */
        .card-container {
            background: rgba(244, 228, 188, 0.95);
            border: 3px double #d4af37; /* 金色双线边框 */
            box-shadow: 0 20px 50px rgba(0,0,0,0.3);
            width: 90%;
            max-width: 600px; /* 限制最大宽度 */
            padding: 40px;
            text-align: center;
            position: relative;
            box-sizing: border-box;
        }

        /* 装饰性边角 */
        .corner {
            position: absolute;
            width: 15px;
            height: 15px;
            border: 2px solid #2c1e14;
            transition: all 0.3s;
        }
        .tl { top: 10px; left: 10px; border-right: none; border-bottom: none; }
        .tr { top: 10px; right: 10px; border-left: none; border-bottom: none; }
        .bl { bottom: 10px; left: 10px; border-right: none; border-top: none; }
        .br { bottom: 10px; right: 10px; border-left: none; border-top: none; }

        /* 标题重设计 - 更美观 */
        .game-title {
            margin: 0;
            line-height: 1.2;
            border-bottom: 1px solid rgba(44, 30, 20, 0.2);
            padding-bottom: 20px;
            margin-bottom: 15px;
        }
        
        .title-en {
            display: block;
            font-size: 2.8rem;
            letter-spacing: 8px;
            font-weight: bold;
            text-transform: uppercase;
            color: #2c1e14;
            text-shadow: 1px 1px 0 #d4af37;
        }
        
        .title-cn {
            display: block;
            font-size: 1.2rem;
            letter-spacing: 12px; /* 极宽间距，增加高级感 */
            color: #5d4037;
            margin-top: 5px;
            font-weight: normal;
        }

        /* 紧凑的信息栏 */
        .meta-info {
            font-size: 0.85rem;
            color: #666;
            margin-bottom: 25px;
            font-style: italic;
        }
        .meta-info a {
            color: #8b0000;
            text-decoration: none;
            border-bottom: 1px dotted #8b0000;
            margin-left: 5px;
            font-weight: bold;
        }
        .meta-info a:hover {
            background: #8b0000;
            color: #fff;
        }

        /* 法律警告框 - 核心突出 */
        .legal-box {
            background-color: rgba(139, 0, 0, 0.05);
            border: 1px solid #8b0000;
            padding: 20px;
            margin-bottom: 30px;
        }

        .age-limit {
            display: block;
            color: #8b0000;
            font-size: 1.4rem;
            font-weight: 900;
            margin-bottom: 10px;
        }

        .license-text {
            display: block;
            font-size: 1rem;
            font-weight: bold;
            color: #4a0e0e;
            line-height: 1.5;
        }

        /* 开始按钮 - 小巧精致 */
        .btn-start {
            background-color: #2c1e14;
            color: #d4af37;
            border: 1px solid #d4af37;
            padding: 10px 35px; /* 减小内边距 */
            font-size: 1rem;    /* 减小字体 */
            font-weight: bold;
            letter-spacing: 2px;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            font-family: serif;
        }

        .btn-start:hover {
            background-color: #d4af37;
            color: #2c1e14;
            transform: translateY(-2px);
            box-shadow: 0 6px 15px rgba(0,0,0,0.3);
        }

        .btn-start:active {
            transform: translateY(1px);
        }

    </style>
</head>

<body>
    <div class="card-container">
        <div class="corner tl"></div><div class="corner tr"></div>
        <div class="corner bl"></div><div class="corner br"></div>

        <div id="content-area"></div>
    </div>

    <script>
        // 1. 配置数据
        const GAME_CONFIG = {
            title: "ELDORAN",
            subtitle: "埃尔多兰",
            version: "V1.0",
            author: "WinManApple",
            repo: "https://github.com/WinManApple/Eldoran",
            legal: {
                age: "🔞 本项目仅供 18 岁及以上成年人使用 (Adults 18+ Only)",
                warning: "完全开源免费。严禁二次搬运、篡改分发或商业用途。违者必究。"
            }
        };

        // 2. 渲染函数
        function render() {
            const container = document.getElementById('content-area');
            container.innerHTML = `
                <div class="game-title">
                    <span class="title-en">${GAME_CONFIG.title}</span>
                    <span class="title-cn">${GAME_CONFIG.subtitle}</span>
                </div>

                <div class="meta-info">
                    Designed by ${GAME_CONFIG.author} • 
                    <a href="${GAME_CONFIG.repo}" target="_blank">View on GitHub</a>
                </div>

                <div class="legal-box">
                    <span class="age-limit">${GAME_CONFIG.legal.age}</span>
                    <span class="license-text">${GAME_CONFIG.legal.warning}</span>
                </div>

                <button class="btn-start" onclick="window.launchLocalGame()">
                    BEGIN JOURNEY
                </button>
            `;
        }

        // 3. 启动逻辑
        if (!window.launchLocalGame) {
            const RELATIVE_PATH = '/Eldoran/game_project/index.html';
            window.rpgWindow = null;

            window.launchLocalGame = function() {
                const origin = window.top.location.origin;
                const fullUrl = origin + RELATIVE_PATH;
                
                if (window.rpgWindow && !window.rpgWindow.closed) {
                    window.rpgWindow.focus();
                } else {
                    window.rpgWindow = window.open(fullUrl, 'EldoranRPG', 'width=1280,height=720');
                }
            };
        }

        render();
    </script>
</body>
</html>
```