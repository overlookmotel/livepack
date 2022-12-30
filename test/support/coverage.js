/* --------------------
 * livepack
 * Capture V8 coverage
 * ------------------*/

/* eslint-disable import/order, import/newline-after-import */

'use strict';

// Use internal module cache because some of same modules (e.g. `pirates`)
// are also used by `register.js`. This avoids loading them twice.
const {
	useInternalModuleCache, useGlobalModuleCache, usingInternalModuleCache
} = require('../../lib/shared/moduleCache.js');
useInternalModuleCache();

// Modules
const {join: pathJoin, relative: relativePath} = require('path'),
	{fileURLToPath} = require('url'),
	{CoverageInstrumenter} = require('collect-v8-coverage'),
	{globsToMatcher, replacePathSepForGlob} = require('jest-util'),
	{addHook} = require('pirates'),
	EXTS = require('@babel/core').DEFAULT_EXTENSIONS;

// Imports
const {collectCoverageFrom} = require('../../jest.config.js');

useGlobalModuleCache();

// Constants
const TESTS_DIR = pathJoin(__dirname, '../'),
	ROOT_DIR = pathJoin(TESTS_DIR, '../');

// Exports

module.exports = startCoverage;
startCoverage.applyAfterAllHook = applyAfterAllHook;

let instrumenter;

/**
 * Run by `jest-light-runner` before `./register.js`.
 * Start capturing V8 coverage.
 * @async
 * @returns {undefined}
 */
async function startCoverage() {
	instrumenter = new CoverageInstrumenter();
	await instrumenter.startInstrumenting();
}

/**
 * Register `afterAll` test hook to record V8 coverage data to `global.__coverage__`.
 * `jest-light-runner` collects this and records it in the test result object as Babel coverage data.
 * Custom runner `./runner.mjs` then moves it to the `.v8Coverage` property of result object.
 *
 * Code to call this function is added to bottom of every test file by pirates hook below.
 *
 * V8 coverage data is filtered to only files being assessed for coverage.
 * This is done here rather than in the custom runner to minimise data transfer between
 * worker thread running the test and the runner main thread.
 *
 * @returns {undefined}
 */
function applyAfterAllHook() {
	afterAll(async () => {
		global.__coverage__ = filterCoverageData(await instrumenter.stopInstrumenting());
	});
}

/**
 * Filter coverage data to files being monitored for coverage only.
 * Based on:
 * https://github.com/facebook/jest/blob/fb2de8a10f8e808b080af67aa771f67b5ea537ce/packages/jest-runtime/src/index.ts#L1217
 *
 * @param {Array<Object>} coverage - Coverage data captured by V8
 * @returns {Array<Object>|undefined} - Conformed coverage data
 */
function filterCoverageData(coverage) {
	if (collectCoverageFrom && collectCoverageFrom.length === 0) return undefined;

	const filenameMatcher = globsToMatcher(collectCoverageFrom);

	coverage = coverage
		.filter(res => res.url.startsWith('file://'))
		.map(res => ({...res, url: fileURLToPath(res.url)}))
		.filter(
			res => res.url.startsWith(ROOT_DIR)
				&& filenameMatcher(replacePathSepForGlob(relativePath(ROOT_DIR, res.url)))
		)
		.map(result => ({result}));

	return coverage.length > 0 ? coverage : undefined;
}

// Install extra require hook to add code to end of test files to install `afterAll` hook.
// This code is added to file before Livepack's instrumentation rather than after.
// This is a bit sloppy, but makes no difference in this case as code is at bottom of the file
// (so doesn't affect sourcemaps) and doesn't contain any functions which will be instrumented.
addHook(
	(code, path) => (
		(!usingInternalModuleCache() && path.startsWith(TESTS_DIR) && path.endsWith('.test.js'))
			? `${code}\nrequire(${JSON.stringify(__filename)}).applyAfterAllHook();\n`
			: code
	),
	{ignoreNodeModules: false, exts: EXTS}
);
