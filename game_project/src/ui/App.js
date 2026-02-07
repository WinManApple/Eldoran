/*
* Project: Eldoran
 * Copyright (C) 2026 WinManApple
 *
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/
*/

// src/ui/App.js

import { createApp, computed, ref, onMounted, toRefs } from '../../lib/vue.esm-browser.js';
import { store, resetStore, RESOLUTIONS } from './modules/store.js';

// --- 引入业务逻辑 Hooks ---
import { useNavigation } from './modules/useNavigation.js';
import { useSaveSystem } from './modules/useSaveSystem.js';
import { useChat } from './modules/useChat.js';
import { useQuest } from './modules/useQuest.js';
import { useCombat } from './modules/useCombat.js';
import { useLLM } from './modules/useLLM.js';

// --- 引入 UI 组件 ---
import DialogueOverlay from './DialogueOverlay.js';
import ChoiceOverlay from './ChoiceOverlay.js';
import CombatOverlay from './CombatOverlay.js';
import { GlobalLog } from './GlobalLog.js';
import QuestBoard from './QuestBoard.js';
import { TeamOverlay } from './TeamOverlay.js';
import ShopOverlay from './ShopOverlay.js';
import { HInteractionOverlay } from './HInteractionOverlay.js';
import { RestOverlay } from './RestOverlay.js';
import LLMManager from './LLMManager.js';
import TransitionModal from './TransitionModal.js';
import NPCManagerOverlay from './NPCManagerOverlay.js';
import HMemoryOverlay from './HMemoryOverlay.js';
import HistoryManagerOverlay from './HistoryManagerOverlay.js';
import SummaryOverlay from './SummaryOverlay.js';
import CharacterCreationOverlay from './CharacterCreationOverlay.js';
import CustomOpeningOverlay from './CustomOpeningOverlay.js'; 
import MapManagerOverlay from './MapManagerOverlay.js';
import { HStateOverlay } from './HStateOverlay.js';

// --- 模块化组件 ---
import MainMenu from './MainMenu.js';
import SaveLoadOverlay from './SaveLoadOverlay.js';
import SettingsOverlay from './SettingsOverlay.js';
import PauseOverlay from './PauseOverlay.js';

// --- 引入系统状态 (用于 v-if 判断) ---
import { ShopSystem } from '../systems/ShopSystem/ShopSystem.js';
import { RestSystem } from '../systems/RestSystem/RestSystem.js';
import { HInteractionSystem } from '../systems/HInteractionSystem/HInteractionSystem.js';

// 快照系统
import SnapshotOverlay from './SnapshotOverlay.js';

// 引入分离的视图模板
import AppTemplate from './AppTemplate.js';

// ⚠️ 关键兼容：暴露 store 供外部 (如 Phaser) 使用
export { store }; 

const App = {
    // --- 模板区域：使用模块化组件结构 ---
    template: AppTemplate,
    
    setup() {
        // --- 初始化各子模块 Hooks ---
        const nav = useNavigation();
        const saveSys = useSaveSystem();
        const chat = useChat();
        const quest = useQuest();
        const combatCtrl = useCombat();
        const llm = useLLM();

        // 将 LLMManager 的显示状态同步到 store
        // 如果 store 中还没定义这个属性，先初始化
        if (store.showLLMManager === undefined) {
            store.showLLMManager = false;
        }

        // 创建一个可读写的 computed 属性，替代原本的 ref
        // 这样模板中依然可以使用 showLLMManager，但实际读写的是 store.showLLMManager
        const showLLMManager = computed({
            get: () => store.showLLMManager,
            set: (val) => store.showLLMManager = val
        });

        // 计算属性：HUD 血条/蓝条
        const hpPercent = computed(() => {
            if (!store.playerStats.maxHp) return 0;
            return (store.playerStats.hp / store.playerStats.maxHp) * 100;
        });
        
        const mpPercent = computed(() => {
            if (!store.playerStats.maxMp) return 0;
            return (store.playerStats.mp / store.playerStats.maxMp) * 100;
        });

        // ==========================================
        // 跨模块交互胶水代码 (Glue Code) - 修复重点
        // ==========================================

        // 🟢 [修复] 打开存档界面：先刷新列表，再压栈跳转
        const openSaveManager = async () => {
            if (saveSys.refreshSaveList) {
                await saveSys.refreshSaveList();
            }
            nav.navigateTo('saves');
        };

        // 🟢 [修复] 执行读档：读档成功后必须清理界面残留状态
        const handleExecuteLoad = async () => {
            const success = await saveSys.executeLoad();
            if (success) {
                console.log("[App] 读档成功，正在清理界面状态...");
                
                // 1. 强制关闭战斗状态，防止旧战斗UI遮挡
                store.combat.isActive = false;
                
                // 2. 清理残留的过渡弹窗 (确认/取消回调已失效)
                if (store.transition) {
                    store.transition.isActive = false;
                    store.transition.onConfirm = null;
                    store.transition.showSave = false;
                }
                
                // 3. 重置对话与 AI 状态
                store.isDialogueActive = false;
                store.aiStatus.isThinking = false;
                store.aiResult = 'none';

                // 4. 正式启动游戏场景
                nav.startGame();
            }
        };

        // 🟢 [修复] 打开任务：先同步数据，再跳转
        const handleQuestClick = () => {
            const success = quest.syncQuestData();
            if (success) {
                nav.navigateTo('quests');
            }
        };

        // 🟢 [修复] 打开队伍：使用 navigateTo
        const handleTeamClick = () => {
            nav.navigateTo('team');
        };

        const handleInteractClick = () => {
            store.isDialogueActive = true;
        };

        // 打开 NPC 管理界面的处理函数
        const handleNPCManagerClick = () => {
            // 可以在这里加一个刷新逻辑，确保数据是最新的
            if (window.Npc_Memory) {
                // 如果需要手动触发某些更新，可以在这里做，
                // 但 NPCManagerOverlay 组件会在 mounted 时自动读取数据，所以这里只需切换菜单
            }
            store.currentMenu = 'npc_manager';
        };

        const handleHMemoryClick = () => {
             // 打开回忆录界面
             store.currentMenu = 'h_memory';
        };

        // 打开历史管理器
        const handleHistoryClick = () => {
            store.currentMenu = 'history_manager';
        };

        // 打开频道总结界面
        const handleSummaryClick = () => {
            store.currentMenu = 'summary';
        };

        // 打开地图管理界面
        const handleMapManagerClick = () => {
            // 这里可以加一个刷新逻辑，虽然组件 mounted 会自动刷新，但手动触发更稳妥
            if (window.mapManager && window.mapManager.currentMap) {
                // 只是切换菜单状态
                store.currentMenu = 'map_manager';
            } else {
                console.warn("暂无地图数据");
                // 依然可以打开，让组件显示“无数据”提示
                store.currentMenu = 'map_manager';
            }
        };

        // ==========================================
        // 生命周期 (Lifecycle) - 修复重点
        // ==========================================
        onMounted(() => {
            console.log("[App] Vue App Mounted");
            // 初始化时刷新存档列表，避免首次打开为空
            if (saveSys.refreshSaveList) {
                saveSys.refreshSaveList();
            }
            // 如果在主菜单，确保隐藏 Canvas
            if (store.currentMenu === 'main') {
                nav.setGameCanvasVisible(false);
            }
        });

        // [新增] 处理从“角色创建界面”点击“缔结契约”
        const handleStartGameFromCreation = (payload) => {
            // payload 包含: { playerName, openingId, openingData }
            nav.startGame(payload);
        };

        // [新增] 处理从“角色创建界面”点击“放弃”
        const handleBackToTitle = () => {
            nav.returnToTitle();
        };

        // [修改] 劫持主菜单的“开始新征程”
        // 原本 nav.startGame() 直接进游戏，现在改为跳转到创建界面
        const openCharacterCreation = () => {
            // 清理旧数据，确保是全新开始
            resetStore(); 
            nav.navigateTo('character_creation');
        };

        // 🟢 [新增] 处理切换到自定义开局界面
        const openCustomCreator = () => {
            // 这里不需要 resetStore，因为从角色创建页跳转过来希望保留连贯性
            // 且 CustomOpeningOverlay 内部有自己的状态管理
            nav.navigateTo('custom_opening');
        };

        return {
            // 状态解构
            ...toRefs(store), 
            store,            
            RESOLUTIONS,
            
            // 计算属性
            hpPercent, 
            mpPercent,
            playerStats: store.playerStats,
            resources: store.resources,
            worldState: store.worldState,
            aiStatus: store.aiStatus,
            aiResult: computed(() => store.aiResult),
            activeQuest: store.activeQuest,
            

            // 系统状态
            ShopSystem,
            RestSystem,
            HInteractionSystem,

            // 导航功能
            ...nav,
            openSaveManager, // 使用修复后的版本

            // 存档功能
            ...saveSys,
            executeLoad: handleExecuteLoad, // 使用修复后的带清理逻辑的版本

            // 交互功能
            handleQuestClick,
            handleTeamClick,
            handleInteractClick,
            handleBattleEnd: combatCtrl.handleBattleEnd,
            handleNPCManagerClick,
            handleHMemoryClick,
            handleHistoryClick,
            handleSummaryClick,
            handleMapManagerClick,

            // 开局交互
            handleStartGameFromCreation,
            handleBackToTitle,
            openCharacterCreation,
            openCustomCreator,

            // UI 绑定
            showLLMManager,
        };
        
    },
    components: {
        // 新模块化组件
        MainMenu,
        SaveLoadOverlay,
        SettingsOverlay,
        PauseOverlay,
        
        // 原有业务组件
        DialogueOverlay,
        QuestBoard,
        'llm-manager': LLMManager, // 显式命名解决警告
        'combat-overlay': CombatOverlay,
        'team-overlay': TeamOverlay,
        'npc-manager-overlay': NPCManagerOverlay,
        'h-memory-overlay': HMemoryOverlay,
        'history-manager-overlay': HistoryManagerOverlay,
        'summary-overlay': SummaryOverlay,
        'global-log': GlobalLog,
        'choice-overlay': ChoiceOverlay,
        'shop-overlay': ShopOverlay,
        'h-interaction-overlay': HInteractionOverlay,
        'rest-overlay': RestOverlay,
        'transition-modal': TransitionModal,
        'snapshot-overlay': SnapshotOverlay,
        'character-creation-overlay': CharacterCreationOverlay,
        'custom-opening-overlay': CustomOpeningOverlay,
        'map-manager-overlay': MapManagerOverlay,
        'h-state-overlay': HStateOverlay,
    }
};

// 导出初始化函数，供 main.js 调用
export function initVue() {
    window.store = store; 
    window.ShopSystem = ShopSystem;
    window.RestSystem = RestSystem;
    window.HSystem = HInteractionSystem;
    
    const app = createApp(App);
    app.mount('#app');
}