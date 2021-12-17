/* --------------------
 * livepack module
 * Shared constants
 * ------------------*/

'use strict';

// Exports

const COMMON_JS_LOCAL_VAR_NAMES = ['module', 'exports', 'require'],
	COMMON_JS_VAR_NAMES = [...COMMON_JS_LOCAL_VAR_NAMES, '__filename', '__dirname'];

module.exports = {
	DEFAULT_OUTPUT_FILENAME: 'index',
	INTERNAL_VAR_NAMES_PREFIX: 'livepack',
	TRACKER_VAR_NAME_BODY: 'tracker',
	GET_SCOPE_ID_VAR_NAME_BODY: 'getScopeId',
	SCOPE_ID_VAR_NAME_BODY: 'scopeId',
	TEMP_VAR_NAME_BODY: 'temp',
	FN_INFO_VAR_NAME_BODY: 'getFnInfo',
	EVAL_VAR_NAME_BODY: 'eval',
	PREVAL_VAR_NAME_BODY: 'preval',
	GET_EVAL_VAR_NAME_BODY: 'getEval',
	TRANSFORMED_COMMENT: 'livepack_babel_transformed',
	TRACKER_COMMENT_PREFIX: 'livepack_track:',
	FN_TYPE_FUNCTION: 'f',
	FN_TYPE_ASYNC_FUNCTION: 'a',
	FN_TYPE_GENERATOR_FUNCTION: 'g',
	FN_TYPE_ASYNC_GENERATOR_FUNCTION: 'ag',
	FN_TYPE_CLASS: 'c',
	GLOBAL: 1,
	MODULE: 2,
	VALUE: 3,
	GETTER: 4,
	SETTER: 5,
	PROTO: 6,
	EVAL: 7,
	COMMON_JS: 8,
	SPECIAL: 9,
	COMMON_JS_LOCAL_VAR_NAMES,
	COMMON_JS_VAR_NAMES
};
