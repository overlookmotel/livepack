/* --------------------
 * livepack module
 * Shared functions
 * ------------------*/

'use strict';

// Modules
const {isSymbol} = require('is-it-type');

// Exports

module.exports = {
	identifierIsVariable,
	isPrimitive,
	TRACKER_COMMENT_PREFIX: 'livepack_track:',
	/* eslint-disable no-empty-function, prefer-arrow-callback */
	GeneratorPrototype: Object.getPrototypeOf(function*() {}),
	AsyncFunctionPrototype: Object.getPrototypeOf(async function() {}),
	AsyncGeneratorPrototype: Object.getPrototypeOf(async function*() {})
	/* eslint-enable no-empty-function, prefer-arrow-callback */
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
	// `NaN` + `Infinity` not considered primitives as they are global vars.
	return !isSymbol(val)
		&& !Number.isNaN(val)
		&& val !== Infinity && val !== -Infinity
		&& Object(val) !== val;
}
