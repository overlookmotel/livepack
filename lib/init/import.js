/* --------------------
 * livepack module
 * Replacement for `import` statements.
 * ------------------*/

'use strict';

// Modules
const Module = require('module'),
	createResolve = require('enhanced-resolve').create.sync,
	hasOwnProp = require('has-own-prop');

// Imports
const {modules} = require('../internal.js');

// Exports

const resolve = createResolve({
	conditionNames: ['import', 'node', 'default'],
	extensions: []
});
const builtInModules = new Set(Module.builtinModules);
const cache = new WeakMap();

module.exports = function(dirPath) {
	function importSync(importPath) {
		// Resolve file path
		const path = builtInModules.has(importPath)
			? importPath
			: resolve(dirPath, importPath);

		// Return from cache if exists
		const cached = cache.get(path);
		if (cached) return cache;

		// Require file and wrap exports
		// eslint-disable-next-line import/no-dynamic-require, global-require
		const mod = require(path);

		const isEsModule = mod && mod.__esModule;
		const proxy = wrapModule(mod, isEsModule);

		// Save to cache
		cache.set(path, proxy);

		// Create module record
		modules.set(proxy, {path, isEsModule});

		// Return proxy
		return proxy;
	}

	function importAsync(requirePath) {
		// Error in `importSync()` causes promise rejection not sync error
		return new Promise(resolvePromise => resolvePromise(importSync(requirePath)));
	}

	return [importSync, importAsync];
};

const proxyTarget = Object.preventExtensions(Object.create(null));

function wrapModule(mod, isEsModule) {
	const isObject = mod && ['object', 'function'].includes(typeof mod);

	const proxy = new Proxy(proxyTarget, {
		ownKeys() {
			const keys = isObject ? Object.keys(Object.getOwnPropertyDescriptor(mod)) : [];
			if (!keys.includes('default')) keys.push('default');
			keys.push(Symbol.toStringTag);
			return keys;
		},
		getOwnPropertyDescriptor(key) {
			// TODO Necessary to conform `key` to string?
			if (key === Symbol.toStringTag) {
				return {value: 'Module', writable: false, enumerable: false, configurable: false};
			}
			if (typeof key === 'symbol') return undefined;

			let value;
			if (key === 'default' && !isEsModule) {
				value = mod;
			} else if (hasOwnProp(proxy, key)) {
				value = mod[key];
			} else {
				return undefined;
			}

			return {value, writable: true, enumerable: true, configurable: false};
		},
		defineProperty() {
			// TODO Throws errors in correct circumstances, but wrong error messages
			return false;
		},
		set(key) {
			// Trap has no effect except to mimic error messages produced by Node.
			// If this trap was not defined, errors would be thrown in same circumstances.
			// TODO If key is an object, does `.toString()` get called same number of times as for with Node?
			// TODO Do error stack traces include the trap function?
			if (hasOwnProp(proxy, key)) {
				throw new TypeError(`Cannot assign to read only property '${key}' of object '[object Module]`);
			} else {
				throw new TypeError(`Cannot add property ${key}, object is not extensible`);
			}
		}
		/*
		get() {
			// TODO Does `getOwnPropertyDescriptor` trap render this unnecessary?
		},
		has() {
			// TODO Does `getOwnPropertyDescriptor` trap render this unnecessary?
		},
		deleteProperty() {
			// TODO Does `getOwnPropertyDescriptor` trap render this unnecessary?
			return false;
		}
		*/
		// `apply`, `construct`, `getPrototypeOf`, `setPrototypeOf`, `isExtensible`, `preventExtensions`
		// traps are not required - default traps do what's needed.
	});

	return proxy;
}
