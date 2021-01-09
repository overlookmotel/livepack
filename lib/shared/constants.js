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
	IMPORT_VAR_NAME_BODY: 'import',
	IMPORT_ASYNC_VAR_NAME_BODY: 'importAsync',
	MODULE_VAR_NAME_BODY: 'module',
	EXPORTS_VAR_NAME_BODY: 'exports',
	GLOBAL_VAR_NAME_BODY: 'global',
	MAKE_DEFAULT_VAR_NAME_BODY: 'makeDefault',
	EVAL_VAR_NAME_BODY: 'eval',
	PREVAL_VAR_NAME_BODY: 'preval',
	GET_EVAL_VAR_NAME_BODY: 'getEval',
	TRANSFORMED_COMMENT: 'livepack_babel_transformed',
	TRACKER_COMMENT_PREFIX: 'livepack_track:',
	TEMP_COMMENT_PREFIX: 'livepack_temp:',
	EVAL_COMMENT: 'livepack_eval',
	GLOBAL: 1,
	MODULE: 2,
	VALUE: 3,
	GETTER: 4,
	SETTER: 5,
	PROTO: 6,
	SPECIAL: 7,
	COMMON_JS_LOCAL_VAR_NAMES,
	COMMON_JS_VAR_NAMES
};
