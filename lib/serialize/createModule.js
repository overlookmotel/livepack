/* --------------------
 * livepack module
 * Function to create a module namespace object
 * ------------------*/

'use strict';

// Modules
const parseNodeVersion = require('parse-node-version');

// Exports

// Use implementation which uses `import()` if possible, otherwise use fallback.
// Only supported from Node 12.17.0, 13.2.0, 14.0.0.
// Also does not work correctly in Jest - there are separate Mocha tests to cover this.
module.exports = importIsSupported() ? createModulePromise : createModulePromiseFallback;

function importIsSupported() {
	if (process.env.JEST_WORKER_ID) return false;
	const {major, minor} = parseNodeVersion(process.version);
	return major >= 14 || (major === 13 && minor >= 2) || (major === 12 && minor >= 17);
}

// Implementation using `import()`
let importCounter = 0;

/**
 * Create promise for module namespace object containing value as default export.
 * Uses `import()` to ensure module object is exactly like a real module object.
 * Promise is written to `splitPoint.modulePromise`.
 * When promise resolves, module object is written to `splitPoint.moduleObj`.
 *
 * @param {*} val - Value to create module from
 * @param {Object} splitPoint - Split point object
 * @returns {Promise} - Promise which resolves to module object
 */
function createModulePromise(val, splitPoint) {
	// NB Addition of `importCounter++` because identical data URLs resolve to same module object
	const promise = import(`data:text/javascript,export default function f(v){f=v};${importCounter++}`);
	splitPoint.modulePromise = promise;

	promise.then((moduleObj) => {
		moduleObj.default(val);
		splitPoint.moduleObj = moduleObj;
		splitPoint.modulePromise = undefined;
	});

	return promise;
}

/**
 * Fallback module object creator which does not use `import()`.
 *
 * The module object it creates resembles a native module namespace object in every respect except:
 * 1. `require('util').types.isModuleNamespaceObject(moduleObj)` returns `false`
 * 2. `moduleObj.default = x` does not throw an error
 * 3. `console.log(moduleObj)` output is slightly different
 *
 * @param {*} val - Value to create module from
 * @param {Object} splitPoint - Split point object
 * @returns {Promise} - Promise which resolves to module object
 */
function createModulePromiseFallback(val, splitPoint) {
	const moduleObj = Object.seal(
		Object.create(null, {
			default: {
				value: val,
				writable: true,
				enumerable: true,
				configurable: false
			},
			[Symbol.toStringTag]: {
				value: 'Module',
				writable: false,
				enumerable: false,
				configurable: false
			}
		})
	);

	splitPoint.moduleObj = moduleObj;

	return Promise.resolve(moduleObj);
}
