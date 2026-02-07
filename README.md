# 项目介绍

一款基于Phaser+Vue的大语言模型驱动的RPG类角色扮演游戏，在游戏里面你可以扮演任何你想要的角色。

## 游戏功能
1. 自定义开局：在中世纪剑与魔法的大背景下，扮演任何你想要的角色
2. 地图探索：游戏为节点探索式地图，地图均由LLM动态生成
3. LLM拥有一定的权利，能够根据用户输入实现不同的功能(生成NPC，启动战斗，让NPC成为队友等)
4. prompt管理：游戏对话自带大小总结来减少token消耗，同时玩家拥有编辑对话历史，NPC记忆等权利

## 安装步骤

1. 使用命令 git clone https://github.com/WinManApple/Eldoran.git 将整个项目文件安装到SillyTavern根目录的 public/ 目录下

2. 将rpg_save_system整个文件放到SillyTavern根目录的 plugins/ 目录下

3. 打开SillyTavern根目录的config.yaml。设置enableServerPlugins: true (允许使用后端插件)；enableServerPluginsAutoUpdate: true  (允许后端插件更新)；disableCsrfProtection: true (关闭跨站请求伪造 (CSRF) 保护)

4. 打开SillyTavern，导入card/埃尔多兰.png。选择合适的破限(最好不要带格式限制的，仅破防即可)，即可开始游玩。(SillyTavern需要安装酒馆助手插件)

##  特别注意！！！
1. 做了这些设置后，最好不要 浏览任何 **可能的恶意网站**
2. enableServerPlugins与disableCsrfProtection个人建议只在游玩本游戏的时候开启，其他时候设置为**false**。防止其他人利用恶意网站通过这个设置漏洞来获取或者修改你的酒馆数据

## 声明

License & Copyright

Copyright (C) 2026 WinAppleMan. This project is licensed under the GNU General Public License v3.0. You are free to copy, modify, and distribute the code as long as the new project is also Open Source under GPLv3.