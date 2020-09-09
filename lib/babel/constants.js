/* --------------------
 * livepack module
 * Babel plugin constants
 * ------------------*/

'use strict';

// Modules
const pathJoin = require('path').join;

// Imports
const {
	INTERNAL_VAR_NAMES_PREFIX, TRACKER_VAR_NAME_BODY, SCOPE_ID_VAR_NAME_BODY, TEMP_VAR_NAME_BODY,
	COMMON_JS_LOCAL_VAR_NAMES
} = require('../shared.js');

// Exports

module.exports = {
	INIT_PATH: pathJoin(__dirname, '../init/index.js'),
	INTERNAL_VAR_NAMES_PREFIX,
	TRACKER_VAR_NAME: `${INTERNAL_VAR_NAMES_PREFIX}_${TRACKER_VAR_NAME_BODY}`,
	SCOPE_ID_VAR_NAME: `${INTERNAL_VAR_NAMES_PREFIX}_${SCOPE_ID_VAR_NAME_BODY}_`,
	TEMP_VAR_NAME: `${INTERNAL_VAR_NAMES_PREFIX}_${TEMP_VAR_NAME_BODY}_`,
	TOP_BLOCK_ID: 1,
	COMMON_JS_VARS: new Set(COMMON_JS_LOCAL_VAR_NAMES)
};
