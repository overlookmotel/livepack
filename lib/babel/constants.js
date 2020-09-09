/* --------------------
 * livepack module
 * Babel plugin constants
 * ------------------*/

'use strict';

// Modules
const pathJoin = require('path').join;

// Imports
const {COMMON_JS_LOCAL_VAR_NAMES} = require('../shared.js');

// Exports

module.exports = {
	INIT_PATH: pathJoin(__dirname, '../init/index.js'),
	TRACKER_VAR_NAME: 'tracker',
	SCOPE_ID_VAR_NAME: 'scopeId',
	TEMP_VAR_NAME: 'temp',
	TOP_BLOCK_ID: 1,
	COMMON_JS_VARS: new Set(COMMON_JS_LOCAL_VAR_NAMES)
};
