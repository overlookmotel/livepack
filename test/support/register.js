/* --------------------
 * livepack
 * Tests install require hook to intrument test files' code
 * ------------------*/

/* eslint-disable import/order, import/no-dynamic-require, global-require */

'use strict';

// Imports
const {
	useInternalModuleCache, useGlobalModuleCache, Module
} = require('../../lib/shared/moduleCache.js');

// Patch filesystem for virtual fixtures files
require('./fixturesFs.js');

// Pre-load `fast-json-stable-stringify`.
// `jest-light-runner` imports `jest-snapshot` which requires `@jest/transform`.
// After `jest-light-runner`'s worker loads the test file, it runs a method on `jest-snapshot`
// which causes `@jest/transform` to lazily require `fast-json-stable-stringify`.
// Trigger this now, so `fast-json-stable-stringify` is not loaded later and unnecessarily instrumented.
// `createScriptTransformer()` when called with no arguments throws an error before it does anything.
const {createRequire} = Module,
	jestLightRunnerPath = require.resolve('jest-light-runner'),
	jestSnapshotPath = createRequire(jestLightRunnerPath).resolve('jest-snapshot'),
	jestTransformPath = createRequire(jestSnapshotPath).resolve('@jest/transform');
if (Module._cache[jestTransformPath]) {
	const jestTransform = require(jestTransformPath);
	jestTransform.createScriptTransformer().catch(() => {});
}

// Install register require hook.
// Disable instrumentation cache. Tests run in multiple threads, so it'd be read from and written to
// concurrently unless disabled.
require('../../register.js')({cache: false});

// Use internal module cache to avoid transpiling modules
useInternalModuleCache();

// Modules
const {addHook} = require('pirates'),
	EXTS = require('@babel/core').DEFAULT_EXTENSIONS;

// Imports
const fixturesState = require('./fixturesState.js');

// Revert to global module cache
useGlobalModuleCache();

// Install extra require hook to record transpiled code in `fixturesState` object
addHook((code) => {
	if (fixturesState.isCapturingTranspiledCode) {
		fixturesState.isCapturingTranspiledCode = false;
		fixturesState.transpiledCode = code;
	}
	return code;
}, {
	ignoreNodeModules: false,
	exts: EXTS
});
