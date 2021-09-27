/* --------------------
 * livepack module
 * Base module used by `createModule()`
 * ------------------*/

// Exports

// When function called, it replaces default export of module with value provided
export default function f(val) {
	f = val; // eslint-disable-line no-func-assign
}
