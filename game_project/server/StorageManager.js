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

const fs = require('fs');
const path = require('path');

// 1. 定义存档目录的绝对路径
// __dirname 是当前脚本所在目录，'../saves' 指向上一级的 saves 文件夹
const SAVE_DIR = path.join(__dirname, '../saves');

// 确保存档目录存在，如果不存在则创建
if (!fs.existsSync(SAVE_DIR)) {
    try {
        fs.mkdirSync(SAVE_DIR, { recursive: true });
        console.log(`[GameServer] 存档目录已创建: ${SAVE_DIR}`);
    } catch (err) {
        console.error(`[GameServer] 无法创建存档目录:`, err);
    }
}

/**
 * 存储管理器类
 * 负责处理所有与磁盘的物理交互
 */
class StorageManager {
    
    /**
     * 获取存档文件的完整路径
     * @param {string|number} slotId - 存档槽位 ID
     */
    static getFilePath(slotId) {
        // 简单清洗 slotId，防止路径遍历攻击 (如 ../../)
        const safeSlot = String(slotId).replace(/[^a-zA-Z0-9_-]/g, '');
        return path.join(SAVE_DIR, `slot_${safeSlot}.json`);
    }

    /**
     * 读取存档
     * @param {string|number} slotId 
     * @returns {object|null} 返回 JSON 对象，若失败返回 null
     */
    static loadSave(slotId) {
        const filePath = this.getFilePath(slotId);
        
        console.log(`[GameServer] 正在读取存档: ${filePath}`);

        if (!fs.existsSync(filePath)) {
            console.warn(`[GameServer] 存档不存在: Slot ${slotId}`);
            return null;
        }

        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(fileContent);
        } catch (err) {
            console.error(`[GameServer] 读取存档失败:`, err);
            throw new Error("存档文件损坏或无法读取");
        }
    }

    /**
     * 写入存档
     * @param {string|number} slotId 
     * @param {object} data - 前端发来的完整 JSON 对象
     * @returns {boolean} 是否成功
     */
    static writeSave(slotId, data) {
        const filePath = this.getFilePath(slotId);
        
        console.log(`[GameServer] 正在写入存档: Slot ${slotId}`);

        try {
            // 格式化 JSON，缩进 2 空格，方便人类阅读调试
            const jsonString = JSON.stringify(data, null, 2);
            fs.writeFileSync(filePath, jsonString, 'utf-8');
            console.log(`[GameServer] 写入成功! Timestamp: ${new Date().toISOString()}`);
            return true;
        } catch (err) {
            console.error(`[GameServer] 写入失败:`, err);
            throw err;
        }
    }

    /**
     * 获取所有存档列表（用于存档界面展示）
     * 只读取 metadata 部分以提高性能
     */
    static listSaves() {
        try {
            const files = fs.readdirSync(SAVE_DIR);
            const saveList = [];

            files.forEach(file => {
                if (file.endsWith('.json')) {
                    try {
                        const content = fs.readFileSync(path.join(SAVE_DIR, file), 'utf-8');
                        const json = JSON.parse(content);
                        // 只提取 slot_id 和 metadata
                        if (json.metadata) {
                            saveList.push(json.metadata);
                        }
                    } catch (e) {
                        // 忽略损坏的文件
                    }
                }
            });
            return saveList;
        } catch (err) {
            return [];
        }
    }
}

module.exports = StorageManager;