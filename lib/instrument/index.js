/* --------------------
 * livepack module
 * Code instrumentation entry point
 * ------------------*/

'use strict';

// Modules
const assert = require('simple-invariant'),
	{isObject, isString, isBoolean} = require('is-it-type');

// Imports
const {instrumentCodeImpl, parseImpl, instrumentAstImpl} = require('./instrument.js');

// Exports

module.exports = {parse, instrumentCode, instrumentAst};

/**
 * Parse code to AST.
 * @param {string} code - Code
 * @param {Object} options - Options object
 * @param {string} [options.filename] - File path - compulsory unless `sourceMaps` option is `false`
 * @param {string} [options.sourceType] - 'module', 'commonjs', 'script' ('script' is default)
 * @param {boolean} [options.jsx] - `true` if source contains JSX syntax
 * @param {boolean} [options.isStrict] - `true` if strict mode (default `sourceType === 'module'`)
 * @param {boolean} [options.sourceMaps] - `false` to not create source maps (default `true`)
 * @param {Object} [options.inputSourceMap] - Input source map
 * @returns {Object} - Object with properties:
 *   {Object} .ast - AST
 *   {Object|undefined} .sources - Sources object mapping file path to file content,
 *     or `undefined` if `sourceMaps` option is `false`
 */
function parse(code, options) {
	assert(isString(code), 'code must be a string');
	const {
		filename, isEsm, isCommonJs, isJsx, isStrict, sourceMaps, inputSourceMap
	} = conformParseOptions(options, false);
	assert(!sourceMaps || filename, 'options.filename must be provided when source maps enabled');

	return parseImpl(
		code, filename, isEsm, isCommonJs, false, isJsx, isStrict, sourceMaps, inputSourceMap
	);
}

/**
 * Instrument code.
 * @param {string} code - Code
 * @param {Object} options - Options object
 * @param {string} options.filename - File path
 * @param {string} [options.sourceType] - 'module', 'commonjs', 'script' ('script' is default)
 * @param {boolean} [options.jsx] - `true` if source contains JSX syntax
 * @param {boolean} [options.isStrict] - `true` if strict mode (default `sourceType === 'module'`)
 * @param {boolean} [options.sourceMaps] - `false` to not create source maps (default `true`)
 * @param {Object} [options.inputSourceMap] - Input source map
 * @returns {Object} - Object with properties:
 *   {string} .code - Transformed code
 *   {Object|null} .map - Source map object (if `sourceMaps` option set)
 *   {Array<Object>|undefined} .rawMappings - Source map raw mappings array (if `sourceMaps` option set)
 */
function instrumentCode(code, options) {
	assert(isString(code), 'code must be a string');
	const {
		filename, isEsm, isCommonJs, isJsx, isStrict, sourceMaps, inputSourceMap
	} = conformParseOptions(options, true);

	return instrumentCodeImpl(
		code, filename, isEsm, isCommonJs, isJsx, isStrict, sourceMaps, inputSourceMap, true
	);
}

/**
 * Instrument AST.
 * @param {string} ast - Code
 * @param {Object} options - Options object
 * @param {string} options.filename - File path
 * @param {string} [options.sourceType] - 'module', 'commonjs', 'script' ('script' is default)
 * @param {boolean} [options.jsx] - `true` if source contains JSX syntax
 * @param {boolean} [options.isStrict] - `true` if strict mode (default `sourceType === 'module'`)
 * @param {boolean} [options.sources] - Sources object mapping file path to file content
 * @returns {Object} - Transformed AST
 */
function instrumentAst(ast, options) {
	assert(isObject(ast), 'ast must be an object');
	assert(isObject(options), 'options must be an object');
	const filename = conformFilename(options, true),
		{isEsm, isCommonJs} = conformSourceType(options),
		isJsx = conformBool(options, 'jsx', false),
		isStrict = conformBool(options, 'isStrict', isEsm);
	let {sources} = options;
	if (sources == null) {
		sources = undefined;
	} else {
		assert(isObject(sources), 'options.sources must be an object if provided');
	}

	return instrumentAstImpl(ast, filename, isEsm, isCommonJs, isJsx, isStrict, sources);
}

/**
 * Validate and conform `parse()` / `instrumentCode()` options.
 * @param {Object} options - Options object
 * @param {boolean} isFilenameRequired - `true` if `filename` option is required
 * @returns {Object} - Object with properties:
 *   {string|undefined} .filename
 *   {boolean} .isEsm
 *   {boolean} .isCommonJs
 *   {boolean} .isJsx
 *   {boolean} .isStrict
 *   {boolean} .sourceMaps
 *   {Object|undefined} .inputSourceMap
 */
function conformParseOptions(options, isFilenameRequired) {
	assert(isObject(options), 'options must be an object');
	const filename = conformFilename(options, isFilenameRequired),
		{isEsm, isCommonJs} = conformSourceType(options),
		isJsx = conformBool(options, 'jsx', false),
		isStrict = conformBool(options, 'isStrict', isEsm),
		sourceMaps = conformBool(options, 'sourceMaps', true),
		inputSourceMap = conformInputSourceMap(options, sourceMaps);
	return {filename, isStrict, isEsm, isCommonJs, isJsx, sourceMaps, inputSourceMap};
}

/**
 * Validate and conform `filename` option.
 * @param {Object} options - Options object
 * @param {boolean} isRequired - `true` if `filename` option is required
 * @returns {string|undefined} - Filename
 */
function conformFilename(options, isRequired) {
	const {filename} = options;
	if (filename == null) {
		assert(!isRequired, 'options.filename is required');
		return undefined;
	}
	assert(isString(filename), `options.filename must be a string${isRequired ? '' : ' if provided'}`);
	return filename;
}

/**
 * Validate and conform `sourceType` option.
 * @param {Object} options - Options object
 * @returns {Object} - Object with properties:
 *   {boolean} .isEsm
 *   {boolean} .isCommonJs
 */
function conformSourceType(options) {
	const {sourceType} = options;
	if (sourceType != null) {
		if (sourceType === 'module') return {isEsm: true, isCommonJs: false};
		if (sourceType === 'commonjs') return {isEsm: false, isCommonJs: true};
		assert(
			sourceType === 'script', "options.sourceType must be 'module', 'commonjs' or 'script' if provided"
		);
	}
	return {isEsm: false, isCommonJs: false};
}

/**
 * Validate and conform `inputSourceMap` option.
 * @param {Object} options - Options object
 * @param {boolean} sourceMaps - `true` if source maps enabled
 * @returns {Object|undefined} - Source map object, if option provided and source maps enabled
 */
function conformInputSourceMap(options, sourceMaps) {
	const {inputSourceMap} = options;
	if (inputSourceMap == null) return undefined;
	assert(isObject(inputSourceMap), 'options.inputSourceMap must be an object if provided');
	return sourceMaps ? inputSourceMap : undefined;
}

/**
 * Validate and conform a boolean option.
 * @param {Object} options - Options object
 * @param {string} optionName - Option name
 * @param {boolean} defaultValue - Default value if option is `null` or `undefined`
 * @returns {boolean} - Option value
 */
function conformBool(options, optionName, defaultValue) {
	const value = options[optionName];
	if (value == null) return defaultValue;
	assert(isBoolean(value), `options.${optionName} must be a boolean if provided`);
	return value;
}
