/* --------------------
 * livepack module
 * Babel plugin symbols
 * ------------------*/

'use strict';

// Exports

module.exports = {
	TRACKER_VAR_NUMS_USED: Symbol('livepack.TRACKER_VAR_NUMS_USED'),
	TRACKER_VAR_NODE: Symbol('livepack.TRACKER_VAR_NODE'),
	SCOPE_ID_VAR_NUMS_USED: Symbol('livepack.SCOPE_ID_VAR_NUMS_USED'),
	SCOPE_ID_VAR_NODES: Symbol('livepack.SCOPE_ID_VAR_NODES'),
	SCOPE_ID_VAR_NODE: Symbol('livepack.SCOPE_ID_VAR_NODE'),
	TEMP_VAR_NUMS_USED: Symbol('livepack.TEMP_VAR_NUMS_USED'),
	TEMP_VAR_NODES: Symbol('livepack.TEMP_VAR_NODES'),
	BLOCK_ID: Symbol('livepack.BLOCK_ID'),
	BLOCK_NAME: Symbol('livepack.BLOCK_NAME'),
	FUNCTION_PROPS: Symbol('livepack.FUNCTION_PROPS'),
	HAS_CONSTRUCTOR: Symbol('livepack.HAS_CONSTRUCTOR'),
	PROGRAM_PATH: Symbol('livepack.PROGRAM_PATH'),
	PARENT_FUNCTION_PATH: Symbol('livepack.PARENT_FUNCTION_PATH'),
	PARENT_FULL_FUNCTION_PATH: Symbol('livepack.PARENT_FULL_FUNCTION_PATH'),
	SUPER_VAR_NODE: Symbol('livepack.SUPER_VAR_NODE'),
	TOP_LEVEL_VAR_NAMES: Symbol('livepack.TOP_LEVEL_VARS'),
	IS_INTERNAL: Symbol('livepack.IS_INTERNAL')
};
