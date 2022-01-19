/* --------------------
 * livepack module
 * Babel plugin catch clause visitor
 * ------------------*/

'use strict';

// Imports
const {createBlockProps} = require('./blocks.js'),
	{PARAMS_BLOCK, BODY_BLOCK} = require('./symbols.js');

// Exports

/**
 * Visitor to create block for error var in `catch` clause of `try {} catch (e) {}`.
 * @param {Object} catchPath - Babel path object for `catch` clause
 * @param {Object} state - State object
 * @returns {undefined}
 */
module.exports = function catchClauseVisitor(catchPath, state) {
	catchPath[PARAMS_BLOCK] = createBlockProps('catch', false, state);
	catchPath[BODY_BLOCK] = createBlockProps(undefined, true, state);
};
