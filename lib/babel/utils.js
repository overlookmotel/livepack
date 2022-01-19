/* --------------------
 * livepack module
 * Babel plugin util functions
 * ------------------*/

'use strict';

// Imports
const {
		TRACKER_COMMENT_PREFIX,
		FN_TYPE_FUNCTION, FN_TYPE_ASYNC_FUNCTION, FN_TYPE_GENERATOR_FUNCTION,
		FN_TYPE_ASYNC_GENERATOR_FUNCTION
	} = require('../shared/constants.js'),
	assertBug = require('../shared/assertBug.js');

// Exports

module.exports = {
	recordVarUse,
	getFunctionType,
	insertTrackerComment,
	createBlockId,
	initBlockScope,
	replaceWith,
	addComment,
	assertWithLocation
};

// Import after exports to avoid circular require
const {createScopeIdVarNode} = require('./internalVars.js');

/**
 * Record use of var.
 * Record on current function, and all functions above,
 * up until function where var originates (`bindingFunction`).
 *
 * @param {string} varName - Var name
 * @param {Object} block - Block props object
 * @param {boolean} isReadFrom - `true` if var is read from
 * @param {boolean} isAssignedTo - `true` if var is written to
 * @param {boolean} isFunction - `true` if var is reference to function name
 * @param {boolean} shouldRecordTrail - `true` if should record trail to var
 * @param {Object} state - State object
 * @returns {Array<Object>} - Array of function props objects
 */
function recordVarUse(varName, block, isReadFrom, isAssignedTo, isFunction, shouldRecordTrail, state) {
	// Init scope ID var on statement block which includes var definition
	initBlockScope(block, state);

	const blockId = block.id,
		fns = [];
	let fn = state.currentFunction,
		firstVarProps;
	while (true) { // eslint-disable-line no-constant-condition
		// Record var on this function's scopes
		const fnScopes = fn.scopes,
			scope = fnScopes.get(blockId);
		let vars;
		if (!scope) {
			vars = Object.create(null);
			fnScopes.set(blockId, {block, vars});
		} else {
			vars = scope.vars;

			// Stop if already recorded on this function (and therefore also on parents)
			const varProps = vars[varName];
			if (varProps) {
				if (!firstVarProps) firstVarProps = varProps;
				break;
			}
		}

		const varProps = {isReadFrom: false, isAssignedTo: false, isFunction, trails: []};
		vars[varName] = varProps;
		if (!firstVarProps) firstVarProps = varProps;

		// Add to array of functions
		fns.push(fn);

		// Step down to function above
		fn = fn.parent;
		if (!fn) break;

		// Stop if reached function where var originates
		if (fn.id <= blockId) break;
	}

	// Set read/written flags on first function scope only
	if (isReadFrom) firstVarProps.isReadFrom = true;
	if (isAssignedTo) firstVarProps.isAssignedTo = true;
	if (shouldRecordTrail) firstVarProps.trails.push([...state.trail]);

	// Return array of function props objects (used in `processArguments()` and `superVisitor()`)
	return fns;
}

/**
 * Get type code for function.
 * @param {Object} fnNode - AST node for function
 * @returns {string} - Function type code
 */
function getFunctionType(fnNode) {
	return fnNode.async
		? fnNode.generator
			? FN_TYPE_ASYNC_GENERATOR_FUNCTION
			: FN_TYPE_ASYNC_FUNCTION
		: fnNode.generator
			? FN_TYPE_GENERATOR_FUNCTION
			: FN_TYPE_FUNCTION;
}

/**
 * Insert tracker comment.
 * @param {number} fnId - Function ID
 * @param {string} fnType - Function type
 * @param {Array} [callArguments] - Call arguments
 * @param {Object} commentHolderNode - AST node to attach comment to
 * @param {string} commentType - 'leading' / 'inner' / 'trailing'
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function insertTrackerComment(fnId, fnType, callArguments, commentHolderNode, commentType, state) {
	const callArgsStr = callArguments ? JSON.stringify(callArguments) : '';

	// Encode filename as JSON to escape non-ascii chars.
	// Escape `*/` so does not terminate comment early.
	// `JSON.parse('"*\/"')` is `'*/'` so it needs no special unescaping.
	const {filename} = state;
	const filenameEscaped = filename
		? JSON.stringify(filename).slice(1, -1).replace(/\*\//g, '*\\/')
		: '';

	addComment(
		commentHolderNode, commentType,
		`${TRACKER_COMMENT_PREFIX}${fnId};${fnType};${callArgsStr};${filenameEscaped}`
	);
}

/**
 * Create unique block ID.
 * @param {Object} state - State object
 * @returns {number} - Block ID
 */
function createBlockId(state) {
	return state.blockId++;
}

/**
 * Init scope on statement block.
 * @param {Object} block - Block props object
 * @param {Object} state - State object
 * @returns {undefined}
 */
function initBlockScope(block, state) {
	const {varsBlock} = block;
	if (!varsBlock.scopeIdVarNode) varsBlock.scopeIdVarNode = createScopeIdVarNode(varsBlock.id, state);
}

/**
 * Substitute for Babel's `path.replaceWith(node)`.
 * Babel's `.replaceWith()` can lead to out-of-order visits or repeat visits,
 * and remakes path objects which babel plugin records internal properties on.
 * @param {Object} path - Babel path object
 * @param {Object} node - AST node to replace path with
 * @returns {undefined}
 */
function replaceWith(path, node) {
	let parentNode = path.parentPath.node;
	if (path.listKey) parentNode = parentNode[path.listKey];
	parentNode[path.key] = node;
}

/**
 * Add comment block to AST node, before any existing comments.
 * @param {Object} node - Babel node to attach comment to
 * @param {string} commentType - 'leading' / 'inner' / 'trailing'
 * @param {string} value - Comment body
 * @returns {undefined}
 */
function addComment(node, commentType, value) {
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
