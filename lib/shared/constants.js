/* --------------------
 * livepack module
 * Shared constants
 * ------------------*/

'use strict';

// Exports

const COMMON_JS_LOCAL_VAR_NAMES = ['module', 'exports', 'require'],
	COMMON_JS_VAR_NAMES = [...COMMON_JS_LOCAL_VAR_NAMES, '__filename', '__dirname'];

module.exports = {
	INTERNAL_VAR_NAMES_PREFIX: 'livepack',
	TRACKER_VAR_NAME_BODY: 'tracker',
	SCOPE_ID_VAR_NAME_BODY: 'scopeId',
	TEMP_VAR_NAME_BODY: 'temp',
	TRANSFORMED_COMMENT: 'livepack_babel_transformed',
	TRACKER_COMMENT_PREFIX: 'livepack_track:',
	TEMP_COMMENT_PREFIX: 'livepack_temp:',
	COMMON_JS_LOCAL_VAR_NAMES,
	COMMON_JS_VAR_NAMES
};
