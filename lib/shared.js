/* --------------------
 * livepack module
 * Shared functions
 * ------------------*/

'use strict';

// Exports

module.exports = {
	identifierIsVariable
};

/**
 * Check if identifier is being used as a variable.
 * true: `a`, `a = 1`, `a++`, `{}[a]`, `function a() {}`
 * false: `{}.a`, `{a: 1}`, `class { a() {} }`
 *
 * @param {Object} path - Babel path object for identifier
 * @returns {boolean} - `true` if is used as a variable
 */
function identifierIsVariable(path) {
	const {parentPath} = path;
	return !(parentPath.isMemberExpression({computed: false}) && path.key === 'property')
		&& !(parentPath.isObjectProperty({computed: false}) && path.key === 'key')
		&& !(parentPath.isClassMethod({computed: false}) && path.key === 'key');
}
