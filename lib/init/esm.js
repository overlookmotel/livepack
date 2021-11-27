/* --------------------
 * livepack module
 * Create ESM functions object
 * ------------------*/

'use strict';

// Modules
const {pathToFileURL} = require('url');

// Imports
const internal = require('../shared/internal.js'),
	{ESM_MODULE} = require('../shared/constants.js');

// Exports

module.exports = {createEsmObjCommonJs, createEsmObjEsm};

// Get promise for import.meta.resolve.
// `import()` does not work correctly in Jest.
// TODO Find way to inject this code for Jest only if running tests. It's not needed otherwise.
const importIsSupported = !process.env.JEST_WORKER_ID;
let resolve, resolvePromise;
if (importIsSupported) {
	// eslint-disable-next-line import/no-unresolved
	resolvePromise = import('data:text/javascript,export default import.meta.resolve');
}

function setResolve(_resolve) {
	resolve = _resolve;
	resolvePromise = undefined;
}

const {globals} = internal;
function recordEsmModule(module, url) {
	globals.set(module, {type: ESM_MODULE, parent: null, key: url});
}

function createEsmObjCommonJs(path) {
	return createEsmObj(pathToFileURL(path).href);
}

function createEsmObjEsm(importMeta) {
	// Use ESM module's `import.meta.resolve` to avoid awaiting `resolvePromise`
	if (!resolve) setResolve(importMeta.resolve);
	return createEsmObj(importMeta.url);
}

function createEsmObj(baseUrl) {
	return {
		recordStatic: recordEsmModule,
		async recordDynamic(promise, specifier) {
			const module = await promise;

			if (!resolve) setResolve((await resolvePromise).default);
			const url = await resolve(specifier, baseUrl);

			recordEsmModule(module, url);
			return module;
		},
		url: baseUrl
	};
}
