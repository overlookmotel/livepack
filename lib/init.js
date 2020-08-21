/* --------------------
 * livepack module
 * Init.
 * Catalog globals + built-in modules.
 * Shim `Function.prototype.bind` + `Symbol`.
 * ------------------*/

/* global WeakRef, FinalizationRegistry */

'use strict';

// Modules
const {builtinModules} = require('module');

// Imports
const internal = require('./internal.js'),
	tracker = require('./tracker.js'),
	{
		isPrimitive,
		GeneratorPrototype, AsyncFunctionPrototype, AsyncGeneratorPrototype,
		TypedArrayPrototype, URLSymbols, URLContext
	} = require('./shared.js');

// Init internal vars

const weakRefSupported = typeof WeakRef !== 'undefined' && typeof FinalizationRegistry !== 'undefined';

internal.boundFunctions = getBoundFunctions();
internal.weakSets = getWeakSets();
internal.weakMaps = getWeakMaps();
internal.emptyStringSymbols = getEmptyStringSymbols();
internal.globals = getGlobals();
const commonJsVars = new Map();
internal.commonJsVars = commonJsVars;

// Exports

// Capture `module` + `require` from file + return tracker
module.exports = (path, module, require) => {
	commonJsVars.set(module, {name: 'module', path});
	commonJsVars.set(require, {name: 'require', path});
	return tracker;
};

// Shim `Function.prototype.bind` to store details of bound functions
function getBoundFunctions() {
	const boundFunctions = new WeakMap();

	const bindOriginal = Function.prototype.bind;
	const {bind} = { // Use object method to prevent `.bind()` having prototype, like native `.bind()`
		bind(...vars) {
			const boundFn = bindOriginal.call(this, ...vars);
			boundFunctions.set(boundFn, {fn: this, vars});
			return boundFn;
		}
	};

	Object.defineProperty(bind, 'length', {value: 1}); // To emulate native `.bind()` function

	Function.prototype.bind = bind; // eslint-disable-line no-extend-native

	return boundFunctions;
}

// Shim `WeakSet` to make iterable
function getWeakSets() {
	if (!weakRefSupported) return undefined;

	const weakSets = new WeakMap();

	WeakSet = function WeakSet(...iterables) { // eslint-disable-line no-global-assign
		const refs = new Set();
		weakSets.set(this, {
			refs,
			mapping: new WeakMap(),
			finalizationRegistry: new FinalizationRegistry(ref => refs.delete(ref))
		});

		const iterable = iterables[0];
		if (iterable) {
			for (const element of iterable) {
				this.add(element);
			}
		}
	};

	addNonEnumProps(WeakSet.prototype, {
		delete(element) {
			const {refs, mapping, finalizationRegistry} = weakSets.get(this);
			const ref = mapping.get(element);
			if (!ref) return false;

			mapping.delete(element);
			ref.deref();
			refs.delete(ref);
			finalizationRegistry.unregister(ref);
			return true;
		},

		has(element) {
			const {mapping} = weakSets.get(this);
			return mapping.has(element);
		},

		add(element) {
			const {refs, mapping, finalizationRegistry} = weakSets.get(this);
			const ref = new WeakRef(element);
			mapping.set(element, ref);
			refs.add(ref);
			finalizationRegistry.register(element, ref, ref);
			return this;
		}
	});

	// eslint-disable-next-line no-extend-native
	Object.defineProperty(WeakSet.prototype, Symbol.toStringTag, {value: 'WeakSet', configurable: true});

	return weakSets;
}

// Shim `WeakMap` to make iterable
// Adpated from https://github.com/tc39/proposal-weakrefs#iterable-weakmaps
function getWeakMaps() {
	if (!weakRefSupported) return undefined;

	const weakMaps = new WeakMap();

	const WeakMapOriginal = WeakMap;
	WeakMap = function WeakMap(...iterables) { // eslint-disable-line no-global-assign
		const refs = new Set();
		weakMaps.set(this, {
			refs,
			mapping: new WeakMapOriginal(),
			finalizationRegistry: new FinalizationRegistry(ref => refs.delete(ref))
		});

		const iterable = iterables[0];
		if (iterable) {
			for (const [key, value] of iterable) {
				this.set(key, value);
			}
		}
	};

	addNonEnumProps(WeakMap.prototype, {
		delete(key) {
			const {refs, mapping, finalizationRegistry} = weakMaps.get(this);
			const entry = mapping.get(key);
			if (!entry) return false;

			mapping.delete(key);
			const {ref} = entry;
			ref.deref();
			refs.delete(ref);
			mapping.delete(key);
			finalizationRegistry.unregister(ref);

			return true;
		},

		get(key) {
			const {mapping} = weakMaps.get(this);
			const entry = mapping.get(key);
			return entry && entry.value;
		},

		set(key, value) {
			const {refs, mapping, finalizationRegistry} = weakMaps.get(this);
			const ref = new WeakRef(key);
			mapping.set(key, {ref, value});
			refs.add(ref);
			finalizationRegistry.register(key, ref, ref);
			return this;
		},

		has(key) {
			const {mapping} = weakMaps.get(this);
			return mapping.has(key);
		}
	});

	// eslint-disable-next-line no-extend-native
	Object.defineProperty(WeakMap.prototype, Symbol.toStringTag, {value: 'WeakMap', configurable: true});

	return weakMaps;
}

// Shim `Symbol` to record Symbols with empty string description in Node v10
function getEmptyStringSymbols() {
	if (Symbol('x').description) return undefined;

	const emptyStringSymbols = new Set();

	const SymbolOriginal = Symbol;
	Symbol = function Symbol(description) { // eslint-disable-line no-global-assign
		const symbol = SymbolOriginal(description);
		if (description === '') emptyStringSymbols.add(symbol);
		return symbol;
	};

	Object.defineProperties(Symbol, Object.getOwnPropertyDescriptors(SymbolOriginal));
	Symbol.prototype.constructor = Symbol; // eslint-disable-line no-extend-native

	return emptyStringSymbols;
}

// Catalog globals
function getGlobals() {
	const globals = new Map(); // Keyed by value

	globals.set(global, {parent: null, key: 'globalThis', isModule: false});

	// Done first to prevent being located at a deeper position encountered first
	// e.g. `Number.POSITIVE_INFINITY` rather than `Infinity`
	catalogGlobal(NaN, 'NaN', false);
	catalogGlobal(Infinity, 'Infinity', false);
	catalogGlobal(-Infinity, null, false);
	catalogGlobal(TypedArrayPrototype, null, false);

	for (const key of Object.getOwnPropertyNames(global)) {
		if (key === 'GLOBAL' || key === 'root') continue;
		catalogGlobal(
			global[key], key, false,
			// Skip `process.mainModule`
			key === 'process' ? childKey => childKey === 'mainModule' : undefined
		);
	}

	catalogGlobal(GeneratorPrototype, null, false);
	catalogGlobal(AsyncFunctionPrototype, null, false);
	catalogGlobal(AsyncGeneratorPrototype, null, false);
	catalogGlobal(URLSymbols, null, false);
	catalogGlobal(URLContext, null, false);

	// Catalog built-in modules
	for (const key of builtinModules) {
		// Skip deprecated modules
		if (
			key === 'sys' || key === '_stream_wrap'
			|| key.startsWith('v8/') || key.startsWith('node-inspect/')
		) continue;

		const val = require(key); // eslint-disable-line global-require, import/no-dynamic-require
		catalogGlobal(
			val, key, true,
			// Skip `require('module')._cache`
			key === 'module' ? childKey => childKey === '_cache' : undefined
		);
	}

	return globals;

	function catalogGlobal(val, key, isModule, shouldSkipKey) {
		return catalogGlobalVal(val, key, null, isModule, shouldSkipKey);
	}

	function catalogGlobalVal(val, key, parent, isModule, shouldSkipKey) {
		if (isPrimitive(val)) return;
		if (globals.has(val)) return;

		globals.set(val, {parent, key, isModule});

		for (const childKey of Object.getOwnPropertyNames(val)) {
			const descriptor = Object.getOwnPropertyDescriptor(val, childKey);
			if (!('value' in descriptor)) continue; // Skip getters
			if (shouldSkipKey && shouldSkipKey(childKey)) continue;
			catalogGlobalVal(val[childKey], childKey, val, isModule);
		}
	}
}

function addNonEnumProps(obj, props) {
	for (const [key, value] of Object.entries(props)) {
		Object.defineProperty(obj, key, {
			value,
			writable: true,
			configurable: true
		});
	}
}
