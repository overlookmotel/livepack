/* --------------------
 * livepack module
 * Init.
 * Catalog globals + built-in modules.
 *
 * ------------------*/

'use strict';

// Modules
const {builtinModules} = require('module');

// Imports
const internal = require('./internal.js'),
	{
		isPrimitive,
		GeneratorPrototype, AsyncFunctionPrototype, AsyncGeneratorPrototype,
		URLSymbols, URLContext
	} = require('./shared.js');

// Run

internal.boundFunctions = getBoundFunctions();
internal.emptyStringSymbols = getEmptyStringSymbols();
internal.globals = getGlobals();

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

	globals.set(global, {parent: null, key: 'global', isModule: false});

	// Done first to prevent being located at a deeper position encountered first
	// e.g. `Number.POSITIVE_INFINITY` rather than `Infinity`
	catalogGlobal(NaN, 'NaN', false);
	catalogGlobal(Infinity, 'Infinity', false);
	catalogGlobal(-Infinity, null, false);

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
