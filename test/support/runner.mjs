/* --------------------
 * livepack
 * Custom test runner to capture V8 coverage
 * ------------------*/

// Modules
import {join as pathJoin} from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {createRequire} from 'module';
import LightRunner from 'jest-light-runner'; // eslint-disable-line import/no-unresolved
import Tinypool from 'tinypool';
import supportsColor from 'supports-color';
import assert from 'simple-invariant';

// Constants
const THIS_FILE_PATH = fileURLToPath(import.meta.url),
	COVERAGE_PATH = pathJoin(THIS_FILE_PATH, '../coverage.js'),
	LIGHT_RUNNER_WORKER_URL = pathToFileURL(
		pathJoin(
			createRequire(THIS_FILE_PATH).resolve('jest-light-runner'),
			'../worker-runner.js'
		)
	).toString();

// Exports

/**
 * Get test runner.
 * If collecting coverage, use custom coverage runner.
 * Otherwise use `jest-light-runner` unmodified.
 * @param {Object} config - Config object
 * @returns {Object} - Test runner
 */
export default function getRunner(config) {
	return config.collectCoverage
		? new CoverageRunner(config) // eslint-disable-line no-use-before-define
		: new LightRunner(config);
}

/**
 * Alternative runner used for code coverage reporting.
 *
 * Works same as `jest-light-runner`, but:
 * 1. Enables V8 coverage reporting and passes coverage data back to Jest.
 * 2. Ensures every test file runs in its own fresh worker.
 *
 * For some reason, V8 coverage reporting is incorrect if multiple test files run in same thread.
 *
 * Uses `jest-light-runner`'s worker thread implementation.
 * Code for class below is copied from `jest-light-runner`, except with `isolateWorkers` option.
 */
class CoverageRunner {
	constructor(config) {
		this._config = config;

		this._pool = new Tinypool({
			filename: LIGHT_RUNNER_WORKER_URL,
			maxThreads: config.maxWorkers,
			isolateWorkers: true,
			env: {
				// Workers don't have a tty; we whant them to inherit
				// the color support level from the main thread.
				FORCE_COLOR: supportsColor.stdout.level,
				...process.env
			}
		});
	}

	runTests(tests, watcher, onStart, onResult, onFailure) {
		onResult = modifyRunTestsPropsForCoverage(tests, onResult);
		return LightRunner.prototype.runTests.call(this, tests, watcher, onStart, onResult, onFailure);
	}
}

/**
 * Modify `tests` and wrap `onResult` callback to process V8 coverage.
 * If coverage enabled:
 *   - Adds `./coverage.js` to setup files before `./register.js`
 *   - Captures V8 coverage data which `./coverage.js` smuggled out via `global.__coverage__`
 *     and passes it back to Jest.
 *
 * @param {Array<Object>} tests - Tests
 * @param {Function} onResult - `onResult` callback
 * @returns {Function} - Wrapped `onResult` callback
 */
function modifyRunTestsPropsForCoverage(tests, onResult) {
	// If no tests, make no changes
	if (tests.length === 0) return onResult;

	// Add `./coverage.js` to setup files before `./register.js`
	const {context} = tests[0];
	const setupFilesAfterEnv = [...context.config.setupFilesAfterEnv];
	setupFilesAfterEnv.splice(setupFilesAfterEnv.length - 1, 0, COVERAGE_PATH);
	context.config = {...context.config, setupFilesAfterEnv};

	assert(
		tests.length === 1 || tests[1].context === tests[0].context,
		'Differing context objects between tests'
	);

	// Return wrapped `onResult` which returns coverage as V8 coverage
	return (test, result) => {
		result.v8Coverage = result.coverage;
		result.coverage = undefined;
		return onResult(test, result);
	};
}
