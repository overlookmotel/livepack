/* --------------------
 * livepack module
 * Shared functions
 * ------------------*/

'use strict';

// Modules
const pathJoin = require('path').join,
	{isSymbol} = require('is-it-type');

// Exports

module.exports = {
	identifierIsVariable,
	isPrimitive,
	replaceWith,
	isInternalPath,
	parseSourceMapFromCode
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
 * i.e. everything in `lib/` except for `lib/serialize/external.js`.
 * `serialize/external.js` is excluded as it contains code which is used in output.
 * @param {string} path - File path
 * @returns {boolean} - `true` if is a file in livepack's codebase which should
 */
function isInternalPath(path) {
	return path.startsWith(LIVEPACK_DIR_PATH) // eslint-disable-line no-use-before-define
		&& path !== LIVEPACK_EXTERNALS_PATH; // eslint-disable-line no-use-before-define
}

const LIVEPACK_DIR_PATH = pathJoin(__dirname, '../'),
	LIVEPACK_EXTERNALS_PATH = pathJoin(__dirname, '../serialize/external.js');

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