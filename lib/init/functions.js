/* --------------------
 * livepack module
 * Shim `Function.prototype.bind` to store details of bound functions.
 * Shim `require('util').debuglog` to store details of debug functions.
 * ------------------*/

'use strict';

// Modules
const util = require('util');

// Exports

module.exports = function getFunctions() {
	const functions = new WeakMap();

	captureBoundFunctions(functions);
	captureUtilPromisifyFunctions(functions);
	captureDebuglogFunctions(functions);

	return functions;
};

function captureBoundFunctions(functions) {
	const bindOriginal = Function.prototype.bind;
	const {bind} = { // Use object method to prevent `.bind()` having prototype, like native `.bind()`
		bind(...vars) {
			const boundFn = bindOriginal.call(this, ...vars);
			functions.set(boundFn, {type: 'bound', fn: this, vars});
			return boundFn;
		}
	};

	Object.defineProperty(bind, 'length', {value: 1}); // To emulate native `.bind()` function

	Function.prototype.bind = bind; // eslint-disable-line no-extend-native
}

function captureUtilPromisifyFunctions(functions) {
	const promisifyOriginal = util.promisify,
		{custom} = promisifyOriginal;
	function promisify(original) {
		const promisifiedFn = promisifyOriginal(original);
		// Don't record if has custom promisified function defined using `custom` symbol.
		// `util.promisify` doesn't create function internally in that case.
		// NB No need to check `original` is truthy or that `original[custom]` is function,
		// as `util.promisify` will have thrown already in these cases.
		if (!original[custom]) functions.set(promisifiedFn, {type: 'promisify', fn: original});
		return promisifiedFn;
	}
	promisify.custom = custom;
	util.promisify = promisify;
}

function captureDebuglogFunctions(functions) {
	const debuglogOriginal = util.debuglog;
	util.debuglog = function debuglog(set, cb) {
		const res = debuglogOriginal.call(this, set, cb);
		functions.set(res, {type: 'debuglog', args: [set, cb]});
		return res;
	};
}
