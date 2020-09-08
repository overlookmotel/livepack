/* --------------------
 * livepack module
 * Shim `Function.prototype.bind` to store details of bound functions
 * ------------------*/

'use strict';

// Exports

module.exports = function getBoundFunctions() {
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
};
