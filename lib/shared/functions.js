/* --------------------
 * livepack module
 * Shared functions
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, sep: pathSep} = require('path'),
	checkReservedWord = require('reserved-words').check,
	{VISITOR_KEYS, COMMENT_KEYS} = require('@babel/types'),
	{isArray, isSymbol} = require('is-it-type');

// Exports

module.exports = {
	isPrimitive,
	isReservedWord,
	isReservedVarName,
	createArrayOrPush,
	combineArraysWithDedup,
	getProp,
	getProps,
	setProp,
	isInternalPath,
	isRuntimePath,
	traverseAll
};

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
 * Create an array as `obj[key]` or push elements to array if already exists.
 * @param {Object} obj - Object
 * @param {string} key - Key
 * @param {...any} values - Values to add to array
 * @returns {undefined}
 */
function createArrayOrPush(obj, key, ...values) {
	const arr = obj[key];
	if (arr) {
		arr.push(...values);
	} else {
		obj[key] = values;
	}
}

/**
 * Combine two arrays, removing duplicates.
 * If either array is `undefined` / `null`, treat it as an empty array.
 * @param {Array} [arr1] - Array 1
 * @param {Array} [arr2] - Array 2
 * @returns {Array} - New array combining elements of both arrays with duplicates removed
 */
function combineArraysWithDedup(arr1, arr2) {
	if (!arr1) return arr2 ? [...arr2] : [];
	if (!arr2) return [...arr1];

	return [...new Set([...arr1, ...arr2])];
}

/**
 * Get deep property of object, specified by key trail.
 * Simplified version of `lodash.get()` (https://lodash.com/docs/4.17.15#get).
 * e.g. `getProp({x: [{y: 1}]}, ['x', 0, 'y'])` returns `1`.
 * @param {Object} obj - Object
 * @param {Array<string|number>} trail - Array of trail segements
 * @param {number} [len=trail.length] - Stop after `len` number of keys
 * @returns {*} - Value
 */
function getProp(obj, trail, len) {
	if (len == null) len = trail.length;
	for (let i = 0; i < len; i++) {
		obj = obj[trail[i]];
	}
	return obj;
}

/**
 * Get deep properties of object, specified by key trail.
 * Returns all properties on trail, including the original object.
 * e.g. `getProps({x: {y: 1}}, ['x', 'y'])` returns `[{x: {y: 1}}, {y: 1}, 1]`.
 * @param {Object} obj - Object
 * @param {Array<string|number>} trail - Array of trail segements
 * @param {number} [len=trail.length] - Stop after `len` number of keys
 * @returns {Array<*>} - Array of values
 */
function getProps(obj, trail, len) {
	if (len == null) len = trail.length;
	const trailObjs = [obj];
	let i = 0;
	while (i < len) {
		obj = obj[trail[i]];
		i++;
		trailObjs[i] = obj;
	}
	return trailObjs;
}

/**
 * Set deep property of object, specified by key trail.
 * Simplified version of `lodash.set()` (https://lodash.com/docs/4.17.15#set).
 * e.g. `setProp({x: [{y: 1}]}, ['x', 0, 'y'], 2)` mutates object to `{x: [{y: 2}]}`.
 * @param {Object} obj - Object
 * @param {Array<string|number>} trail - Array of trail segements
 * @param {*} value - Value to set
 * @param {number} [len=trail.length] - Stop after `len` number of keys
 * @returns {undefined}
 */
function setProp(obj, trail, value, len) {
	len = (len == null ? trail.length : len) - 1;
	getProp(obj, trail, len)[trail[len]] = value;
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
 * @returns {boolean} - `true` if is a file in Livepack's codebase which should not be transformed
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
 * Traverse Babel AST, calling callback `visit()` with every node.
 * Unlike Babel's `traverse()`, also traverses over comment nodes.
 * Comments are visited before child nodes.
 * @param {Object} ast - Babel AST
 * @param {Function} visit - Visitor function, called with each node
 * @returns {undefined}
 */
function traverseAll(ast, visit) {
	const queue = [];
	let node = ast;
	do {
		visit(node);

		for (let i = NUM_COMMENT_KEYS_MINUS_ONE; i >= 0; i--) { // eslint-disable-line no-use-before-define
			const arr = node[COMMENT_KEYS[i]];
			if (arr) {
				for (let j = arr.length - 1; j >= 0; j--) {
					visit(arr[j]);
				}
			}
		}

		const keys = VISITOR_KEYS[node.type];
		if (keys) {
			for (let i = keys.length - 1; i >= 0; i--) {
				const childNode = node[keys[i]];
				if (childNode) {
					if (isArray(childNode)) {
						for (let j = childNode.length - 1; j >= 0; j--) {
							const containerChildNode = childNode[j];
							if (containerChildNode) queue.push(containerChildNode);
						}
					} else {
						queue.push(childNode);
					}
				}
			}
		}
	} while (node = queue.pop()); // eslint-disable-line no-cond-assign
}

const NUM_COMMENT_KEYS_MINUS_ONE = COMMENT_KEYS.length - 1;
