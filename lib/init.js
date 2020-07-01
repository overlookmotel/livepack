/* --------------------
 * livepack module
 * Init
 * ------------------*/

'use strict';

// Init shims

// Shim `Function.prototype.bind` to store details of bound functions
const boundFunctions = new WeakMap();

const bindOriginal = Function.prototype.bind;
Function.prototype.bind = function bind(...vars) { // eslint-disable-line no-extend-native
	const boundFn = bindOriginal.call(this, ...vars);
	boundFunctions.set(boundFn, {fn: this, vars});
	return boundFn;
};

// Exports

module.exports = {boundFunctions};
