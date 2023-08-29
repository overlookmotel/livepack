/* --------------------
 * livepack module
 * Catalog globals + built-in modules
 * ------------------*/

'use strict';

// Modules
const Module = require('module');

// Imports
const {isPrimitive} = require('../shared/functions.js'),
	{GLOBAL, MODULE, VALUE, GETTER, SETTER, PROTO, SPECIAL} = require('../shared/constants.js'),
	{URLSymbols, URLContext} = require('../shared/globals.js'),
	getCallSite = require('../runtime/getCallSite.js');

// Exports

module.exports = {populateGlobals, catalogBuiltInModule};

const {getPrototypeOf} = Object,
	CallSite = getCallSite();

/**
 * Catalog globals.
 * Adds entries to `Map` passed in. Entries keyed by value.
 * Map values are objects of form `{type, parent, key}`.
 * `type` is one of: GLOBAL, MODULE, VALUE, GETTER, SETTER, PROTO, SPECIAL.
 * `parent` is the parent value.
 * `key` is the key on the parent where this value can be found.
 *
 * e.g:
 * `Object.assign` -> `{type: VALUE, parent: Object, key: 'assign'}`
 * `require('fs')` -> `{type: MODULE, parent: null, key: 'fs'}`
 * `Object.getPrototypeOf(function*() {}) -> `{type: PROTO, parent: function*() {}, key: null}`
 *
 * Cataloging aims to find shortest route to any value, where they appear more than once in API surface.
 * It prioritizes access by key `x.y` over prototypes (`Object.getPrototypeOf(x)`)
 * and getters/setters (`Object.getOwnPropertyDescriptors(x, 'y').get`).
 * Globals have priority over built-in modules.
 *
 * It performs a breadth-first search, first of all direct properties (`x.y`, `x.y.z`) up to any depth,
 * then over prototypes and getters/setters.
 *
 * Some values are hidden behind getters. Where the getter is configurable, it is shimmed so that the
 * value (and its properties) are catalogued when the getter is called. If the getter is not configurable
 * and so cannot be shimmed, the getter is executed immediately, to get the value behind it.
 *
 * There's a limit on depth to triggering getters. They are not shimmed/triggered if:
 *   - the getter is on a `.prototype` property
 *   - the getter is on a `__proto__`
 *   - the getter is on an object which itself was hidden behind a getter
 * These limits are to prevent unexpected side effects.
 *
 * @param {Map} globals - Globals map
 * @returns {undefined}
 */
function populateGlobals(globals) {
	// Register `undefined` as a global
	globals.set(undefined, {type: SPECIAL, parent: null, key: 'undefined'});

	catalogGlobals(globals);

	// Catalog `require('module')` eagerly since it's available to user code without using `require`
	// as `module.constructor`.
	// All other built-in NodeJS modules are cataloged lazily when they're `require()`-ed.
	catalogBuiltInModule('module', Module, globals);

	catalogSpecials(globals);
}

/**
 * Catalog global vars.
 * @param {Map} globals - Map of globals
 * @returns {undefined}
 */
function catalogGlobals(globals) {
	// Register `global`
	globals.set(global, {type: GLOBAL, parent: null, key: 'globalThis'});

	// Suppress warnings for experimental features
	const {emitWarning} = process;
	process.emitWarning = function(...args) { // eslint-disable-line consistent-return
		if (args[1] !== 'ExperimentalWarning') return emitWarning.apply(this, args);
	};

	// Catalog globals (give `process` lowest priority)
	const queue = new Map();
	for (const key of Object.getOwnPropertyNames(global)) {
		if (key === 'GLOBAL' || key === 'root' || key === 'process') continue;
		addToQueue(global[key], GLOBAL, null, key, false, queue);
	}

	process.emitWarning = emitWarning;

	addToQueue(process, GLOBAL, null, 'process', false, queue);

	processQueue(queue, globals);
}

/**
 * Catalog built-in module e.g. `require('fs')`.
 * @param {string} name - Module name e.g. 'fs'
 * @param {Object} exports - Module exports object
 * @param {Map} globals - Map of globals
 * @returns {undefined}
 */
function catalogBuiltInModule(name, exports, globals) {
	processOne(exports, MODULE, null, name, false, globals);
}

/**
 * Catalog a few special objects which are not accessible via Node's API
 * but can be accessed and used in code.
 * @param {Map} globals - Globals
 * @returns {undefined}
 */
function catalogSpecials(globals) {
	// Shorter version than `Number.NEGATIVE_INFINITY`
	globals.set(-Infinity, {type: SPECIAL, parent: null, key: 'minusInfinity'});

	const queue = new Map();
	for (const [fn, name] of [
		[function*() {}, 'generatorFunction'], // eslint-disable-line no-empty-function
		[async function() {}, 'asyncFunction'], // eslint-disable-line no-empty-function
		[async function*() {}, 'asyncGeneratorFunction'] // eslint-disable-line no-empty-function
	]) {
		// Replace existing references to these prototypes which were found in odd places
		// e.g. `Object.getPrototypeOf(require("fs").Dir.prototype.entries)`
		globals.delete(getPrototypeOf(fn));
		if (fn.prototype) globals.delete(getPrototypeOf(fn.prototype));
		addToQueue(fn, SPECIAL, null, name, false, queue);
	}

	if (URLSymbols) {
		addToQueue(URLSymbols, SPECIAL, null, 'URLSymbols', false, queue);
		addToQueue(URLContext, SPECIAL, null, 'URLContext', false, queue);
	}

	addToQueue(CallSite, SPECIAL, null, 'CallSite', false, queue);

	processQueue(queue, globals);
}

/**
 * Process a queue of values and add to `globals`.
 * `queue` is a Map, keyed by value, and values of form `{type, parent, key, noPreload}`.
 * `noPreload` flag indicates any getters on this value (or its properties)
 * should not be shimmed or preloaded.
 *
 * The "next level queue" is filled with properties of the values in the current queue. i.e `a` -> `a.b`
 * That queue is then processed for the next level. i.e. `a.b` -> `a.b.c`.
 * The "next priority queue" is filled with any prototypes, getters or setters encountered.
 * That queue is only processed once all levels of direct values have been processed.
 * i.e. `a.b.c.b.e.f` is processed before `Object.getPrototypeOf(a)`.
 *
 * @param {Map} queue - Queue of values to process
 * @param {Map} globals - Map of globals
 * @returns {undefined}
 */
function processQueue(queue, globals) {
	while (true) { // eslint-disable-line no-constant-condition
		const nextPriorityQueue = new Map();

		while (true) { // eslint-disable-line no-constant-condition
			const nextLevelQueue = new Map();

			for (const [val, props] of queue.entries()) {
				catalogValue(val, props, nextLevelQueue, nextPriorityQueue, globals);
			}

			if (nextLevelQueue.size === 0) break;
			queue = nextLevelQueue;
		}

		if (nextPriorityQueue.size === 0) break;
		queue = nextPriorityQueue;
	}
}

/**
 * Process single value.
 * @param {Object|Function} val - Value
 * @param {number} type - Type of entry (GLOBAL, MODULE, VALUE, GETTER, SETTER, PROTO, SPECIAL)
 * @param {Object|Function} parent - Parent value
 * @param {string} key - Property name
 * @param {boolean} noPreload - `true` if getter properties should not be preloaded
 * @param {Map} globals - Map of globals
 * @returns {undefined}
 */
function processOne(val, type, parent, key, noPreload, globals) {
	processQueue(new Map([[val, {type, parent, key, noPreload}]]), globals);
}

/**
 * Catalog a value and its properties.
 * @param {Object|Function} val - Value
 * @param {Object} props - Object of form `{type, parent, key, noPreload}`
 * @param {Map} nextLevelQueue - Queue for values on next level down i.e. `a` -> `a.b`
 * @param {Map} nextPriorityQueue - Queue for values which are accessed via `__proto__` or getter/setters
 * @param {Map} globals - Map of globals
 * @returns {undefined}
 */
function catalogValue(val, props, nextLevelQueue, nextPriorityQueue, globals) {
	if (isPrimitive(val)) return;
	if (globals.has(val)) return;
	if (val instanceof Module) return; // To prevent `Module._cache` being cataloged

	// Save to globals, discarding the `noPreload` property
	globals.set(val, {type: props.type, parent: props.parent, key: props.key});

	const {noPreload} = props;
	for (const key of Object.getOwnPropertyNames(val)) {
		const descriptor = Object.getOwnPropertyDescriptor(val, key);
		const keyNoPreload = noPreload || key === 'prototype';
		if ('value' in descriptor) {
			addToQueue(descriptor.value, VALUE, val, key, keyNoPreload, nextLevelQueue);
		} else {
			let {get, set} = descriptor; // eslint-disable-line prefer-const
			if (get) {
				if (!noPreload) get = preloadGetter(get, val, key, descriptor, nextLevelQueue, globals);
				addToQueue(get, GETTER, val, key, keyNoPreload, nextPriorityQueue);
			}
			if (set) addToQueue(set, SETTER, val, key, keyNoPreload, nextPriorityQueue);
		}
	}

	// NB `noPreload` set to true
	addToQueue(getPrototypeOf(val), PROTO, val, null, true, nextPriorityQueue);
}

/**
 * Shim or preload getter.
 * @param {Function} get - Getter
 * @param {Object|Function} parent - Parent value
 * @param {string} key - Property name
 * @param {Object} descriptor - Property descriptor
 * @param {Map} nextLevelQueue - Next level queue, to add value to if preloaded
 * @param {Map} globals - Map of globals
 * @returns {Function} - Getter (shimmed if possible to shim)
 */
function preloadGetter(get, parent, key, descriptor, nextLevelQueue, globals) {
	// Shim getter to catalog value lazily when getter is executed
	if (descriptor.configurable) {
		const shimmedGet = {
			get() {
				// Get value and add to queue for cataloging
				const val = get.call(this);
				if (this === parent && !globals.has(val)) processOne(val, VALUE, parent, key, true, globals);
				return val;
			}
		}.get;
		Object.defineProperty(parent, key, {get: shimmedGet});
		return shimmedGet;
	}

	// Cannot shim getter - get value and catalog now
	addToQueue(parent[key], VALUE, parent, key, true, nextLevelQueue);
	return get;
}

/**
 * Add to queue.
 * @param {Object|Function} val - Value
 * @param {number} type - Type of entry (GLOBAL, MODULE, VALUE, GETTER, SETTER, PROTO, SPECIAL)
 * @param {Object|Function} parent - Parent value
 * @param {string} key - Property name
 * @param {boolean} noPreload - `true` if getter properties should not be preloaded
 * @param {Map} queue - Queue to add to
 * @returns {undefined}
 */
function addToQueue(val, type, parent, key, noPreload, queue) {
	if (queue.has(val)) return;
	queue.set(val, {type, parent, key, noPreload});
}

/*
// For debugging
// TODO: Remove this
function trace(val, globals) {
	const record = globals.get(val);
	if (!record) return '<not found>';

	const {type, parent, key} = record;
	if (type === GLOBAL) return key;
	if (type === MODULE) return `require('${key}')`;
	const parentTrace = trace(parent, globals);
	if (type === VALUE) return `${parentTrace}.${key}`;
	if (type === GETTER) return `${parentTrace}.${key}<getter>`;
	if (type === SETTER) return `${parentTrace}.${key}<setter>`;
	if (type === PROTO) return `${parentTrace}.<prototypeOf>`;
	if (type === SPECIAL) return '<special>';
	return `${parentTrace}.${key}<unknown>`;
}
*/
