import logger from '../logger.js';
import { RoomNetworkManager } from './RoomNetworkManager.js';
import { GameRules } from '../pong/core/GameRules.js';
import { SettingsManager } from '../pong/core/SettingsManager.js';
import dynamicRender from '../UI/dynamic_render.js';
import { createPongGameController } from '../pong/PongGameController.js';
import Store from '../state/store.js';
import { RoomModes, getMaxPlayersForMode, getDefaultSettingsForMode } from '../state/roomState.js';

export class Room {
	static States = {
		LOBBY: 'LOBBY',
		PLAYING: 'PLAYING'
	};

	static Modes = RoomModes;

	static getMaxPlayersForMode = getMaxPlayersForMode;

	static initializeFromDOM() {
		const roomElement = document.getElementById('pong-room');
		if (!roomElement) return null;

		try {
			const roomId = JSON.parse(document.getElementById("room-id").textContent);
			const currentUser = JSON.parse(document.getElementById("current-user-data").textContent);
			return new Room(roomId, currentUser);
		} catch (error) {
			logger.error('Failed to initialize room from DOM:', error);
			return null;
		}
	}

	static handleHtmxStateUpdate(serverResponse) {
		try {
			const tempDiv = document.createElement('div');
			tempDiv.innerHTML = serverResponse;

			const roomStateData = tempDiv.querySelector('#room-state-data');
			if (roomStateData) {
				logger.debug("Found room state data");
				return JSON.parse(roomStateData.textContent.trim());
			}
		} catch (error) {
			logger.error("Error processing room state update:", error);
		}
		return null;
	}

	constructor(roomId, currentUser) {
		this._validateConstructorParams(roomId);

		// Initialize store
		this._store = Store.getInstance();

		// Get current user from store
		const userState = this._store.getState('user');
		this._currentUser = {
			id: userState.id,
			username: userState.username
		};

		// Core properties
		this._roomId = roomId;
		this._state = Room.States.LOBBY;

		// Get room state from store
		const roomState = this._store.getState('room');
		const room = roomState.rooms[roomId];

		// Initialize mode first
		this._mode = room?.mode || room?.settings?.mode || RoomModes.AI;

		// Initialize settings with the correct mode
		this._settings = {
			...getDefaultSettingsForMode(this._mode),
			...(room?.settings || {}),
			mode: this._mode  // Always ensure mode is set correctly
		};
		this._maxPlayers = Room.getMaxPlayersForMode(this._mode);

		// Room configuration
		this._owner = { id: null, username: null };
		this._players = [];
		this._pendingInvitations = [];

		// Game-related properties
		this._pongGame = null;
		this._useWebGL = false;
		this._aiDifficulty = this._settings.aiDifficulty || 'MEDIUM';

		// Initialize settings manager
		this._initializeSettingsManager();

		// Initialize connections and listeners
		this._networkManager = new RoomNetworkManager(roomId);
		this._initializeNetworkManager();
		this._initializeEventListeners();
		this._initializeStoreSubscription();

		// Initialize dynamic render for this room
		dynamicRender.addObservedObject('pongRoom', {
			...this._getPublicState()
		});

		logger.info(`Room instance created for room ${roomId}`, {
			currentUser: this._currentUser,
			owner: this._owner,
			mode: this._mode,
			settings: this._settings
		});
		this._logCurrentState();

		// Add a flag to track mode updates in progress
		this._modeUpdateInProgress = false;

		// Add global handler for select elements
		window.handleSettingChange = (element, setting, parseAsInt) => {
			const value = parseAsInt ? parseInt(element.value) : element.value;
			this._settings[setting] = value;
			this.updateSetting(setting, value);
			dynamicRender.scheduleUpdate();
		};
	}

	_initializeStoreSubscription() {
		// Subscribe to room state changes
		this._unsubscribeRoom = this._store.subscribe('room', (roomState) => {
			const activeRoomId = roomState.activeRoom;
			const activeRoom = roomState.rooms[activeRoomId];

			if (activeRoomId === this._roomId && activeRoom) {
				this._handleStoreUpdate(activeRoom);
			}
		});

		// Subscribe to user state changes
		this._unsubscribeUser = this._store.subscribe('user', (userState) => {
			this._currentUser = {
				id: userState.id,
				username: userState.username
			};
			// Update UI if needed
			dynamicRender.addObservedObject('pongRoom', {
				...this._getPublicState()
			});
			dynamicRender.scheduleUpdate();
		});
	}

	_handleStoreUpdate(roomData) {
		// Only update if the data has actually changed
		if (this._lastUpdateHash === JSON.stringify(roomData)) {
			return;
		}
		this._lastUpdateHash = JSON.stringify(roomData);

		// Don't override mode if we're in the middle of a mode change
		const mode = this._modeUpdateInProgress ? this._mode : (roomData.mode || this._mode || RoomModes.AI);

		// Update local state from store
		const updates = {
			_mode: mode,
			_state: roomData.status === 'game_in_progress' ? Room.States.PLAYING : Room.States.LOBBY,
			_owner: roomData.createdBy ? { id: roomData.createdBy, username: roomData.createdBy } : this._owner,
			_players: roomData.members || [],
			_settings: {
				...getDefaultSettingsForMode(mode),
				...this._settings,
				...(roomData.settings || {}),
				mode: mode  // Ensure mode is set in settings
			},
			_maxPlayers: Room.getMaxPlayersForMode(mode)
		};

		let hasChanged = false;
		Object.entries(updates).forEach(([key, value]) => {
			// Skip mode update if we're in the middle of a mode change
			if (this._modeUpdateInProgress && key === '_mode') {
				return;
			}
			if (JSON.stringify(this[key]) !== JSON.stringify(value)) {
				this[key] = value;
				hasChanged = true;
			}
		});

		if (hasChanged) {
			logger.debug("Room state updated:", {
				owner: this._owner,
				currentUser: this._currentUser,
				isOwner: this._owner.id === this._currentUser.id,
				mode: this._mode,
				settings: this._settings
			});
			this._logCurrentState();
			dynamicRender.addObservedObject('pongRoom', {
				...this._getPublicState()
			});
			dynamicRender.scheduleUpdate();
		}
	}

	_getDefaultSettings() {
		if (this._mode === Room.Modes.AI) {
			return GameRules.validateSettings({
				...GameRules.DEFAULT_AI_SETTINGS,
			});
		} else if (this._mode === Room.Modes.RANKED) {
			return GameRules.validateSettings({
				...GameRules.DEFAULT_RANKED_SETTINGS,
			});
		}
		return GameRules.validateSettings({
			...GameRules.DEFAULT_SETTINGS,
		});
	}

	_initializeSettingsManager() {
		this._settings = this._getDefaultSettings();

		const requiredSettings = ['ballSpeed', 'paddleSpeed', 'paddleSize', 'maxScore'];
		requiredSettings.forEach(setting => {
			if (typeof this._settings[setting] === 'undefined') {
				this._settings[setting] = GameRules.DEFAULT_SETTINGS[setting];
			}
		});

		this._settingsManager = new SettingsManager({
			...GameRules.DEFAULT_SETTINGS,
			aiDifficulty: 'Medium'
		});
	}

	_validateConstructorParams(roomId) {
		if (!roomId) {
			const roomIdElement = document.getElementById('room-id');
			if (roomIdElement) {
				roomId = JSON.parse(roomIdElement.textContent);
			}
			if (!roomId) {
				throw new Error('Room ID is required');
			}
		}
	}

	async _initializeNetworkManager() {
		try {
			await this._networkManager.connect();

			// Set up message handlers
			this._networkManager.on('room_update', (data) => {
				if (!this._modeUpdateInProgress) {
					if (data.room_state.settings) {
						logger.debug("Received settings in room update:", data.room_state.settings);
					}
					this.updateFromState(data.room_state);
				}
			});

			this._networkManager.on('game_started', async (data) => {
				try {
					await this._handleGameStarted(data);
				} catch (error) {
					logger.error("Error handling game start:", error);
					this._handleGameStartFailure();
				}
			});

			this._networkManager.on('settings_update', (data) => {
				logger.debug("Received settings update:", data);
				this._handleSettingsUpdate(data);
			});

			this._networkManager.on('mode_change', (data) => {
				if (!this._modeUpdateInProgress) {
					this._mode = data.mode;
					this._maxPlayers = Room.getMaxPlayersForMode(data.mode);
					this._settings = data.settings || this._getDefaultSettings();

					dynamicRender.addObservedObject('pongRoom', {
						...this._getPublicState()
					});
					dynamicRender.scheduleUpdate();

					logger.info(`Mode changed to: ${data.mode}`);
				}
			});

		} catch (error) {
			logger.error('Failed to initialize network manager:', error);
		}
	}

	_initializeEventListeners() {
		document.addEventListener('click', (event) => {
			if (event.target?.id === 'startGameBtn') {
				this.startGame();
			}
		});
	}

	// Getters
	get roomId() { return this._roomId; }
	get mode() { return this._settings.mode; }
	get owner() { return this._owner; }
	get players() { return Array.isArray(this._players) ? this._players : []; }
	get pendingInvitations() { return Array.isArray(this._pendingInvitations) ? this._pendingInvitations : []; }
	get maxPlayers() { return this._maxPlayers; }
	get state() { return this._state; }
	get currentUser() { return this._currentUser; }
	get useWebGL() { return this._useWebGL; }
	get availableSlots() {
		const playerCount = this._players.length;
		const invitationCount = this._pendingInvitations.length;
		return this._maxPlayers - playerCount - invitationCount;
	}

	// Game settings getters and setters
	get ballSpeed() { return this._settings.ballSpeed; }
	set ballSpeed(value) { this.updateSetting('ballSpeed', value); }

	get paddleSize() { return this._settings.paddleSize; }
	set paddleSize(value) { this.updateSetting('paddleSize', value); }

	get maxScore() { return this._settings.maxScore; }
	set maxScore(value) { this.updateSetting('maxScore', value); }

	get paddleSpeed() { return this._settings.paddleSpeed; }
	set paddleSpeed(value) { this.updateSetting('paddleSpeed', value); }

	get aiDifficulty() { return this._settings.aiDifficulty; }
	set aiDifficulty(value) { this.updateSetting('aiDifficulty', value); }

	// State update methods
	updateFromState(roomState) {
		logger.debug("updateFromState called with:", roomState);

		if (this._lastUpdateHash === JSON.stringify(roomState)) {
			logger.debug("Skipping duplicate room state update");
			return;
		}
		this._lastUpdateHash = JSON.stringify(roomState);

		const safeState = this._getSafeState(roomState);

		// Always update mode first to ensure settings are correct
		if (!this._modeUpdateInProgress && safeState.mode !== this._mode) {
			this._mode = safeState.mode;
			this._settings = {
				...getDefaultSettingsForMode(safeState.mode),
				...safeState.settings,
				mode: safeState.mode  // Ensure mode is set correctly
			};
			this._maxPlayers = Room.getMaxPlayersForMode(safeState.mode);
		}

		let updates = this._getStateUpdates(safeState);
		let hasChanged = false;

		updates.forEach(({ prop, value, compare }) => {
			if (this._shouldUpdateProperty(prop, value, compare)) {
				this._updateProperty(prop, value);
				hasChanged = true;
			}
		});

		if (hasChanged) {
			logger.debug("Room state updated:", {
				owner: this._owner,
				currentUser: this._currentUser,
				isOwner: this._owner.id === this._currentUser.id,
				mode: this._mode,
				settings: this._settings
			});
			this._logCurrentState();
			dynamicRender.addObservedObject('pongRoom', {
				...this._getPublicState()
			});
			dynamicRender.scheduleUpdate();
		}
	}

	_getSafeState(roomState) {
		const mode = roomState.mode || (roomState.settings?.mode) || RoomModes.AI;
		return {
			mode: mode,
			owner: roomState.owner || { id: null, username: null },
			players: Array.isArray(roomState.players) ? roomState.players : [],
			pendingInvitations: Array.isArray(roomState.pendingInvitations) ? roomState.pendingInvitations : [],
			maxPlayers: roomState.maxPlayers || Room.getMaxPlayersForMode(mode),
			state: roomState.state || Room.States.LOBBY,
			settings: {
				...getDefaultSettingsForMode(mode),
				...(roomState.settings || {}),
				mode: mode  // Ensure mode is set in settings
			}
		};
	}

	_getStateUpdates(safeState) {
		return [
			{
				prop: '_mode',
				value: safeState.mode,
				compare: () => false  // Always check mode updates
			},
			{ prop: '_owner', value: safeState.owner, compare: (a, b) => a && b && a.id === b.id },
			{
				prop: '_players', value: safeState.players,
				compare: (a, b) => this._areArraysEqual(a, b, item => item.id)
			},
			{
				prop: '_pendingInvitations', value: safeState.pendingInvitations,
				compare: (a, b) => JSON.stringify(a) === JSON.stringify(b)
			},
			{
				prop: '_maxPlayers',
				value: safeState.maxPlayers || Room.getMaxPlayersForMode(safeState.mode),
				compare: (a, b) => a === b
			},
			{ prop: '_state', value: safeState.state },
			{
				prop: '_settings',
				value: {
					...safeState.settings,
					mode: safeState.mode  // Ensure settings.mode matches the room mode
				},
				compare: (a, b) => JSON.stringify(a) === JSON.stringify(b)
			}
		];
	}

	_shouldUpdateProperty(prop, value, compare) {
		return compare ? !compare(this[prop], value) : this[prop] !== value;
	}

	_updateProperty(prop, value) {
		const oldValue = this[prop];
		this[prop] = value;
		logger.debug(`Property ${prop} changed:`, { old: oldValue, new: value });
		this._notifyUpdate(prop.slice(1), value);
	}

	_areArraysEqual(arr1, arr2, getKey) {
		if (!Array.isArray(arr1) || !Array.isArray(arr2)) return false;
		if (arr1.length !== arr2.length) return false;
		const keys1 = new Set(arr1.map(getKey));
		return arr2.every(item => keys1.has(getKey(item)));
	}

	// WebSocket event handlers
	_handleWebSocketMessage(data) {
		logger.debug("WebSocket message received:", data);
		if (data.type === "room_update") {
			// Skip state update if we're in the middle of a mode change
			if (!this._modeUpdateInProgress) {
				if (data.room_state.settings) {
					logger.debug("Received settings in room update:", data.room_state.settings);
				}
				this.updateFromState(data.room_state);
			}
		} else if (data.type === 'game_started') {
			this._handleGameStarted(data).catch(error => {
				logger.error("Error handling game start:", error);
				this._handleGameStartFailure();
			});
		} else if (data.type === 'settings_update') {
			logger.debug("Received settings update:", data);
			this._handleSettingsUpdate(data);
		} else if (data.type === 'mode_change') {
			// Only process mode change if it's not initiated by us
			if (!this._modeUpdateInProgress) {
				const newSettings = {
					...this._settings,
					mode: data.mode,
					...data.settings
				};
				this._mode = data.mode;
				this._maxPlayers = Room.getMaxPlayersForMode(data.mode);
				this._settings = newSettings;

				dynamicRender.addObservedObject('pongRoom', {
					...this._getPublicState()
				});
				dynamicRender.scheduleUpdate();

				logger.info(`Mode changed to: ${data.mode}`);
			}
		}
	}

	async _handleGameStarted(data) {
		logger.info("Game started event received", data);
		const isHost = this._currentUser.id === data.player1_id;

		try {
			await this._initializeAndStartGame(data.game_id, isHost);

			// Update store with game started status
			this._store.dispatch({
				domain: 'room',
				type: 'UPDATE_ROOM_STATUS',
				payload: {
					roomId: this._roomId,
					status: 'game_in_progress'
				}
			});
		} catch (error) {
			logger.error("Failed to start game:", error);
			this._handleGameStartFailure();
			throw error; // Re-throw to be caught by the caller
		}
	}

	async _initializeAndStartGame(gameId, isHost) {
		// Attach game to container first
		const gameContainer = document.querySelector('#game-container');
		if (!gameContainer) {
			throw new Error("Game container not found");
		}

		// Clear any existing content
		gameContainer.innerHTML = '';

		// Create and append the canvas with the correct structure
		const arcadeCabinet = document.createElement('div');
		arcadeCabinet.className = 'arcade-cabinet';

		const screen = document.createElement('div');
		screen.className = 'screen';

		const canvas = document.createElement('canvas');
		canvas.id = 'game';
		canvas.width = 858;
		canvas.height = 525;

		screen.appendChild(canvas);
		arcadeCabinet.appendChild(screen);
		gameContainer.appendChild(arcadeCabinet);

		try {
			// Get the connection from the network manager
			const connection = this._networkManager._connectionManager.getConnection('room');

			// Create game controller with initial settings
			const initialSettings = {
				...this._settings,
				isAIMode: this._settings.mode === Room.Modes.AI
			};

			// Create context handlers
			const contextHandlers = {
				onContextLost: (event) => {
					event.preventDefault();
					logger.warn('WebGL context lost');
					setTimeout(() => this._pongGame?.restoreContext(), 1000);
				},
				onContextRestored: () => {
					logger.info('WebGL context restored');
					this._pongGame?.reinitialize();
				}
			};

			// Destroy existing game instance if it exists
			if (this._pongGame) {
				this._pongGame.destroy();
			}

			// Create new game instance using factory function
			this._pongGame = createPongGameController(
				gameId,
				this._currentUser,
				isHost,
				this._useWebGL,
				initialSettings,
				contextHandlers,
				connection
			);

			const initialized = await this._pongGame.initialize();
			if (!initialized) {
				throw new Error("Game initialization failed");
			}

			// Start the game immediately (no need to set AI mode since it's already set)
			const started = await this._pongGame.start();
			if (!started) {
				throw new Error("Game start failed");
			}

			// Update state before scheduling render
			this._state = Room.States.PLAYING;

			// Force immediate render update
			dynamicRender.addObservedObject('pongRoom', {
				...this._getPublicState()
			});
			dynamicRender.scheduleUpdate();
		} catch (error) {
			logger.error("Failed to initialize game:", error);
			throw error;
		}
	}

	_handleGameStartFailure() {
		if (this._pongGame) {
			this._pongGame.destroy();
			this._pongGame = null;
		}
		this.updateState(Room.States.LOBBY);

		// Update store with game failure status
		this._store.dispatch({
			domain: 'room',
			type: 'UPDATE_ROOM_STATUS',
			payload: {
				roomId: this._roomId,
				status: 'active'
			}
		});
	}

	_handleWebSocketClose(event) {
		if (event.code === 4001) {
			logger.error("WebSocket closed: Authentication required");
			window.location.href = '/login/';
		} else if (event.code === 4003) {
			logger.error("WebSocket closed: Not authorized for this room");
		} else if (event.code === 4004) {
			logger.error("WebSocket closed: Room not found");
		} else if (event.code !== 1000 && event.code !== 1001) {
			logger.error("WebSocket closed unexpectedly", event);
			// Try to reconnect after a delay
			setTimeout(() => {
				logger.info("Attempting to reconnect...");
				this._initializeWebSocket();
			}, 5000);
		} else {
			logger.debug("WebSocket closed normally", event);
		}
	}

	_handleWebSocketOpen(event) {
		logger.info("WebSocket connection established", event);
	}

	_handleWebSocketError(event) {
		logger.error("WebSocket error:", event);
	}

	// User actions
	async startGame() {
		// Prevent multiple start game requests
		if (this._startGameInProgress) {
			logger.warn("Game start already in progress");
			return;
		}

		const playerCount = this._players.length;
		const isTournament = this._mode === Room.Modes.TOURNAMENT;
		const isAIMode = this._mode === Room.Modes.AI;

		// Special handling for different modes
		if (isTournament) {
			if (playerCount < 3 || playerCount > this._maxPlayers) {
				logger.error("Cannot start tournament: needs between 3 and 8 players");
				return;
			}
		} else if (!isAIMode && playerCount !== this._maxPlayers) {
			logger.error(`Cannot start game: needs exactly ${this._maxPlayers} players`);
			return;
		} else if (isAIMode && playerCount !== 1) {
			logger.error("Cannot start AI game: needs exactly 1 player");
			return;
		}

		try {
			this._startGameInProgress = true;
			this._useWebGL = document.getElementById('webgl-toggle')?.checked || false;
			this._networkManager.sendMessage('start_game', { id: Date.now() });
			this._setLoading(true);

			// Dispatch game start status to store
			this._store.dispatch({
				domain: 'room',
				type: 'UPDATE_ROOM_STATUS',
				payload: {
					roomId: this._roomId,
					status: 'game_in_progress'
				}
			});
		} catch (error) {
			logger.error('Error sending start game request:', error);
			this._setLoading(false);
		} finally {
			// Clear the flag after a delay to prevent rapid re-clicks
			setTimeout(() => {
				this._startGameInProgress = false;
			}, 2000);
		}
	}

	async changeMode(event) {
		const newMode = event.target.value;
		if (!newMode || !Object.values(RoomModes).includes(newMode)) {
			return;
		}

		try {
			// Set flag to prevent concurrent mode changes
			this._modeUpdateInProgress = true;

			// Get new settings for mode
			const newSettings = {
				...getDefaultSettingsForMode(newMode),
				mode: newMode
			};

			logger.debug('Changing mode:', {
				newMode,
				newSettings
			});

			// Send update to server first
			this._networkManager.sendMessage('update_property', {
				property: 'mode',
				value: newMode,
				settings: newSettings
			});

			// Update store
			this._store.dispatch({
				domain: 'room',
				type: 'UPDATE_ROOM_MODE',
				payload: {
					roomId: this._roomId,
					mode: newMode,
					settings: newSettings
				}
			});

			// Update local state
			this._mode = newMode;
			this._maxPlayers = Room.getMaxPlayersForMode(newMode);
			this._settings = newSettings;

			// Update UI
			dynamicRender.addObservedObject('pongRoom', {
				...this._getPublicState()
			});
			dynamicRender.scheduleUpdate();

		} catch (error) {
			logger.error('Failed to change mode:', error);
		} finally {
			// Clear mode update flag after a short delay to allow for server response
			setTimeout(() => {
				this._modeUpdateInProgress = false;
			}, 500);
		}
	}

	inviteFriend(friendId) {
		this._networkManager.sendMessage("invite_friend", { friend_id: friendId });
	}

	cancelInvitation(invitationId) {
		this._networkManager.sendMessage("cancel_invitation", { invitation_id: invitationId });
	}

	kickPlayer(playerId) {
		this._networkManager.sendMessage("kick_player", { player_id: playerId });
	}

	// UI updates
	_setLoading(isLoading) {
		const startButton = document.querySelector('#startGameBtn');
		if (startButton) {
			startButton.disabled = isLoading;
			startButton.textContent = isLoading ? 'Starting...' : 'Start Game';
		}
	}

	_setStarted(isStarted) {
		const startButton = document.querySelector('#startGameBtn');
		if (startButton) {
			startButton.disabled = isStarted;
			startButton.textContent = isStarted ? 'Started' : 'Start Game';
		}
	}

	// Utility methods
	_updateGameSettings(settings) {
		if (this._pongGame) {
			logger.debug('Updating game settings:', settings);
			this._pongGame.updateSettings(settings);
		}
	}

	_handleAIDifficultyChange(difficulty) {
		logger.info(`Setting AI difficulty to ${difficulty}`);
		if (this._pongGame) {
			this._pongGame.setAIMode(true, difficulty);
		}
		this._notifyUpdate("ai_difficulty", difficulty);
		dynamicRender.scheduleUpdate();
	}

	_notifyUpdate(property, value) {
		if (property === 'mode' && value === this._mode) {
			return;
		}

		if (this._updateTimeout) {
			clearTimeout(this._updateTimeout);
		}

		this._updateTimeout = setTimeout(() => {
			this._networkManager.sendMessage("update_property", { property, value });
			this._updateTimeout = null;
		}, 100);
	}

	_logCurrentState() {
		logger.info("Room - Current state:", {
			roomId: this._roomId,
			mode: this._mode,
			owner: this._owner,
			players: this._players,
			pendingInvitations: this._pendingInvitations,
			maxPlayers: this._maxPlayers,
			availableSlots: this.availableSlots,
			state: this._state,
			currentUser: this._currentUser
		});
	}

	_getPublicState() {
		const canStartGame = this._canStartGame();
		const isOwner = this._owner.id === this._currentUser.id;

		return {
			mode: this._mode,  // Use _mode directly instead of settings.mode
			state: this._state,
			owner: this._owner,
			players: this._players,
			pendingInvitations: this._pendingInvitations,
			maxPlayers: this._maxPlayers,
			currentUser: this._currentUser,
			availableSlots: this.availableSlots,
			canStartGame: canStartGame,
			isOwner: isOwner,
			settings: {
				...this._settings,
				mode: this._mode  // Ensure settings.mode matches the room mode
			},
			gameStarted: this._state === Room.States.PLAYING,
			handleSettingChange: (setting, value, parseAsInt) => {
				if (this._state !== Room.States.PLAYING) {
					const parsedValue = parseAsInt ? parseInt(value) : value;
					this._settings[setting] = parsedValue;
					this.updateSetting(setting, parsedValue);
				}
			},
			kickPlayer: (playerId) => this.kickPlayer(playerId),
			cancelInvitation: (invitationId) => this.cancelInvitation(invitationId),
			changeMode: (event) => this.changeMode(event),
			getProgressBarStyle: (value) => {
				const numericValue = parseInt(value) || 1;
				let percentage;

				// Special handling for paddleSize which has a range of 1-100
				if (this._settings && Object.keys(this._settings).includes('paddleSize') && value === this._settings.paddleSize) {
					percentage = numericValue;  // paddleSize is already in percentage (1-100)
				} else {
					// Other settings use 1-10 range
					const clampedValue = Math.max(1, Math.min(10, numericValue));
					percentage = clampedValue * 10;
				}

				return {
					width: `${percentage}%`,
					transition: 'width 0.3s ease'
				};
			}
		};
	}

	_canStartGame() {
		const playerCount = this._players.length;
		if (this._mode === Room.Modes.TOURNAMENT) {  // Use this._mode directly
			return playerCount >= 3 && playerCount <= this._maxPlayers;
		} else if (this._mode === Room.Modes.AI) {  // Use this._mode directly
			return playerCount === 1;
		}
		return playerCount === this._maxPlayers;
	}

	destroy() {
		if (this._pongGame) {
			this._pongGame.destroy();
			this._pongGame = null;
		}
		if (this._networkManager) {
			this._networkManager.destroy();
			this._networkManager = null;
		}
		if (this._unsubscribeRoom) {
			this._unsubscribeRoom();
		}
		if (this._unsubscribeUser) {
			this._unsubscribeUser();
		}

		// Clean up global handler
		window.handleSettingChange = undefined;
	}

	updateState(newState) {
		if (Object.values(Room.States).includes(newState)) {
			this._state = newState;
			dynamicRender.scheduleUpdate();
		} else {
			logger.error(`Invalid room state: ${newState}`);
		}
	}

	// Settings methods
	async updateSetting(setting, value) {
		if (this._state === Room.States.PLAYING) {
			logger.debug('Cannot update settings while game is in progress');
			return;
		}

		if (!this._settings.hasOwnProperty(setting)) return;

		// Validate the setting value
		const validatedSettings = GameRules.validateSettings({
			...this._settings,
			[setting]: value
		});

		// Update local settings
		this._settings[setting] = validatedSettings[setting];

		// Update game if it exists
		if (this._pongGame) {
			this._pongGame.updateSettings({ [setting]: validatedSettings[setting] });
		}

		// Notify other players through WebSocket
		this._networkManager.sendMessage('update_property', {
			property: 'settings',
			setting: setting,
			value: validatedSettings[setting]
		});

		// Update store
		this._store.dispatch({
			domain: 'room',
			type: 'UPDATE_ROOM_SETTINGS',
			payload: {
				roomId: this._roomId,
				settings: {
					...this._settings
				}
			}
		});

		// Update UI
		dynamicRender.addObservedObject('pongRoom', {
			...this._getPublicState()
		});
		dynamicRender.scheduleUpdate();
	}

	_handleSettingsUpdate(data) {
		logger.debug('Handling settings update:', data);
		if (typeof data === 'object' && data !== null) {
			let hasChanges = false;

			// Handle single setting update
			if (data.setting && data.value !== undefined) {
				const { setting, value } = data;
				if (setting in this._settings && !this._modeUpdateInProgress) {
					this._settings[setting] = ['paddleSpeed', 'ballSpeed', 'paddleSize', 'maxScore'].includes(setting)
						? parseInt(value)
						: value;
					if (this._pongGame) {
						this._pongGame.updateSettings({ [setting]: this._settings[setting] });
					}
					hasChanges = true;
				}
			}
			// Handle full settings object update
			else if (data.settings || data.value?.settings) {
				const newSettings = data.settings || data.value.settings;
				if (!this._modeUpdateInProgress) {
					Object.entries(newSettings).forEach(([setting, value]) => {
						if (setting in this._settings) {
							this._settings[setting] = ['paddleSpeed', 'ballSpeed', 'paddleSize', 'maxScore'].includes(setting)
								? parseInt(value)
								: value;
						}
					});
					if (this._pongGame) {
						this._pongGame.updateSettings(this._settings);
					}
					hasChanges = true;
				}
			}

			// Update room state if provided
			if (data.room_state && !this._modeUpdateInProgress) {
				this.updateFromState(data.room_state);
			} else if (hasChanges) {
				// Force a UI update with current state
				this._store.dispatch({
					domain: 'room',
					type: 'UPDATE_ROOM_SETTINGS',
					payload: {
						roomId: this._roomId,
						settings: this._settings
					}
				});

				// Update UI
				dynamicRender.addObservedObject('pongRoom', {
					...this._getPublicState()
				});
				dynamicRender.scheduleUpdate();
			}
		}
	}

	get settings() { return this._settings; }
} 