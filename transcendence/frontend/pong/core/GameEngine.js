import logger from '../../logger';

export class GameEngine {
	constructor() {
		this._gameState = null;
		this._gameLoop = null;
		this._components = new Map();
		this._isRunning = false;
		this._isDestroying = false;
	}

	registerComponent(name, component) {
		this._components.set(name, component);
		logger.debug(`Component registered: ${name}`);
	}

	unregisterComponent(name) {
		if (this._components.has(name)) {
			this._components.delete(name);
			return true;
		}
		return false;
	}

	getComponent(name) {
		return this._components.get(name);
	}

	start() {
		if (this._isRunning) return;
		this._isRunning = true;

		// Initialize all components
		logger.info('Initializing game engine components...');
		for (const [name, component] of this._components.entries()) {
			if (component && component.initialize) {
				logger.debug(`Initializing component: ${name}`);
				component.initialize();
			}
		}

		logger.info('Starting game loop');
		this._gameLoop = requestAnimationFrame(this._update.bind(this));
	}

	stop() {
		if (this._animationFrameId) {
			cancelAnimationFrame(this._animationFrameId);
			this._animationFrameId = null;
		}
		this._isRunning = false;
	}

	_update() {
		if (!this._isRunning) {
			logger.debug('Game engine not running, skipping update');
			return;
		}

		// Get game state component
		const gameState = this._components.get('state');
		if (gameState && gameState.update) {
			gameState.update();
		}

		// Update AI first if it exists
		const aiHandler = this._components.get('aiHandler');
		if (aiHandler && aiHandler.update) {
			logger.debug('Updating AI handler');
			aiHandler.update();
		} else if (this._components.has('aiHandler')) {
			logger.warn('AI handler exists but has no update method');
		}

		// Update all other components except AI and state
		for (const [name, component] of this._components.entries()) {
			if (component !== gameState && component !== aiHandler && component.update) {
				logger.debug(`Updating component: ${name}`);
				component.update();
			}
		}

		// Launch ball if needed and if we have a controller
		const controller = this._components.get('controller');
		if (controller && controller.launchBall && typeof controller.launchBall === 'function') {
			controller.launchBall();
		}

		// Update renderer with current state
		const renderer = this._components.get('renderer');
		if (renderer) {
			renderer.render(gameState.getState());
		}

		// Schedule next frame
		this._animationFrameId = requestAnimationFrame(this._update.bind(this));
	}

	destroy() {
		this.stop();
		if (this._isDestroying) return;
		this._isDestroying = true;

		for (const [name, component] of this._components.entries()) {
			if (component && component.destroy && name !== 'controller') {
				component.destroy();
			}
		}
		this._components.clear();
		this._isDestroying = false;
	}

	update() {
		const state = this._components.get('state');
		if (!state) return;

		const currentState = state.getState();
		if (currentState.gameStatus === 'finished') {
			this.stop();
			return;
		}

		// Update all components
		for (const [name, component] of this._components.entries()) {
			if (component && component.update && name !== 'controller') {
				component.update();
			}
		}
	}
} 