/* --------------------
 * livepack module
 * Function to create a module namespace object
 * ------------------*/

'use strict';

// Exports

// Use implementation which uses `import()` if possible, otherwise use fallback.
// Does not work correctly in Jest - there are separate Mocha tests to cover this.
module.exports = !process.env.JEST_WORKER_ID ? createModulePromise : createModulePromiseFallback;

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
	// Use query string to get different module namespace object each time
	const promise = import(`./createModuleBase.mjs?${importCounter++}`);
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
