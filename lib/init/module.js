/* --------------------
 * livepack module
 * Patch `Module.createRequire()`
 * ------------------*/

'use strict';

// Modules
const Module = require('module');

// Imports
const {catalogBuiltInModule} = require('./globals.js'),
	{usingInternalModuleCache} = require('../shared/moduleCache.js'),
	{globals, functions: specialFunctions} = require('../shared/internal.js');

// Exports

// `require('module')` has already been catalogued
const builtinModulesUncataloged = new Set(Module.builtinModules.filter(name => name !== 'module'));

module.exports = function patchModule() {
	// Patch `createRequire` to wrap `require` functions
	// same as `require` functions created by CommonJS loader
	const createRequireOriginal = Module.createRequire;
	Module.createRequire = function createRequire(filename) {
		const require = createRequireOriginal(filename);
		return createWrappedRequire(require, filename);
	};

	// Patch `Module.prototype.require` to catalog NodeJS built-in modules when `require()`-ed
	// in user code
	const requireOriginal = Module.prototype.require;
	Module.prototype.require = (0, function(id) {
		const exports = requireOriginal.call(this, id); // eslint-disable-line no-invalid-this
		catalogIfBuiltInModule(id, exports);
		return exports;
	});
};

/**
 * Wrap `require` function.
 * Can be `module.require` or `require` function created by `createRequire()`.
 * @param {Function} require - `require` function created by NodeJS
 * @param {string} filename - Path to file require is for
 * @returns {Function} - Wrapped `require` function
 */
function createWrappedRequire(require, filename) {
	// Wrap `require`
	const wrappedRequire = function(path) {
		const exports = require(path); // eslint-disable-line import/no-dynamic-require
		catalogIfBuiltInModule(path, exports);
		return exports;
	};
	Object.defineProperties(wrappedRequire, Object.getOwnPropertyDescriptors(require));

	// Record `require`
	specialFunctions.set(require, {type: 'require', path: filename});

	// Return wrapped `require`
	return wrappedRequire;
}

// Patches to built-in modules
const modifyBuiltins = {
	__proto__: null,

	util(util) {
		// Modify `util.promisify()` to record promisified functions
		const promisifyOriginal = util.promisify,
			{custom} = promisifyOriginal;
		function promisify(original) {
			const promisifiedFn = promisifyOriginal(original);
			// Don't record if has custom promisified function defined using `custom` symbol.
			// `util.promisify` doesn't create function internally in that case.
			// NB: No need to check `original` is truthy or that `original[custom]` is function,
			// as `util.promisify` will have thrown already in these cases.
			if (!original[custom]) specialFunctions.set(promisifiedFn, {type: 'promisify', fn: original});
			return promisifiedFn;
		}
		promisify.custom = custom;
		util.promisify = promisify;

		// Modify `util.debuglog()` to record debuglog functions
		const debuglogOriginal = util.debuglog;
		util.debuglog = function debuglog(set, cb) {
			const res = debuglogOriginal.call(this, set, cb);
			specialFunctions.set(res, {type: 'debuglog', set, cb});
			return res;
		};

		if (util.debug === debuglogOriginal) util.debug = util.debuglog;
	}
};

/**
 * If module is a NodeJS built-in module
 * @param {string} path - Path `require()` called with
 * @param {Object} exports - Result of calling `require()`
 * @returns {undefined}
 */
function catalogIfBuiltInModule(path, exports) {
	// Don't catalog if module loaded within Livepack's internals
	if (usingInternalModuleCache()) return;

	if (path.slice(0, 5) === 'node:') path = path.slice(5);
	if (!builtinModulesUncataloged.has(path)) return;

	builtinModulesUncataloged.delete(path);

	const modifyBuiltin = modifyBuiltins[path];
	if (modifyBuiltin) modifyBuiltin(exports);

	catalogBuiltInModule(path, exports, globals);
}
