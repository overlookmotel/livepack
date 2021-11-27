/* --------------------
 * livepack module
 * Babel plugin symbols
 * ------------------*/

'use strict';

// Exports

module.exports = {
	SCOPE_ID_VAR_NODE: Symbol('livepack.SCOPE_ID_VAR_NODE'),
	ESM_VAR_NODE: Symbol('livepack.ESM_VAR_NODE'),
	TEMP_VAR_NODES: Symbol('livepack.TEMP_VAR_NODES'),
	IS_ESM: Symbol('livepack.IS_ESM'),
	ESM_IMPORTS: Symbol('livepack.ESM_IMPORTS'),
	ESM_EXPORT_NAMES: Symbol('livepack.ESM_EXPORT_NAMES'),
	ESM_ALIASES: Symbol('livepack.ESM_ALIASES'),
	IMPORT_URL_VAR_NODES: Symbol('livepack.IMPORT_URL_VAR_NODES'),
	BLOCK_ID: Symbol('livepack.BLOCK_ID'),
	BLOCK_NAME: Symbol('livepack.BLOCK_NAME'),
	FUNCTION_PROPS: Symbol('livepack.FUNCTION_PROPS'),
	HAS_CONSTRUCTOR: Symbol('livepack.HAS_CONSTRUCTOR'),
	PARENT_IS_STRICT: Symbol('livepack.PARENT_IS_STRICT'),
	PARENT_FUNCTION_PATH: Symbol('livepack.PARENT_FUNCTION_PATH'),
	PARENT_FULL_FUNCTION_PATH: Symbol('livepack.PARENT_FULL_FUNCTION_PATH'),
	SUPER_VARS: Symbol('livepack.SUPER_VARS')
};
