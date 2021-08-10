/* --------------------
 * livepack module
 * Shared functions
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, sep: pathSep} = require('path'),
	checkReservedWord = require('reserved-words').check,
	t = require('@babel/types'),
	{isSymbol} = require('is-it-type');

// Imports
const {IS_INTERNAL} = require('./symbols.js');

// Exports

module.exports = {
	identifierIsVariable,
	isPrimitive,
	isReservedWord,
	isReservedVarName,
	internalIdentifier,
	flagAsInternal,
	isInternalNode,
	replaceWith,
	addComments,
	isInternalPath,
	isRuntimePath,
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
		&& !(parentPath.isObjectMethod({computed: false}) && path.key === 'key')
		&& !(parentPath.isClassMethod({computed: false}) && path.key === 'key')
		&& !(parentPath.isLabeledStatement() && path.key === 'label')
		&& !(parentPath.isContinueStatement() && path.key === 'label')
		&& !(parentPath.isBreakStatement() && path.key === 'label')
		&& !parentPath.isMetaProperty();
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
 * Determine if var name is a JS reserved word e.g. 'break', 'class'.
 * Includes names which are reserved only in strict mode e.g. `package`.
 * @param {string} name - Variable name
 * @returns {boolean} - `true` if reserved word, `false` if not
 */
function isReservedWord(name) {
	return checkReservedWord(name, 'es6', true);
}

/**
 * Determine if name should not be used as a var name.
 * Includes all JS reserved words, plus 'arguments' + 'eval' are additionally prohibited
 * as cannot initialize vars with these names in strict mode.
 * @param {string} name - Variable name
 * @returns {boolean} - `true` if reserved var name, `false` if not
 */
function isReservedVarName(name) {
	return name === 'arguments' || name === 'eval' || isReservedWord(name);
}

/**
 * Create identifier node, flagged as internal.
 * Flag prevents identifier visitor acting on identifiers which livepack has created.
 * @param {string} name - Identifier name
 * @returns {Object} - AST Node object
 */
function internalIdentifier(name) {
	return flagAsInternal(t.identifier(name));
}

/**
 * Flag AST node as internal.
 * @param {Object} node - AST Node object
 * @returns {Object} - Input AST Node object
 */
function flagAsInternal(node) {
	node[IS_INTERNAL] = true;
	return node;
}

/**
 * Check if node is flagged as internal.
 * @param {Object} node - AST Node object
 * @returns {boolean} - `true` if node is flagged as internal
 */
function isInternalNode(node) {
	return !!node[IS_INTERNAL];
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
 * Add comment to node.
 * @param {Object} node - Babel node to attach comment to
 * @param {boolean} isInner - `true` to add as inner comment, otherwise leading comment
 * @param {boolean} insertOnEnd - `true` to add as last comment, otherwise first comment
 * @param {...Object} commentNodes - Babel nodes for comments
 * @returns {undefined}
 */
function addComments(node, isInner, insertOnEnd, ...commentNodes) {
	const commentKey = isInner ? 'innerComments' : 'leadingComments';
	let comments = node[commentKey];
	if (!comments) comments = node[commentKey] = [];

	if (insertOnEnd) {
		comments.push(...commentNodes);
	} else {
		comments.unshift(...commentNodes);
	}
}

/**
 * Determine if a file path should not be Babel-transformed.
 *
 * Internal files are:
 * - Everything in `lib/` except for `lib/runtime/*`
 * - All top level files e.g. `index.js`
 *
 * `lib/runtime` is excluded as it contains code which is used in output.
 *
 * @param {string} path - File path
 * @returns {boolean} - `true` if is a file in livepack's codebase which should not be transformed
 */
function isInternalPath(path) {
	/* eslint-disable no-use-before-define */
	if (!path.startsWith(LIVEPACK_DIR_PATH)) return false;

	const localPath = path.slice(LIVEPACK_DIR_PATH_LEN);
	if (!localPath.includes(pathSep)) return true;
	if (!localPath.startsWith(LIB_PATH)) return false;
	return !localPath.startsWith(RUNTIME_PATH);
	/* eslint-enable no-use-before-define */
}

/**
 * Determine if a file path is Livepack's runtime functions.
 * @param {string} path - File path
 * @returns {boolean} - `true` if is a file containing Livepack's runtime functions
 */
function isRuntimePath(path) {
	return path.startsWith(RUNTIME_DIR_PATH); // eslint-disable-line no-use-before-define
}

const LIVEPACK_DIR_PATH = pathJoin(__dirname, '../../'),
	LIVEPACK_DIR_PATH_LEN = LIVEPACK_DIR_PATH.length,
	LIB_PATH = `lib${pathSep}`,
	RUNTIME_PATH = `lib${pathSep}runtime${pathSep}`,
	RUNTIME_DIR_PATH = `${LIVEPACK_DIR_PATH}${RUNTIME_PATH}`;

/**
 * Split code body from source map comment.
 * @param {string} code - File's source code
 * @returns {Object} - Object with props:
 *   {string} .code - Code with sourcemap removed
 *   {string|undefined} .sourceMapComment - Source map comment
 *   {undefined} .map - Placeholder for parsed source map
 *   {undefined} .consumer - Placeholder for source map consumer
 */
function parseSourceMapFromCode(code) {
	// eslint-disable-next-line no-use-before-define
	const [, codeBody, sourceMapComment] = code.match(SOURCE_MAP_SPLIT_REGEX) || ['', code, undefined];
	return {code: codeBody, sourceMapComment, map: undefined, consumer: undefined};
}

const SOURCE_MAP_SPLIT_REGEX = /^([\s\S]+\n)(\/\/# sourceMappingURL=(?:[^\n]+))$/;
