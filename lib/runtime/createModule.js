/* --------------------
 * livepack module
 * `createModule()` runtime function
 * ------------------*/

/* eslint-disable strict, no-sequences */

// Exports

const {create, defineProperty, keys, seal} = Object,
	{toStringTag} = Symbol;

/**
 * Create replica ESM module namespace object.
 * Replicates native module namespace object in every way except that Node's
 * `require('util').types.isModuleNamespaceObject()` will return false for it.
 *
 * Called with properties object e.g. `createModule( { x: 1, y: 2 } )`.
 * If module namespace contains a var called `__proto__`, `props` object should define a getter
 * for this property: `createModule( { x: 1, get __proto__() { return 2; } } )`.
 *
 * @param {Object} props - Properties object
 * @param {undefined} mod - Must not be provided
 * @returns {Object} - Replica module namespace object
 */
module.exports = (props, mod = create(null)) => (
	keys(props).forEach(
		key => defineProperty(mod, key, {value: props[key], writable: true, enumerable: true})
	),
	seal(defineProperty(mod, toStringTag, {value: 'Module'}))
);
