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

// Data_Sanitize.js
// 运行环境: SillyTavern 后台
// 职责: 负责对 LLM 的原始输出进行清洗、提取和格式化，剔除无关噪音。

(function() {
    console.log("🧹 [Data_Sanitize] 数据清洗模块正在挂载...");

    // =============================================================
    // 1. 核心处理器集合 (Processors)
    // 未来可在此处扩展其他清洗逻辑，如 fixBrokenJson, removeMarkdown 等
    // =============================================================
    const processors = {
        
        /**
         * 策略：基于白名单标签的精确提取 (抗噪增强版)
         * 逻辑：提取最内层的 <Tag>...{JSON}...</Tag> 对，忽略未闭合的前置干扰
         * 示例：<Tag> (1) <Tag> (2) </Tag> -> 提取 (2)
         */
        extractTags: function(text, tags) {
            if (!Array.isArray(tags) || tags.length === 0) {
                return text; 
            }

            let cleanedBuffer = "";
            let matchCount = 0;

            tags.forEach(tagName => {
                // 🟢 [修改] 引入负向先行断言 (Negative Lookahead)
                // 解释:
                // 1. <(${tagName})>       : 匹配开始标签
                // 2. (?: ... )*?          : 非捕获组，懒惰重复
                // 3. (?!<${tagName}>)     : ⚠️ 关键点：每前进一步前，先断言后面不是开始标签
                //                           如果遇到嵌套的开始标签，当前匹配作废，引擎会自动寻找下一个开始标签
                // 4. [\\s\\S]             : 匹配任意字符
                // 5. <\\/${tagName}>      : 匹配结束标签
                
                const regexStr = `<(${tagName})>(?:(?!<${tagName}>)[\\s\\S])*?<\\/${tagName}>`;
                const regex = new RegExp(regexStr, 'g');
                
                const matches = text.match(regex);
                
                if (matches) {
                    // 将所有匹配到的块拼接起来
                    cleanedBuffer += matches.join("\n") + "\n";
                    matchCount += matches.length;
                }
            });

            if (matchCount > 0) {
                console.log(`🧹 [Data_Sanitize] 已提取 ${matchCount} 个有效片段 (已剔除嵌套/未闭合噪音)。`);
                return cleanedBuffer.trim();
            } else {
                console.warn(`⚠️ [Data_Sanitize] 未在回复中找到期望的标签: ${tags.join(', ')}`);
                return ""; 
            }
        }
    };

    // =============================================================
    // 2. 主对外接口 (Public API)
    // =============================================================
    const SanitizerAPI = {
        /**
         * 执行清洗任务
         * @param {string} rawText - LLM 返回的原始文本
         * @param {Object} options - 清洗配置
         * @param {Array<string>} [options.expectedTags] - 期望提取的标签白名单
         * @returns {string} - 清洗后的文本
         */
        process: function(rawText, options = {}) {
            if (!rawText) return "";

            let result = rawText;

            // 1. 执行标签提取 (如果有 expectedTags)
            if (options.expectedTags && options.expectedTags.length > 0) {
                result = processors.extractTags(result, options.expectedTags);
            }

            // 2. (预留) 未来在此处串联其他处理器
            // if (options.fixJson) result = processors.fixBrokenJson(result);

            return result;
        }
    };

    // =============================================================
    // 3. 挂载至父级全局空间
    // =============================================================
    try {
        // 确保父级命名空间存在 (防止覆盖)
        // 这里使用 RPG_DataSanitizer 作为唯一的访问入口
        window.parent.RPG_DataSanitizer = SanitizerAPI;
        
        console.log("✅ [Data_Sanitize] 挂载成功: window.parent.RPG_DataSanitizer");
    } catch (e) {
        console.error("❌ [Data_Sanitize] 挂载失败 (可能是跨域或父级不可访问):", e);
    }

})();