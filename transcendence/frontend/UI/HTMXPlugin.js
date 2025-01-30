import logger from '../logger.js';
import jaiPasVu from './JaiPasVu.js';
import Store from '../state/store.js';
import { htmx } from '../vendor.js';

/**
 * HTMXService - Integrates HTMX with JaiPasVu and StateSync
 * 
 * Features:
 * - Request processing and tracking
 * - State management
 * - Event handling
 * - HTMX-specific directives
 * - State synchronization
 */

// HTMX Plugin for JaiPasVu
const HTMXPlugin = {
	name: 'htmx',
	install(app) {
		// Configure HTMX defaults
		htmx.config.defaultSwapStyle = "innerHTML";
		htmx.config.defaultSettleDelay = 100;
		htmx.config.historyCacheSize = 10;

		// // Initialize UI state from localStorage
		// const store = Store.getInstance();
		// const savedState = localStorage.getItem('ui_state');
		// if (savedState) {
		// 	try {
		// 		const uiState = JSON.parse(savedState);
		// 		store.dispatch({
		// 			domain: 'ui',
		// 			type: 'INITIALIZE',
		// 			payload: uiState
		// 		});
		// 	} catch (error) {
		// 		logger.error('Error initializing UI state:', error);
		// 	}
		// }

		// Register HTMX state
		app.registerData('htmx', {
			isProcessing: false,
			processingClass: 'htmx-processing',
			swapStyle: 'innerHTML',
			requests: new Map()
		});

		// Register HTMX methods
		app.registerMethods('htmx', {
			processRequest(target, options = {}) {
				const state = app.getState('htmx');
				if (!state) return null;

				const requestId = Date.now().toString();

				// Add processing state
				state.isProcessing = true;
				target.classList.add(state.processingClass);

				// Track request
				state.requests.set(requestId, {
					target,
					options,
					timestamp: Date.now()
				});

				// Return request handlers
				return {
					onComplete: () => {
						if (state) {
							// Remove processing state
							state.isProcessing = false;
							target.classList.remove(state.processingClass);

							// Clean up request
							state.requests.delete(requestId);

							// Trigger UI update if needed
							if (options.updateUI) {
								app.emit('updated');
							}
						}
					},
					onError: (error) => {
						logger.error('HTMX request failed:', error);
						if (state) {
							state.isProcessing = false;
							target.classList.remove(state.processingClass);
							state.requests.delete(requestId);
						}
					}
				};
			},

			getActiveRequests() {
				const state = app.getState('htmx');
				return state ? Array.from(state.requests.values()) : [];
			},

			cancelRequest(target) {
				const state = app.getState('htmx');
				if (!state) return;

				// Find and remove request for target
				for (const [id, request] of state.requests) {
					if (request.target === target) {
						state.requests.delete(id);
						target.classList.remove(state.processingClass);
						break;
					}
				}
			},

			setProcessingClass(className) {
				const state = app.getState('htmx');
				if (state) {
					state.processingClass = className;
				}
			},

			setSwapStyle(style) {
				const state = app.getState('htmx');
				if (state) {
					state.swapStyle = style;
				}
			}
		});

		// Register computed properties
		app.registerComputed('htmx', {
			hasActiveRequests: function () {
				return this.requests.size > 0;
			},
			activeRequestCount: function () {
				return this.requests.size;
			}
		});

		// Setup HTMX event handlers
		this.setupEventHandlers(app);

		// Setup HTMX-specific directives
		this.setupDirectives(app);
	},

	setupEventHandlers(app) {
		const store = Store.getInstance();

		document.body.addEventListener('htmx:beforeRequest', (event) => {
			const target = event.detail.elt;
			const domain = target.getAttribute('data-domain') || 'global';

			app.emit('htmx:beforeRequest', event);
		});

		document.body.addEventListener('htmx:afterRequest', (event) => {
			const target = event.detail.elt;
			const domain = target.getAttribute('data-domain') || 'global';

			app.emit('htmx:afterRequest', event);
		});

		document.body.addEventListener('htmx:beforeSwap', (event) => {
			const target = event.detail.target;
			if (target) {
				// Preserve UI state before swap
				const uiState = store.getState('ui');
				if (uiState) {
					sessionStorage.setItem('ui_state', JSON.stringify(uiState));
				}
				app.cleanup(target);
			}
			app.emit('htmx:beforeSwap', event);
		});

		document.body.addEventListener('htmx:afterSwap', (event) => {
			const target = event.detail.target;
			if (target) {
				// Restore UI state after swap
				const savedUiState = sessionStorage.getItem('ui_state');
				if (savedUiState) {
					const uiState = JSON.parse(savedUiState);
					store.dispatch({
						domain: 'ui',
						type: 'INITIALIZE',
						payload: uiState
					});
					sessionStorage.removeItem('ui_state');
				}

				// First process state updates from server
				this.processStateUpdates(app, event.detail);

				// Then recompile the swapped element and its children
				app.compileElement(target);

				// Ensure any new HTMX elements are properly initialized
				htmx.process(target);
			}
			app.emit('htmx:afterSwap', event);
		});

		// Add mutation observer to handle dynamically added HTMX elements
		const observer = new MutationObserver((mutations) => {
			mutations.forEach(mutation => {
				mutation.addedNodes.forEach(node => {
					if (node.nodeType === 1) { // Element node
						if (node.hasAttribute('hx-get') || node.hasAttribute('hx-post')) {
							app.compileElement(node);
							htmx.process(node);
						}
					}
				});
			});
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true
		});

		document.body.addEventListener('htmx:responseError', (event) => {
			logger.error('HTMX response error:', event.detail);
			app.emit('htmx:error', event);
		});
	},

	setupDirectives(app) {
		app.on('beforeCompile', (el) => {
			Array.from(el.attributes || []).forEach(attr => {
				if (attr.name.startsWith('v-hx-')) {
					const htmxAttr = attr.name.replace('v-hx-', 'hx-');
					el.setAttribute(htmxAttr, attr.value);
				}
			});

			if (el.hasAttribute('hx-get') || el.hasAttribute('hx-post')) {
				el.setAttribute('hx-indicator', `[data-loading="global"]`);
			}
		});
	},

	processStateUpdates(app, detail) {
		const store = Store.getInstance();

		// Process HX-Trigger header
		const triggerHeader = detail.headers?.['HX-Trigger'];
		if (triggerHeader) {
			try {
				const triggers = JSON.parse(triggerHeader);
				Object.entries(triggers).forEach(([key, value]) => {
					if (key === 'stateUpdate') {
						const { domain, state } = value;
						store.dispatch({
							domain,
							type: 'UPDATE_FROM_SERVER',
							payload: state
						});
						app.registerData(domain, state);
					} else {
						// Handle other custom triggers
						app.emit(`htmx:trigger:${key}`, value);
					}
				});
			} catch (error) {
				logger.error('Error processing HX-Trigger header:', error);
			}
		}

		// Process state updates in response body
		const stateData = detail.target?.querySelector('[data-state-update]');
		if (stateData) {
			try {
				const updates = JSON.parse(stateData.textContent);
				Object.entries(updates).forEach(([domain, state]) => {
					store.dispatch({
						domain,
						type: 'UPDATE_FROM_SERVER',
						payload: state
					});
					app.registerData(domain, state);
				});
			} catch (error) {
				logger.error('Error processing state updates:', error);
			}
		}
	}
};

export { HTMXPlugin };

// Utility functions
export function isProcessing() {
	return jaiPasVu.getState('htmx')?.isProcessing || false;
}

export function getProcessingClass() {
	return jaiPasVu.getState('htmx')?.processingClass || 'htmx-processing';
}

export function getSwapStyle() {
	return jaiPasVu.getState('htmx')?.swapStyle || 'innerHTML';
}

export function getActiveRequests() {
	return jaiPasVu.callMethod('htmx', 'getActiveRequests') || [];
}

export function cancelRequest(target) {
	jaiPasVu.callMethod('htmx', 'cancelRequest', target);
}

// Export service interface
export const HTMXService = {
	isProcessing,
	getProcessingClass,
	getSwapStyle,
	getActiveRequests,
	cancelRequest,

	// State preservation methods
	preserveState(domain) {
		jaiPasVu.callMethod('htmx', 'preserveState', domain);
	},

	restoreState(domain) {
		jaiPasVu.callMethod('htmx', 'restoreState', domain);
	},

	// Configuration methods
	setProcessingClass(className) {
		jaiPasVu.callMethod('htmx', 'setProcessingClass', className);
	},

	setSwapStyle(style) {
		jaiPasVu.callMethod('htmx', 'setSwapStyle', style);
	},

	// Request helper
	request(url, options = {}) {
		const {
			method = 'get',
			target = null,
			swap = getSwapStyle(),
			values = null,
			headers = {},
			domain = 'global'
		} = options;

		return htmx.ajax(method, url, {
			target,
			swap,
			values,
			headers: {
				...headers,
				'X-Domain': domain
			}
		});
	}
};

// Export plugin for use in main.js
export const plugin = HTMXPlugin; 
