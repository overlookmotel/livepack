/* --------------------
 * livepack module
 * Function to create a module namespace object
 * ------------------*/

'use strict';

// Exports

module.exports = createModulePromise;

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
