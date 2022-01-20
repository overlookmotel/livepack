/* --------------------
 * livepack module
 * Utility functions
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const assertBug = require('../shared/assertBug.js');

// Exports

module.exports = {
	isJsIdentifier,
	isNumberKey,
	isIntegerKey,
	toJsIdentifier,
	createKeyNode,
	recordIsCircular,
	replaceRecordNode,
	getNodeWithinWrapperParent,
	deleteItem,
	deleteFirst
};

/**
 * Determine if string is valid JS identifier.
 * @param {string} name - Input string
 * @returns {boolean} - `true` if is valid JS identifier
 */
function isJsIdentifier(name) {
	return JS_ID_REGEX.test(name); // eslint-disable-line no-use-before-define
}

const JS_ID_REGEX = /^[A-Za-z$_][A-Za-z0-9$_]*$/u;

/**
 * Determine if string is valid number object key.
 * e.g. `{0: 'a'}`, `{22: 'a'}`
 * TODO Return true for other valid number keys e.g. `{1.2: 'a'}`
 * @param {string} name - Input string
 * @returns {boolean} - `true` if is valid number object key
 */
function isNumberKey(name) {
	if (name === '0') return true;
	if (!NUMBER_KEY_REGEX.test(name)) return false; // eslint-disable-line no-use-before-define
	return Number.isSafeInteger(name * 1);
}

const NUMBER_KEY_REGEX = /^[1-9][0-9]*$/u;

/**
 * Determine if a string is a valid integer key.
 * Integers above a certain value are treated as string keys. The max is 4294967294.
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/length
 * @param {string} name - Input string
 * @returns {boolean} - `true` if is valid integer object key
 */
function isIntegerKey(name) {
	return isNumberKey(name) && name * 1 <= MAX_INTEGER_KEY; // eslint-disable-line no-use-before-define
}

const MAX_INTEGER_KEY = 4294967294;

/**
 * Convert string to valid JS identifier.
 * Replace illegal chars with '_' and prefix with '_' if starts with a digit.
 * @param {string} name - Input string
 * @returns {string} - JS identifier
 */
function toJsIdentifier(name) {
	return name.replace(JS_ID_ILLEGAL_CHARS_REGEX, '_') // eslint-disable-line no-use-before-define
		.replace(STARTING_DIGIT_REGEX, digit => `_${digit}`); // eslint-disable-line no-use-before-define
}

const JS_ID_ILLEGAL_CHARS_REGEX = /[^A-Za-z0-9$_]+/gu,
	STARTING_DIGIT_REGEX = /^[0-9]/u;

/**
 * Create node for object key.
 * @param {string} key - Key
 * @returns {Object} - Babel node for key
 */
function createKeyNode(key) {
	if (isJsIdentifier(key)) return t.identifier(key);
	if (isNumberKey(key)) return t.numericLiteral(key * 1);
	return t.stringLiteral(key);
}

/**
 * Determine if a record is a circular reference.
 * @param {Object} record - Record
 * @returns {boolean} - `true` if record is circular
 */
function recordIsCircular(record) {
	return record.node === undefined;
}

/**
 * Replace node for a record, maintaining wrapping with `Object.assign()` etc
 * @param {Object} record - Record to replace node on
 * @param {Object} replacementNode - New Babel node for record
 * @returns {undefined}
 */
function replaceRecordNode(record, replacementNode) {
	const parentNode = getNodeWithinWrapperParent(record.node);
	if (!parentNode) {
		record.node = replacementNode;
	} else {
		parentNode[0] = replacementNode;
	}
}

/**
 * Nodes for values can be wrapped in `Object.assign()`, `Object.defineProperties()`,
 * `Object.setPrototypeOf()`.
 *
 * Traverse up wrappers and return parent node of the central value.
 * The central node will be at property `0` of this parent node.
 * e.g. if node is `Object.setPrototypeOf(Object.assign(x, {foo: 1}), Array.prototype)`
 * return the array of arguments of `Object.assign(...)` call expression.
 *
 * If node is not wrapped in this way, return `undefined`.
 *
 * @param {Object} node - Babel node
 * @returns {Object|undefined} - Parent node, or `undefined` if no wrapper
 */
function getNodeWithinWrapperParent(node) {
	if (!t.isCallExpression(node)) return undefined;

	let argumentsNode = node.arguments;
	while (t.isCallExpression(argumentsNode[0])) {
		argumentsNode = argumentsNode[0].arguments;
	}
	return argumentsNode;
}

/**
 * Delete first instance of value from array, and return deleted value.
 * @param {Array} arr - Array
 * @param {*} value - Value to delete
 * @returns {*} - Deleted value
 */
function deleteItem(arr, value) {
	return deleteIndex(arr, arr.indexOf(value));
}

/**
 * Delete first value in array where `fn()` returns truthy value, and return deleted value.
 * @param {Array} arr - Array
 * @param {Function} fn - Function to be called on each item of array
 * @returns {*} - Deleted value
 */
function deleteFirst(arr, fn) {
	return deleteIndex(arr, arr.findIndex(fn));
}

function deleteIndex(arr, index) {
	assertBug(index >= 0, 'Could not find matching array entry to delete');
	return arr.splice(index, 1)[0];
}
