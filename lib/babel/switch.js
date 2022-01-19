/* --------------------
 * livepack module
 * Babel plugin switch statement visitors
 * ------------------*/

'use strict';

// Imports
const {createBlockProps, exitBlock} = require('./blocks.js'),
	{BODY_BLOCK} = require('./symbols.js');

// Exports

module.exports = {
	switchStatementEnterVisitor,
	switchStatementExitVisitor
};

/**
 * Visitor to create block for `switch` statement.
 * @param {Object} switchPath - Babel path object for `switch` statement
 * @param {Object} state - State object
 * @returns {undefined}
 */
function switchStatementEnterVisitor(switchPath, state) {
	const block = createBlockProps('switch', false, state);
	switchPath[BODY_BLOCK] = block;
	state.currentBlock = block;
}

/**
 * Visitor to exit block for `switch` statement.
 * @param {Object} switchPath - Babel path object for `switch` statement
 * @param {Object} state - State object
 * @returns {undefined}
 */
function switchStatementExitVisitor(switchPath, state) {
	exitBlock(state);
}
