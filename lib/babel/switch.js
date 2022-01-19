/* --------------------
 * livepack module
 * Babel plugin switch statement visitor
 * ------------------*/

'use strict';

// Imports
const {createBlockProps} = require('./blocks.js'),
	{BODY_BLOCK} = require('./symbols.js');

// Exports

/**
 * Visitor to create block for `switch` statement.
 * @param {Object} switchPath - Babel path object for `switch` statement
 * @param {Object} state - State object
 * @returns {undefined}
 */
module.exports = function switchStatementEnterVisitor(switchPath, state) {
	switchPath[BODY_BLOCK] = createBlockProps('switch', false, state);
};
