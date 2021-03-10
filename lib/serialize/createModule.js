/* --------------------
 * livepack module
 * Function to create a module namespace object
 * ------------------*/

'use strict';

// Modules
const pathJoin = require('path').join,
	parseNodeVersion = require('parse-node-version');

// Imports
const {importValues} = require('../internal.js');

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
let importCounter = 0,
	importIndex = 0,
	numCurrentImports = 0;

const dataUrlBase = 'data:text/javascript,'
	+ `import internal from ${JSON.stringify(`file://${pathJoin(__dirname, '../internal.js')}`)};`
	+ 'export default internal.importValues';

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
	const index = importIndex++;
	importValues[index] = val;
	numCurrentImports++;

	// NB Addition of `importCounter++` on end is because identical data URLs
	// resolve to same module object
	const promise = import(`${dataUrlBase}[${index}];${importCounter++}`);
	splitPoint.modulePromise = promise;

	promise.then((moduleObj) => {
		splitPoint.moduleObj = moduleObj;
		splitPoint.modulePromise = undefined;
		numCurrentImports--;
		if (numCurrentImports === 0) {
			importValues.length = 0;
			importIndex = 0;
		} else {
			importValues[index] = undefined;
		}
	});

	return promise;
}

/**
 * Fallback module object creator which does not use `import()`.
 *
 * The module object it creates resembles a native module namespace object in every respect except:
 * 1. `require('util').types.isModuleNamespaceObject(moduleObj)` returns `false`
 * 2. `moduleObj.default = x` does not throw an error
 * 3. `console.log` output is slightly different
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
