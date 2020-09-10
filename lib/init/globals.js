/* --------------------
 * livepack module
 * Catalog globals
 * ------------------*/

'use strict';

// Modules
const {builtinModules} = require('module');

// Imports
const {
	isPrimitive,
	GeneratorPrototype, AsyncFunctionPrototype, AsyncGeneratorPrototype,
	TypedArrayPrototype, URLSymbols, URLContext, CallSite
} = require('../shared.js');

// Exports

module.exports = function getGlobals() {
	const globals = new Map(); // Keyed by value

	globals.set(global, {parent: null, key: 'globalThis', isModule: false});

	// Done first to prevent being located at a deeper position encountered first
	// e.g. `Number.POSITIVE_INFINITY` rather than `Infinity`
	globals.set(undefined, {parent: null, key: null, isModule: false});
	catalogGlobal(NaN, 'NaN', false);
	catalogGlobal(Infinity, 'Infinity', false);
	catalogGlobal(-Infinity, null, false);
	catalogGlobal(TypedArrayPrototype, null, false);

	for (const key of Object.getOwnPropertyNames(global)) {
		// `jasmine` is excluded as `jasmine.process` === `process` and it is reached first.
		// `jasmine` global should only exist when running tests with `jasmine` or `jest`.
		if (key === 'GLOBAL' || key === 'root' || key === 'jasmine') continue;
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
	catalogGlobal(CallSite, null, false);

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
			if (shouldSkipKey && shouldSkipKey(childKey)) continue;
			if ('value' in descriptor) {
				catalogGlobalVal(descriptor.value, childKey, val, isModule);
			} else {
				const {get, set} = descriptor;
				if (get) catalogGlobalVal(get, {type: 'getter', key: childKey}, val, isModule);
				if (set) catalogGlobalVal(set, {type: 'setter', key: childKey}, val, isModule);
			}
		}
	}
};
