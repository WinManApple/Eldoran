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

// SillyTavern 服务端扩展 - RPG 存档读写接口 (调试增强版)
const fs = require('fs');
const path = require('path');

console.log('[RPG-Save-Server] 🔌 插件脚本已被加载 (File Loaded)');

// ================= 配置区 =================
const GAME_ROOT_NAME = 'Eldoran';
const INNER_SAVE_PATH = path.join('game_project', 'saves');

// ================= 核心逻辑：智能寻找存档目录 =================
function resolveSaveDirectory() {
    try {
        const publicDir = path.join(__dirname, '../../public');
        const gameRootDir = path.join(publicDir, GAME_ROOT_NAME);
        const targetSaveDir = path.join(gameRootDir, INNER_SAVE_PATH);

        console.log(`[RPG-Save-Server] 🔍 正在定位存档目录...`);
        console.log(`[RPG-Save-Server]    - Public Dir: ${publicDir}`);
        console.log(`[RPG-Save-Server]    - Target Dir: ${targetSaveDir}`);

        if (fs.existsSync(gameRootDir)) {
            console.log(`[RPG-Save-Server] ✅ 找到游戏根目录`);
        } else {
            console.warn(`[RPG-Save-Server] ⚠️ 未找到游戏根目录，将尝试自动创建路径`);
        }
        return targetSaveDir;
    } catch (e) {
        console.error(`[RPG-Save-Server] ❌ 路径解析崩溃:`, e);
        return path.join(__dirname, 'fallback_saves'); // 防止崩溃
    }
}

const SAVE_DIR = resolveSaveDirectory();

// 确保目录物理存在
if (!fs.existsSync(SAVE_DIR)) {
    try {
        fs.mkdirSync(SAVE_DIR, { recursive: true });
        console.log(`[RPG-Save-Server] 📁 目录创建成功: ${SAVE_DIR}`);
    } catch (e) {
        console.error(`[RPG-Save-Server] ❌ 目录创建失败: ${e.message}`);
    }
}

// ================= 标准 API 接口 =================
function init(router) {
    console.log('[RPG-Save-Server] 🚀 init() 被调用，开始注册路由...');
    
    // 🔴 1. 全局请求拦截日志 (关键调试点)
    // 只要有请求发给这个插件，这行字就必须出现！
    router.use((req, res, next) => {
        console.log(`[RPG-Save-Server] 📨 收到请求: ${req.method} ${req.url}`);
        next();
    });

    // API 1: 保存存档 (POST)
    router.post('/save', (req, res) => {
        console.log('[RPG-Save-Server] -> 进入 /save 处理流程');
        try {
            const { slotId, data } = req.body;
            
            // 🔴 2. 检查数据是否接收到
            if (!req.body) {
                console.error('[RPG-Save-Server] ❌ 错误: req.body 为空! 中间件可能未解析 JSON');
                return res.status(400).send('Request body is empty');
            }
            console.log(`[RPG-Save-Server] -> 参数检查: slotId=${slotId}, data类型=${typeof data}`);

            if (!slotId || !data) {
                console.error('[RPG-Save-Server] ❌ 错误: 缺少必要参数');
                return res.status(400).send('缺少参数');
            }

            const filePath = path.join(SAVE_DIR, `slot_${slotId}.json`);
            
            // 🔴 3. 尝试写入
            console.log(`[RPG-Save-Server] -> 准备写入文件: ${filePath}`);
            const jsonStr = JSON.stringify(data, null, 2);
            console.log(`[RPG-Save-Server] -> 数据大小: ${(jsonStr.length / 1024).toFixed(2)} KB`);

            fs.writeFileSync(filePath, jsonStr, 'utf-8');
            
            console.log(`[RPG-Save-Server] ✅ 写入成功!`);
            res.json({ success: true, message: 'Saved successfully' });
        } catch (err) {
            console.error('[RPG-Save-Server] ❌ 写入过程发生异常:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // API 2: 读取存档 (GET)
    router.get('/load/:slotId', (req, res) => {
        console.log(`[RPG-Save-Server] -> 进入 /load/${req.params.slotId} 处理流程`);
        try {
            const slotId = req.params.slotId;
            const filePath = path.join(SAVE_DIR, `slot_${slotId}.json`);

            if (!fs.existsSync(filePath)) {
                console.warn(`[RPG-Save-Server] ⚠️ 文件不存在: ${filePath}`);
                return res.status(404).json({ success: false, message: 'No save file found' });
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            
            console.log(`[RPG-Save-Server] ✅ 读取成功`);
            res.json({ success: true, data: data });
        } catch (err) {
            console.error('[RPG-Save-Server] ❌ 读取异常:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });
    
    // API 3: 获取存档列表 (GET)
    router.get('/list', (req, res) => {
        console.log('[RPG-Save-Server] -> 进入 /list 处理流程');
        try {
            if (!fs.existsSync(SAVE_DIR)) {
                console.log('[RPG-Save-Server] 目录不存在，返回空列表');
                return res.json({ list: [] });
            }
            
            const files = fs.readdirSync(SAVE_DIR);
            const list = [];
            
            files.forEach(file => {
                if(file.endsWith('.json')) {
                    try {
                        const raw = fs.readFileSync(path.join(SAVE_DIR, file), 'utf-8');
                        const json = JSON.parse(raw);
                        // 🛠️ 兼容性修复：既支持 metadata 包裹，也支持扁平结构
                        if(json.metadata) {
                            list.push(json.metadata);
                        } else {
                            // 旧存档兼容逻辑
                            list.push({
                                slot_id: json.slot_id,
                                name: json.name,
                                timestamp: json.timestamp,
                                location: json.location,
                                is_legacy: true // 标记为旧存档
                            });
                        }
                    } catch(e) {
                        console.error(`[RPG-Save-Server] 解析文件 ${file} 失败:`, e.message);
                    }
                }
            });
            
            console.log(`[RPG-Save-Server] ✅ 返回列表，共 ${list.length} 个存档`);
            res.json({ success: true, list: list });
        } catch (err) {
            console.error('[RPG-Save-Server] ❌ 列表获取异常:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.delete('/delete/:slotId', (req, res) => {
        // ... (保持原样即可，或者加日志)
        const slotId = req.params.slotId;
        console.log(`[RPG-Save-Server] -> 删除请求: Slot ${slotId}`);
        // ... 正常逻辑
        try {
            const filePath = path.join(SAVE_DIR, `slot_${slotId}.json`);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[RPG-Save-Server] ✅ 删除成功`);
                res.json({ success: true });
            } else {
                res.status(404).json({ success: false });
            }
        } catch (e) {
            console.error(`[RPG-Save-Server] ❌ 删除失败:`, e);
            res.status(500).json({ error: e.message });
        }
    });
}

const info = {
    id: 'rpg_save_system',
    name: 'RPG Save System',
    description: 'Backend save/load API for RPG game'
};

module.exports = {
    init,
    info
};