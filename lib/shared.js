/* --------------------
 * livepack module
 * Shared functions
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin} = require('path'),
	{isSymbol} = require('is-it-type');

// Exports

const COMMON_JS_LOCAL_VAR_NAMES = ['module', 'exports', 'require'],
	COMMON_JS_VAR_NAMES = [...COMMON_JS_LOCAL_VAR_NAMES, '__filename', '__dirname'];

module.exports = {
	identifierIsVariable,
	isPrimitive,
	replaceWith,
	isInternalPath,
	parseSourceMapFromCode,
	TRANSFORMED_COMMENT: 'livepack_babel_transformed',
	TRACKER_COMMENT_PREFIX: 'livepack_track:',
	TEMP_COMMENT_PREFIX: 'livepack_temp:',
	COMMON_JS_LOCAL_VAR_NAMES,
	COMMON_JS_VAR_NAMES,
	/* eslint-disable no-empty-function, prefer-arrow-callback */
	GeneratorPrototype: Object.getPrototypeOf(function*() {}),
	AsyncFunctionPrototype: Object.getPrototypeOf(async function() {}),
	AsyncGeneratorPrototype: Object.getPrototypeOf(async function*() {}),
	TypedArrayPrototype: Object.getPrototypeOf(Uint8Array.prototype),
	/* eslint-enable no-empty-function, prefer-arrow-callback */
	regexSourceGetter: Object.getOwnPropertyDescriptors(RegExp.prototype).source.get,
	regexFlagsGetter: Object.getOwnPropertyDescriptors(RegExp.prototype).flags.get
};

/**
 * Check if identifier is being used as a variable.
 * true: `a`, `a = 1`, `a++`, `{}[a]`, `function a() {}`
 * false: `{}.a`, `{a: 1}`, `class { a() {} }`, `a: while (0) {}`, `continue a`, `break a`
 *
 * @param {Object} path - Babel path object for identifier
 * @returns {boolean} - `true` if is used as a variable
 */
function identifierIsVariable(path) {
	const {parentPath} = path;
	return !(parentPath.isMemberExpression({computed: false}) && path.key === 'property')
		&& !(parentPath.isObjectProperty({computed: false}) && path.key === 'key')
		&& !(parentPath.isClassMethod({computed: false}) && path.key === 'key')
		&& !(parentPath.isLabeledStatement() && path.key === 'label')
		&& !(parentPath.isContinueStatement() && path.key === 'label')
		&& !(parentPath.isBreakStatement() && path.key === 'label');
}

/**
 * Determine if value is a primitive.
 * @param {*} val - Value
 * @returns {boolean} - `true` if value is a primitive
 */
function isPrimitive(val) {
	// Symbols are not considered primitives as they need to be uniquely referenced.
	// `undefined` + `NaN` + `Infinity` not considered primitives as they are global vars.
	return val !== undefined
		&& !isSymbol(val)
		&& !Number.isNaN(val)
		&& val !== Infinity && val !== -Infinity
		&& Object(val) !== val;
}

/**
 * Substitute for Babel's `path.replaceWith(node)`.
 * Babel's `.replaceWith()` can lead to out-of-order visits or repeat visits,
 * and remakes path objects which babel plugin records internal properties on.
 * @param {Object} path - Babel path object
 * @param {Object} node - AST node to replace path with
 * @returns {undefined}
 */
function replaceWith(path, node) {
	let parentNode = path.parentPath.node;
	if (path.listKey) parentNode = parentNode[path.listKey];
	parentNode[path.key] = node;
}

/**
 * Determine if a file path should not be Babel-transformed.
 * Everything comprising livepack's main export is transformed, but functions
 * comprising tracking the code which livepack injects into files is not (`tracker` + `init`).
 * `tracker.js` + `argumentProxy.js` are treated specially so they can be serialized.
 * `internal.js` contains no functions but is skipped to prevent it being wiped from
 * require cache in `register`.
 * @param {string} path - File path
 * @returns {boolean} - `true` if is a file in which should be transformed
 */
function isInternalPath(path) {
	// eslint-disable-next-line no-use-before-define
	return INTERNAL_PATHS.includes(path) || path.startsWith(INIT_PATH);
}

const INIT_PATH = pathJoin(__dirname, 'init/');
const INTERNAL_PATHS = ['internal.js', 'tracker.js', 'serialize/argumentProxy.js']
	.map(filename => pathJoin(__dirname, filename));

/**
 * Split code body from source map comment.
 * @param {string} code - File's source code
 * @returns {Object}
 * @returns {string} .code - Code with sourcemap removed
 * @returns {string|undefined} .sourceMapComment - Source map comment
 * @returns {undefined} .map - Placeholder for parsed source map
 * @returns {undefined} .consumer - Placeholder for source map consumer
 */
function parseSourceMapFromCode(code) {
	// eslint-disable-next-line no-use-before-define
	const [, codeBody, sourceMapComment] = code.match(SOURCE_MAP_SPLIT_REGEX) || ['', code, undefined];
	return {code: codeBody, sourceMapComment, map: undefined, consumer: undefined};
}

const SOURCE_MAP_SPLIT_REGEX = /^([\s\S]+\n)(\/\/# sourceMappingURL=(?:[^\n]+))$/;
