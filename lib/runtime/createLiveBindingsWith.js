/* --------------------
 * livepack module
 * `createLiveBindingsWith()` runtime function
 * ------------------*/

/* eslint-disable strict, no-sequences */

// Exports

const {create, defineProperty, getOwnPropertyDescriptor} = Object;

/**
 * Create `with` context object for ESM live binding where a function in scope uses `eval()`
 * and can read or write to the var.
 *
 * Called with object mapping var names to their associated live binding objects
 * (created by `createLiveBinding()` runtime function).
 * e.g. `createLiveBindingsWith( { x: bindingX } )`
 * or `createLiveBindingsWith( { x: bindingX, y: bindingY, z: bindingZ } )`
 *
 * Returns an object to use in `with ( withObj ) {}` with getters + setters for the variables.
 *
 * If a var is called `__proto__`, `props` object should define a getter
 * for this property: `createLiveBindingsWith( { get __proto__() { return bindingProto; } } )`.
 *
 * @param {Object} props - Mapping of var name to binding
 * @param {undefined} withObj - Must not be provided
 * @returns {Object} - `with` context object
 */
module.exports = (props, withObj = create(null)) => (
	Object.keys(props).forEach(key => defineProperty(
		withObj,
		key,
		getOwnPropertyDescriptor(props[key], 'a')
	)),
	withObj
);
