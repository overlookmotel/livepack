/* --------------------
 * livepack
 * Tests install require hook to intrument test files' code
 * ------------------*/

/* eslint-disable import/order, import/newline-after-import */

'use strict';

// Install register require hook.
// Disable instrumentation cache. Tests run in multiple threads, so it'd be read from and written to
// concurrently unless disabled.
require('../../register.js')({cache: false});

// Use internal module cache to avoid transpiling modules
const {
	useInternalModuleCache, useGlobalModuleCache, usingInternalModuleCache
} = require('../../lib/shared/moduleCache.js');
useInternalModuleCache();

// Modules
const {addHook} = require('pirates'),
	EXTS = require('@babel/core').DEFAULT_EXTENSIONS;

// Imports
const transpiledFiles = require('./transpiledFiles.js');

// Revert to global module cache
useGlobalModuleCache();

// Install extra require hook to record transpiled code in `transpiledFiles` object
addHook((code, path) => {
	if (!usingInternalModuleCache()) transpiledFiles[path] = code;
	return code;
}, {
	ignoreNodeModules: false,
	exts: EXTS
});
