/* --------------------
 * livepack module
 * Shared constants
 * ------------------*/

'use strict';

// Exports

const COMMON_JS_LOCAL_VAR_NAMES = ['module', 'exports', 'require'],
	COMMON_JS_VAR_NAMES = [...COMMON_JS_LOCAL_VAR_NAMES, '__filename', '__dirname'];

module.exports = {
	TOP_BLOCK_ID: 1,
	DEFAULT_OUTPUT_FILENAME: 'index',
	INTERNAL_VAR_NAMES_PREFIX: 'livepack',
	TRACKER_VAR_NAME_BODY: 'tracker',
	GET_SCOPE_ID_VAR_NAME_BODY: 'getScopeId',
	SCOPE_ID_VAR_NAME_BODY: 'scopeId',
	ESM_VAR_NAME_BODY: 'esm',
	TEMP_VAR_NAME_BODY: 'temp',
	EVAL_VAR_NAME_BODY: 'eval',
	PREVAL_VAR_NAME_BODY: 'preval',
	GET_EVAL_VAR_NAME_BODY: 'getEval',
	TRANSFORMED_COMMENT: 'livepack_babel_transformed',
	TRACKER_COMMENT_PREFIX: 'livepack_track:',
	TEMP_COMMENT_PREFIX: 'livepack_temp:',
	EVAL_COMMENT: 'livepack_eval',
	LOADER_RESOLVE_PREFIX: 'livepackresolve://',
	GLOBAL: 1,
	MODULE: 2,
	VALUE: 3,
	GETTER: 4,
	SETTER: 5,
	PROTO: 6,
	EVAL: 7,
	COMMON_JS: 8,
	ESM_MODULE: 9,
	IMPORT_META: 10,
	SPECIAL: 11,
	COMMON_JS_LOCAL_VAR_NAMES,
	COMMON_JS_VAR_NAMES
};
