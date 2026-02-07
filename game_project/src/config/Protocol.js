/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/config/Protocol.js

/**
 * 通信协议常量定义
 * 作用：确保服务端(ST)和客户端(Game)使用相同的指令名称
 */
export const Protocol = {
    // 1. 系统级指令 (System) - 状态: ✅ 稳定使用中
    SYS: {
        HANDSHAKE: 'SYS:HANDSHAKE',   // 客户端 -> 服务端：我启动了，求握手
        PAIRED:    'SYS:PAIRED',      // 服务端 -> 客户端：握手成功，连接建立
        ERROR:     'SYS:ERROR',       // 错误回传
        LOG:       'SYS:LOG'          // 客户端 -> 服务端：远程打印日志
    },

    // 2. 存档系统专用指令 (Storage) - 状态: ✅ 稳定使用中
    STORAGE: {
        SAVE: 'STORAGE:SAVE',    // 保存
        LOAD: 'STORAGE:LOAD',    // 读取
        LIST: 'STORAGE:LIST',    // 获取列表
        DELETE: 'STORAGE:DELETE' // 删除
    },

    // 3. LLM 统一交互指令 (LLM) - 🆕 新架构核心
    // 取代了原有的 CHAT 和 PLOT，所有涉及 AI 生成的请求都走这个通道
    LLM: {
        // 批处理生成请求
        // Payload 结构: [ [COMMAND, {params}], [COMMAND, {params}] ... ]
        GENERATE: 'LLM:GENERATE',
        CANCEL: 'LLM:CANCEL', // 中断指令
    }
};

/**
 * LLM 调用的子指令集 (Call Commands)
 * 对应 src/LLM/calls/ 下的脚本功能
 * 也是 Game_Manager 发送给 ST 端的顶层任务类型
 */
export const LLMCommands = {
    // 优先级 1: 剧情大纲设计
    PLOT_DESIGN: 'PLOT_DESIGN', 

    // 优先级 2: 地图结构初始化 (命名与描述)
    MAP_INIT: 'MAP_INIT',

    // 优先级 3: 节点内容填充 (生成敌人、宝箱、事件的具体 Payload)
    // 修正了之前的拼写错误 (GENETATE -> GENERATE)，并更名以贴合功能
    NODE_PAYLOAD_GENERATE: 'NODE_PAYLOAD_GENERATE',

    // 优先级 4: 聊天互动 (主线与支线合并为此指令，通过参数区分)
    CHAT: 'CHAT',

    // 优先级 5: H模式实时交互
    H_MODE: 'H_MODE'
};