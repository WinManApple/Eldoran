/*
* Project: Eldoran
 * Copyright (C) 2026 WinAppleMan
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// src/ui/AppTemplate.js

export default `
<div id="app-root">
    <div class="void-background" v-show="store.isIngame">
        <div class="mana-grid"></div>
        <div class="mana-particles"></div>
        <div class="vignette-overlay"></div>
    </div>

    <transition name="fade">
        <div class="background-container" v-show="!store.isIngame">
            <video autoplay muted loop playsinline class="bg-video">
                <source src="./assets/images/Opening_Background.mp4" type="video/mp4">
            </video>
            <div class="bg-overlay"></div>
        </div>
    </transition>

    <main-menu 
        v-if="store.currentMenu === 'main'"
        @start-game="openCharacterCreation"  
        @open-saves="openSaveManager" 
        @open-settings="openSettings"
    ></main-menu>

    <transition name="fade">
        <character-creation-overlay 
            v-if="store.currentMenu === 'character_creation'"
            @start-game="handleStartGameFromCreation"
            @back-to-title="handleBackToTitle"
            @open-custom-creator="openCustomCreator"
        ></character-creation-overlay>
    </transition>

    <transition name="fade">
        <custom-opening-overlay 
            v-if="store.currentMenu === 'custom_opening'"
            @start-game="handleStartGameFromCreation"
            @back-to-title="openCharacterCreation"
        ></custom-opening-overlay>
    </transition>

    <save-load-overlay 
        v-if="store.currentMenu === 'saves'"
        @close="navigateBack"
        @save="executeSave"
        @load="executeLoad"
        @delete="executeDelete"
    ></save-load-overlay>

    <settings-overlay 
        v-if="store.currentMenu === 'settings'"
        @close="navigateBack"
        @resolution-change="applyResolution"
    ></settings-overlay>

    <pause-overlay 
        v-if="store.currentMenu === 'pause'"
        @resume="resumeGame"
        @open-settings="openSettings"
        @open-saves="openSaveManager"
        @quit="returnToTitle"
    ></pause-overlay>

    <transition name="fade">
        <quest-board v-if="store.currentMenu === 'quests'" @close="closeMenu"></quest-board>
    </transition>

    <transition name="fade">
        <llm-manager v-if="showLLMManager" @close="showLLMManager = false"></llm-manager>
    </transition>
    
    <div id="game-hud" v-if="store.currentMenu === 'none'">
        <div class="hud-top-left-group">
            <div class="hud-player-status">
                <div class="avatar-frame">
                    <div class="avatar-placeholder">Lv.{{ playerStats.level }}</div> 
                </div>
                
                <div class="stats-panel">
                    <div class="stats-header">
                        <span class="player-name">{{ playerStats.name }}</span>
                        <div class="mini-resource">
                            <span class="coin-icon">💰</span> {{ resources.gold }}
                        </div>
                    </div>

                    <div class="bars-container">
                        <div class="bar-wrap">
                            <div class="bar-fill hp-bar" :style="{ width: hpPercent + '%' }"></div>
                            <span class="bar-text">{{ playerStats.hp }} / {{ playerStats.maxHp }}</span>
                        </div>
                        <div class="bar-wrap">
                            <div class="bar-fill mp-bar" :style="{ width: mpPercent + '%' }"></div>
                            <span class="bar-text">{{ playerStats.mp }} / {{ playerStats.maxMp }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="hud-location-panel">
                <div class="location-text" id="hud-location-text">{{ worldState.mapName }}</div>
                <div class="time-text" id="hud-time-text">{{ worldState.timeDisplay }}</div>
            </div>
        </div>

        <div class="hud-top-right">
            <div class="status-lights">
                <div class="light-label">LINK</div>
                <div class="status-light connection" :class="{ active: aiStatus.connectionState === 'connected' }"></div>
            </div>

            <div class="gear-btn" @click="openPauseMenu" title="系统菜单">
                <div class="gear-core"></div>
                <div class="gear-teeth"></div>
            </div>
        </div>

        <div class="hud-side-right">
            <div class="quest-panel">
                <h3>📜 当前目标</h3>
                <p class="quest-title">{{ worldState.mapName }}</p>
                <p class="quest-desc">{{ activeQuest.target }}</p>
            </div>
        </div>

        <div class="hud-side-left"></div>

        <div class="hud-bottom">
            <button class="hud-btn" @click="handleTeamClick">🛡️ 队伍</button>
            <button class="hud-btn interact-btn" @click="handleInteractClick">💬 剧情</button>
            <button class="hud-btn" @click="handleQuestClick">🗺️ 任务</button>
            <button class="hud-btn" @click="handleMapManagerClick">📍 地图管理</button>
            <button class="hud-btn" @click="showLLMManager = true">🔮 AI 管理</button>
            <button class="hud-btn" @click="handleNPCManagerClick">👥 NPC 图鉴</button>
            <button class="hud-btn" @click="handleHMemoryClick">💗 回忆</button>
            <button class="hud-btn" @click="handleHistoryClick">📜 历史</button>
            <button class="hud-btn" @click="handleSummaryClick">📑 总结</button>
        </div>
    </div> <transition name="fade">
        <dialogue-overlay v-if="store.isDialogueActive" @close="store.isDialogueActive = false"></dialogue-overlay>
    </transition>

    <transition name="fade">
        <combat-overlay 
            v-if="store.combat && store.combat.isActive"
            :player-data="store.party"
            :enemy-data="store.combat.enemies"
            @battle-end="handleBattleEnd"
            @open-saves="openSaveManager"
        ></combat-overlay>
    </transition>

    <global-log v-if="!store.combat.isActive"></global-log>

    <choice-overlay></choice-overlay>

    <transition name="fade">
        <shop-overlay v-if="ShopSystem.isOpen" />
    </transition>

    <transition name="fade">
        <h-interaction-overlay v-if="HInteractionSystem.isActive" />
    </transition>
    
    <transition name="fade">
        <rest-overlay v-if="RestSystem.isOpen" />
    </transition>

    <snapshot-overlay v-if="store.isIngame"></snapshot-overlay>

    <transition name="fade">
        <npc-manager-overlay 
            v-if="store.currentMenu === 'npc_manager'" 
            @close="store.currentMenu = 'none'"
        ></npc-manager-overlay>
    </transition>

    <transition name="fade">
        <h-memory-overlay 
            v-if="store.currentMenu === 'h_memory'" 
            @close="store.currentMenu = 'none'"
        ></h-memory-overlay>
    </transition>

    <transition name="fade">
        <history-manager-overlay 
            v-if="store.currentMenu === 'history_manager'" 
            @close="store.currentMenu = 'none'"
        ></history-manager-overlay>
    </transition>

    <transition name="fade">
        <summary-overlay 
            v-if="store.currentMenu === 'summary'" 
            @close="store.currentMenu = 'none'"
        ></summary-overlay>
    </transition>

    <transition name="fade">
        <map-manager-overlay 
            v-if="store.currentMenu === 'map_manager'" 
            @close="store.currentMenu = 'none'"
        ></map-manager-overlay>
    </transition>
    
    <transition name="fade">
        <team-overlay v-if="store.currentMenu === 'team'" @close="store.currentMenu = 'none'"></team-overlay>
    </transition>

    <transition name="fade">
        <h-state-overlay 
            v-if="store.currentMenu === 'h_state_editor'" 
            @close="store.currentMenu = 'team'"
        ></h-state-overlay>
    </transition>

    <transition-modal></transition-modal>

</div>
`;