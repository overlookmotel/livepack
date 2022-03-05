/* --------------------
 * livepack module
 * Code instrumentation utility functions
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types'),
	{COMMENT_KEYS} = t;

// Exports

module.exports = {
	insertComment,
	hasUseStrictDirective,
	stringLiteralWithSingleQuotes,
	copyLoc,
	copyComments,
	copyCommentsToInnerComments,
	copyLocAndComments,
	flagAllAncestorFunctions
};

/**
 * Add comment block to AST node, before any existing comments.
 * @param {Object} node - AST node to attach comment to
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
 * Determine if function / program has a 'use strict' directive.
 * @param {Object} node - Function body or program AST node
 * @returns {boolean} - `true` if contains a 'use strict' directive
 */
function hasUseStrictDirective(node) {
	return node.directives.some(directiveNode => directiveNode.value.value === 'use strict');
}

/**
 * Create string literal AST node with single quotes.
 * @param {string} str - String
 * @returns {Object} - String literal AST node
 */
function stringLiteralWithSingleQuotes(str) {
	const strNode = t.stringLiteral(str);
	strNode.extra = {
		rawValue: str,
		raw: `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
	};
	return strNode;
}

/**
 * Copy location information from source AST node to destination AST node.
 * @param {Object} destNode - Destination AST node
 * @param {Object} srcNode - Source AST node
 * @returns {Object} - Destination AST node
 */
function copyLoc(destNode, srcNode) {
	destNode.start = srcNode.start;
	destNode.end = srcNode.end;
	destNode.loc = srcNode.loc;
	return destNode;
}

/**
 * Copy comments from source AST node to destination AST node.
 * @param {Object} destNode - Destination AST node
 * @param {Object} srcNode - Source AST node
 * @returns {Object} - Destination AST node
 */
function copyComments(destNode, srcNode) {
	for (const commentKey of COMMENT_KEYS) {
		destNode[commentKey] = srcNode[commentKey];
	}
	return destNode;
}

/**
 * Copy all comments from source AST node to destination AST node's `innerComments`.
 * @param {Object} destNode - Destination AST node
 * @param {Object} srcNode - Source AST node
 * @returns {Object} - Destination AST node
 */
function copyCommentsToInnerComments(destNode, srcNode) {
	const destComments = destNode.innerComments;
	for (const commentKey of COMMENT_KEYS) {
		destComments.push(...srcNode[commentKey]);
	}
	return destNode;
}

/**
 * Copy location information and comments from source AST node to destination AST node.
 * @param {Object} destNode - Destination AST node
 * @param {Object} srcNode - Source AST node
 * @returns {Object} - Destination AST node
 */
function copyLocAndComments(destNode, srcNode) {
	return copyLoc(copyComments(destNode, srcNode), srcNode);
}

/**
 * Set a flag on function, and all ancestor functions above.
 * e.g. 'containsEval' flag.
 * @param {Object} [fn] - Function object (optional)
 * @param {string} flag - Flag name
 * @returns {undefined}
 */
function flagAllAncestorFunctions(fn, flag) {
	while (fn && !fn[flag]) {
		fn[flag] = true;
		fn = fn.parent;
	}
}
