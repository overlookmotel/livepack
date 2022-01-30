/* --------------------
 * livepack module
 * Shared functions
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, sep: pathSep} = require('path'),
	checkReservedWord = require('reserved-words').check,
	{isSymbol} = require('is-it-type');

// Exports

module.exports = {
	identifierIsVariable,
	isPrimitive,
	isReservedWord,
	isReservedVarName,
	createArrayOrPush,
	setAddFrom,
	isInternalPath,
	isRuntimePath
};

/**
 * Check if identifier is being used as a variable.
 * true: `a`, `a = 1`, `a++`, `{}[a]`, `{}?.[a]`, `function a() {}`,
 *   `{ [a]: 1 }`, `{ [a]() {} }`, `class { [a]() {} }`
 * false: `{}.a`, `{}?.a`, `{a: 1}`, `{ a() {} }`, `class { a() {} }`,
 *   `a: while (0) {}`, `continue a`, `break a`, `import.meta`
 *
 * @param {Object} path - Babel path object for identifier
 * @returns {boolean} - `true` if is used as a variable
 */
function identifierIsVariable(path) {
	const {parentPath} = path;
	return !(parentPath.isMemberExpression({computed: false}) && path.key === 'property')
		&& !(parentPath.isOptionalMemberExpression({computed: false}) && path.key === 'property')
		&& !(parentPath.isObjectProperty({computed: false}) && path.key === 'key')
		&& !(parentPath.isObjectMethod({computed: false}) && path.key === 'key')
		&& !(parentPath.isClassMethod({computed: false}) && path.key === 'key')
		&& !(parentPath.isPrivateName())
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
 * Add all entries from `from` into `set`.
 * @param {Set} set - Set
 * @param {Iterable} from - Iterable (e.g. Set, Array) whose entries to add to `set`
 * @returns {Set} - Input set
 */
function setAddFrom(set, from) {
	for (const entry of from) {
		set.add(entry);
	}
	return set;
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
