/* --------------------
 * livepack module
 * Babel plugin catch clause visitors
 * ------------------*/

'use strict';

// Imports
const {createBlockProps, exitBlock} = require('./blocks.js'),
	{PARAMS_BLOCK, BODY_BLOCK} = require('./symbols.js');

// Exports

module.exports = {
	catchClauseEnterVisitor,
	catchClauseExitVisitor
};

/**
 * Visitor to create block for error var in `catch` clause of `try {} catch (e) {}`.
 * @param {Object} catchPath - Babel path object for `catch` clause
 * @param {Object} state - State object
 * @returns {undefined}
 */
function catchClauseEnterVisitor(catchPath, state) {
	const paramsBlock = createBlockProps('catch', false, state);
	catchPath[PARAMS_BLOCK] = paramsBlock;
	state.currentBlock = paramsBlock;

	catchPath[BODY_BLOCK] = createBlockProps(undefined, true, state);
}

/**
 * Visitor to exit block for error var in `catch` clause of `try {} catch (e) {}`.
 * @param {Object} catchPath - Babel path object for `catch` clause
 * @param {Object} state - State object
 * @returns {undefined}
 */
function catchClauseExitVisitor(catchPath, state) {
	exitBlock(state);
}
