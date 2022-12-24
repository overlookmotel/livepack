/* --------------------
 * livepack module
 * Jest transform
 *
 * 1. Instrument code
 * 2. Record files' code (after instrumentation) so tests can test instrumentation
 * See: https://jestjs.io/docs/code-transformation
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, sep: pathSep} = require('path');

// Imports
const {instrumentCodeImpl} = require('../../lib/instrument/instrument.js');

// Constants
const LIVEPACK_DIR_PATH = pathJoin(__dirname, '../../'),
	LIVEPACK_DIR_PATH_LEN = LIVEPACK_DIR_PATH.length,
	TRANSPILED_FILES_PATH = pathJoin(__dirname, 'transpiledFiles.js'),
	DEBUG = !!process.env.LIVEPACK_DEBUG_INSTRUMENT;

// Exports

module.exports = {process: processFile};

function processFile(code, filename) {
	// Do not instrument Livepack internals or tests support files
	if (shouldNotInstrument(filename)) return {code};

	// Instrument code
	const res = instrumentCodeImpl(code, filename, false, true, false, false, true, undefined, !DEBUG);
	code = res.code;

	if (DEBUG) {
		/* eslint-disable no-console */
		console.log('----------------------------------------');
		console.log('TRANSFORMED:', filename);
		console.log('----------------------------------------');
		console.log(code);
		console.log('');
		/* eslint-enable no-console */
	}

	// Add `require('livepack/test/support/transpiledFiles.js')[__filename] = '<code>';` to end of code
	code += `\nrequire(${JSON.stringify(TRANSPILED_FILES_PATH)})[__filename] = ${JSON.stringify(code)};`;

	return {code, map: res.map};
}

/**
 * Determine if a file path should be instrumented.
 *
 * Files bypassing instrumentation are:
 * - Top level files e.g. `index.js`
 * - `lib/*` except for `lib/runtime/*`
 * - `test/support/*`
 *
 * Files in `lib/runtime` are excluded as they contains code which is serialized and used in output.
 *
 * @param {string} path - File path
 * @returns {boolean} - `true` if is a file in Livepack's codebase which should not be transformed
 */
function shouldNotInstrument(path) {
	if (!path.startsWith(LIVEPACK_DIR_PATH)) return false;

	const pathParts = path.slice(LIVEPACK_DIR_PATH_LEN).split(pathSep, 2);
	if (pathParts.length === 1) return true;
	switch (pathParts[0]) {
		case 'lib': return pathParts[1] !== 'runtime';
		case 'test': return pathParts[1] === 'support';
		default: return false;
	}
}
