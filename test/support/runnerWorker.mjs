/* --------------------
 * livepack
 * Custom test runner worker.
 *
 * Thin wrapper around `jest-light-runner`'s worker, which set module cache to internal
 * before running `jest-light-runner`'s worker, so that modules loaded during set up go into
 * internal module cache.
 * ------------------*/

/* eslint-disable import/newline-after-import */

// Modules
import {createRequire} from 'module';
import {join as pathJoin} from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

global.__iamworker = true;

// Constants
const require = createRequire(fileURLToPath(import.meta.url)),
	LIGHT_RUNNER_WORKER_URL = pathToFileURL(
		pathJoin(require.resolve('jest-light-runner'), '../worker-runner.js')
	).toString();

// Patch filesystem for virtual fixtures files
require('./fixturesFs.js');

// Use internal module cache
const {useInternalModuleCache} = require('../../lib/shared/moduleCache.js');
useInternalModuleCache();

// Export `jest-light-runner`'s worker
const run = (await import(LIGHT_RUNNER_WORKER_URL)).default;
export default run;
