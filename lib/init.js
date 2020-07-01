/* --------------------
 * livepack module
 * Init
 * ------------------*/

'use strict';

// Init shims

// Shim `Function.prototype.bind` to store details of bound functions
const boundFunctions = new WeakMap();

const bindOriginal = Function.prototype.bind;
function bind(...vars) {
	const boundFn = bindOriginal.call(this, ...vars); // eslint-disable-line no-invalid-this
	boundFunctions.set(boundFn, {fn: this, vars}); // eslint-disable-line no-invalid-this
	return boundFn;
}

Object.defineProperty(bind, 'length', {value: 1}); // To emulate native `.bind()` function

Function.prototype.bind = bind; // eslint-disable-line no-extend-native

// Exports

module.exports = {boundFunctions};
