/* --------------------
 * livepack module
 * Code instrumentation functions
 * ------------------*/

'use strict';

// Modules
const {parse} = require('@babel/parser'),
	generate = require('@babel/generator').default;

// Imports
const {parseSourceMapComment, mapLocations} = require('./sourceMaps.js'),
	modifyAst = require('./modify.js');

// Exports

module.exports = {
	parseImpl,
	instrumentCodeImpl,
	instrumentAstImpl
};

let babelTransformFromAstSync, babelLoadOptions,
	babelPluginModulesToCommonJs, babelPluginTransformJsx, babelPluginDynamicImportToRequire;
const babelOptionsCache = {};

/**
 * Parse code to AST.
 * @param {string} code - Code
 * @param {string} [filename] - File path - must be provided if source map not provided
 *   and `sourceMaps` option is `true`
 * @param {boolean} isEsm - `true` if is ES Module
 * @param {boolean} isCommonJs - `true` if is CommonJS
 * @param {boolean} isJsx - `true` if source contains JSX syntax
 * @param {boolean} isStrict - `true` if strict mode
 * @param {boolean} sourceMaps - `true` if source maps enabled
 * @param {Object} [inputSourceMap] - Source map object (optional)
 * @returns {Object} - Object with properties:
 *   {Object} .ast - AST
 *   {Object|undefined} .sources - Sources object mapping file path to file content,
 *     or `undefined` if `sourceMaps` option is `false`
 */
function parseImpl(code, filename, isEsm, isCommonJs, isJsx, isStrict, sourceMaps, inputSourceMap) {
	// Parse code to AST
	const ast = parse(code, {
		sourceType: isEsm ? 'module' : 'script',
		strictMode: isStrict,
		allowReturnOutsideFunction: isCommonJs,
		plugins: ['v8intrinsic', ...(isJsx ? ['jsx'] : [])]
	});

	// Parse source map comment if present, and remove source map comments from AST.
	// Do not parse source map comment if source maps disabled, or input source map already provided.
	const parsedSourceMap = parseSourceMapComment(
		ast, (sourceMaps && !inputSourceMap) ? filename : undefined
	);
	if (parsedSourceMap) inputSourceMap = parsedSourceMap;

	// Map AST nodes' locations according to source map and get sources
	let sources;
	if (inputSourceMap) {
		sources = mapLocations(ast, inputSourceMap, filename);
	} else if (sourceMaps) {
		sources = Object.create(null);
		sources[filename] = code;
	}

	// Return AST and sources
	return {ast, sources};
}

/**
 * Instrument code.
 * @param {string} code - Code
 * @param {string} filename - File path
 * @param {boolean} isEsm - `true` if is ES Module
 * @param {boolean} isCommonJs - `true` if is CommonJS
 * @param {boolean} isJsx - `true` if source contains JSX syntax
 * @param {boolean} isStrict - `true` if strict mode
 * @param {boolean} sourceMaps - `true` if source maps enabled
 * @param {Object} [inputSourceMap] - Source map object (optional)
 * @param {boolean} retainLines - `true` to retain original line numbers
 * @returns {Object} - Object with properties:
 *   {string} .code - Transformed code
 *   {Object|null} .map - Source map object (if `sourceMaps` option set)
 *   {Array<Object>|undefined} .rawMappings - Source map raw mappings array (if `sourceMaps` option set)
 */
function instrumentCodeImpl(
	code, filename, isEsm, isCommonJs, isJsx, isStrict, sourceMaps, inputSourceMap, retainLines
) {
	// Parse code to AST
	let {ast, sources} = parseImpl( // eslint-disable-line prefer-const
		code, filename, isEsm, isCommonJs, isJsx, isStrict, sourceMaps, inputSourceMap
	);

	// Instrument AST
	ast = instrumentAstImpl(ast, filename, isEsm, isCommonJs, isJsx, isStrict, sources);

	// Generate output code
	return generate(
		ast,
		{sourceMaps, sourceFileName: filename, retainLines},
		sources
	);
}

/**
 * Instrument AST.
 * @param {Object} ast - AST
 * @param {string} filename - File path
 * @param {boolean} isEsm - `true` if source contains ESM syntax
 * @param {boolean} isCommonJs - `true` if is CommonJS file
 * @param {boolean} isJsx - `true` if source contains JSX syntax
 * @param {boolean} isStrict - `true` if is strict mode code
 * @param {Object} [sources] - Sources object mapping file path to file content
 * @returns {Object} - Transformed AST
 */
function instrumentAstImpl(ast, filename, isEsm, isCommonJs, isJsx, isStrict, sources) {
	// Transform ESM and JSX
	if (isEsm || isJsx) ast = babelTransform(ast, isEsm, isJsx);

	// Add instrumentation to AST
	modifyAst(ast, filename, isCommonJs, isStrict, sources);

	// Return AST
	return ast;
}

/**
 * Transform AST with `@babel/plugin-transform-modules-commonjs` / `@babel/plugin-transform-react-jsx`
 * plugins if source is ESM/JSX.
 * @param {Object} ast - AST
 * @param {boolean} isEsm - `true` if source contains ESM syntax
 * @param {boolean} isJsx - `true` if source contains JSX syntax
 * @returns {Object} - Transformed AST
 */
function babelTransform(ast, isEsm, isJsx) {
	/* eslint-disable global-require */
	if (!babelTransformFromAstSync) {
		const babel = require('@babel/core');
		babelTransformFromAstSync = babel.transformFromAstSync;
		babelLoadOptions = babel.loadOptions;
	}

	const optionsCacheKey = JSON.stringify({isEsm, isJsx});
	let options = babelOptionsCache[optionsCacheKey];
	if (!options) {
		const plugins = [];
		if (isEsm) {
			if (!babelPluginModulesToCommonJs) {
				babelPluginModulesToCommonJs = require('@babel/plugin-transform-modules-commonjs').default;
				babelPluginDynamicImportToRequire = require('babel-plugin-dynamic-import-node');
			}
			plugins.push(babelPluginModulesToCommonJs, babelPluginDynamicImportToRequire);
		}
		if (isJsx) {
			if (!babelPluginTransformJsx) {
				babelPluginTransformJsx = require('@babel/plugin-transform-react-jsx').default;
			}
			plugins.push(babelPluginTransformJsx);
		}

		options = babelLoadOptions({
			configFile: false,
			babelrc: false,
			ast: true,
			sourceType: isEsm ? 'module' : 'script',
			plugins
		});
		babelOptionsCache[optionsCacheKey] = options;
	}
	/* eslint-enable global-require */

	return babelTransformFromAstSync(ast, undefined, options).ast;
}
