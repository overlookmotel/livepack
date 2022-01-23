/* --------------------
 * livepack module
 * Babel plugin util functions
 * ------------------*/

'use strict';

// Imports
const assertBug = require('../shared/assertBug.js');

// Exports

module.exports = {
	replaceWith,
	insertComment,
	containsUseStrictDirective,
	assertWithLocation
};

/**
 * Substitute for Babel's `path.replaceWith(node)`.
 * Babel's `.replaceWith()` can lead to out-of-order visits or repeat visits,
 * and remakes path objects which babel plugin records internal properties on.
 * @param {Object} path - Babel path object
 * @param {Object} node - AST node to replace path with
 * @returns {undefined}
 */
function replaceWith(path, node) {
	path.container[path.key] = node;
}

/**
 * Add comment block to AST node, before any existing comments.
 * @param {Object} node - Babel node to attach comment to
 * @param {string} commentType - 'leading' / 'inner' / 'trailing'
 * @param {string} value - Comment body
 * @returns {undefined}
 */
function insertComment(node, commentType, value) {
	const commentNode = {type: 'CommentBlock', value},
		key = `${commentType}Comments`;

	const comments = node[key];
	if (comments) {
		comments.unshift(commentNode);
	} else {
		node[key] = [commentNode];
	}
}

/**
 * Determine if block statement contains a 'use strict' directive.
 * @param {Object} blockPath - Babel path object for block statement
 * @returns {boolean} - `true` if block contains a 'use strict' directive
 */
function containsUseStrictDirective(blockPath) {
	return blockPath.node.directives.some(directiveNode => directiveNode.value.value === 'use strict');
}

/**
 * Assert with error message including reference to code location which caused the error.
 * NB Babel includes file path in error output itself.
 * @param {*} condition - Condition - if falsy, error will be thrown
 * @param {Object} nodeOrPath - AST Node object or Babel path object
 * @param {Object} state - State object
 * @param {string} message - Error message
 * @throws {Error} - If assertion fails
 * @returns {undefined}
 */
function assertWithLocation(condition, nodeOrPath, state, message) {
	assertBug(condition, message, () => {
		const {filename} = state;
		const node = nodeOrPath.node || nodeOrPath;
		const {start} = node.loc || {start: {line: '?', column: '?'}};
		return `Location: ${filename ? `${filename}:` : ''}${start.line}:${start.column}`;
	});
}
