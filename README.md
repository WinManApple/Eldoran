# 项目介绍

## 内容

## 安装步骤
1. 将整个项目文件安装到SillyTavern根目录的 public/ 目录下
2. 将rpg_save_system整个文件放到SillyTavern根目录的 plugins/ 目录下
3. 打开SillyTavern根目录的config.yaml。设置enableServerPlugins: true (允许使用后端插件)；enableServerPluginsAutoUpdate: true  (允许后端插件更新)；disableCsrfProtection: true (关闭跨站请求伪造 (CSRF) 保护)
4. 打开SillyTavern，导入角色卡。选择合适的破限(最好不要带格式限制的，仅破防即可)，即可开始游玩。

##  特别注意！！！
1. 做了这些设置后，最好不要 浏览任何 **可能的恶意网站**
2. enableServerPlugins与disableCsrfProtection个人建议只在游玩本游戏的时候开启，其他时候设置为**false**。防止其他人利用恶意网站通过这个设置漏洞来获取或者修改你的酒馆数据