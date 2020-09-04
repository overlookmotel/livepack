/* --------------------
 * livepack module
 * Catalog globals
 * ------------------*/

'use strict';

// Modules
const {builtinModules} = require('module');

// Imports
const argumentProxy = require('../serialize/argumentProxy.js'),
	{
		isPrimitive,
		GeneratorPrototype, AsyncFunctionPrototype, AsyncGeneratorPrototype, TypedArrayPrototype,
		regexSourceGetter, regexFlagsGetter
	} = require('../shared.js');

// Exports

module.exports = function getGlobals(internal) {
	const globals = new Map(); // Keyed by value

	// Catalog internal vars
	recordGlobal(internal, 'livepack/lib/internal.js', null, true);
	recordGlobal(globals, 'globals', internal, false);
	for (const key in internal) {
		recordGlobal(internal[key], key, internal, false);
	}

	recordGlobal(argumentProxy, 'livepack/lib/serialize/argumentProxy.js', null, true);

	// Record `global` object
	recordGlobal(global, 'globalThis', null, false);

	// Done first to prevent being located at a deeper position encountered first
	// e.g. `Number.POSITIVE_INFINITY` rather than `Infinity`
	recordGlobal(undefined, null, null, false);
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
	catalogGlobal(regexSourceGetter, null, false);
	catalogGlobal(regexFlagsGetter, null, false);

	const {urlVars} = internal;
	catalogGlobal(urlVars.URLSymbols, null, false);
	catalogGlobal(urlVars.URLContext, null, false);

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

		recordGlobal(val, key, parent, isModule);

		for (const childKey of Object.getOwnPropertyNames(val)) {
			const descriptor = Object.getOwnPropertyDescriptor(val, childKey);
			if (!('value' in descriptor)) continue; // Skip getters
			if (shouldSkipKey && shouldSkipKey(childKey)) continue;
			catalogGlobalVal(val[childKey], childKey, val, isModule);
		}
	}

	function recordGlobal(val, key, parent, isModule) {
		globals.set(val, {parent, key, isModule});
	}
};
