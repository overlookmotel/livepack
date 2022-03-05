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
const pathSep = require('path').sep;

// Imports
const {instrumentCodeImpl} = require('../../lib/instrument/instrument.js'),
	{isInternalPath} = require('../../lib/shared/functions.js');

// Constants
const TESTS_SUPPORT_DIR_PATH = `${__dirname}${pathSep}`,
	TRANSPILED_FILES_PATH = `${TESTS_SUPPORT_DIR_PATH}transpiledFiles.js`;

// Exports

module.exports = {process};

function process(code, filename) {
	// Do not instrument Livepack internals or tests support files
	if (isInternalPath(filename) || filename.startsWith(TESTS_SUPPORT_DIR_PATH)) return code;

	// Instrument code
	const res = instrumentCodeImpl(code, filename, false, true, false, false, true, undefined, true);
	code = res.code;

	// Add `require('livepack/test/support/transpiledFiles.js')[__filename] = '<code>';` to end of code
	code += `\nrequire(${JSON.stringify(TRANSPILED_FILES_PATH)})[__filename] = ${JSON.stringify(code)};`;

	return {code, map: res.map};
}
