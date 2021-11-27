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

const {globals} = internal;
function recordEsmModule(module, url) {
	globals.set(module, {type: ESM_MODULE, parent: null, key: url});
}

function createEsmObjCommonJs(path) {
	return createEsmObj(pathToFileURL(path).href);
}

function createEsmObjEsm(importMeta) {
	return createEsmObj(importMeta.url);
}

function createEsmObj(baseUrl) {
	return {
		recordStatic: recordEsmModule,
		async recordDynamic(modulePromise, urlPromise) {
			// Await `modulePromise` first so if both promises reject,
			// error received in user code will be the one from original `import()`
			urlPromise.catch(() => {}); // Prevent unhandled rejection if `modulePromise` rejects
			const module = await modulePromise;
			const {default: url} = await urlPromise;
			recordEsmModule(module, url);
			return module;
		},
		url: baseUrl
	};
}
