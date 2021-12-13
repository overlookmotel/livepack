/* --------------------
 * livepack module
 * Babel plugin util functions
 * ------------------*/

'use strict';

// Imports
const {TRACKER_COMMENT_PREFIX} = require('../shared/constants.js'),
	assertBug = require('../shared/assertBug.js');

// Exports

module.exports = {
	recordVarUse,
	createTrackerComment,
	createBlockId,
	getOrCreateScope,
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
 * @param {string} name - Var name
 * @param {Object} block - Block props object
 * @param {boolean} isConst - `true` if var is a const
 * @param {boolean} isConstInStrict - `true` if var is a const in strict mode only
 * @param {Object} state - State object
 * @returns {Array<Object>} - Array of function props objects
 */
function recordVarUse(name, block, isConst, isConstInStrict, state) {
	// Init scope ID var on statement block which includes var definition
	const scopeIdVarNode = getOrCreateScope(block, state);

	const {id: blockId, name: blockName} = block,
		fns = [];
	let fn = state.currentFunction;
	while (true) { // eslint-disable-line no-constant-condition
		// Record var on this function's scopes
		const fnScopes = fn.scopes;
		let scope = fnScopes.get(blockId);
		if (!scope) {
			scope = {
				blockId,
				scopeIdVarNode,
				varNames: new Set(),
				constNames: new Set(),
				constInStrictNames: new Set(),
				blockName
			};
			fnScopes.set(blockId, scope);
		} else if (scope.varNames.has(name)) {
			// Stop if already recorded on this function (and therefore also on parents)
			break;
		}

		scope.varNames.add(name);
		if (isConst) {
			scope.constNames.add(name);
		} else if (isConstInStrict) {
			scope.constInStrictNames.add(name);
		}

		// Add to array of functions
		fns.push(fn);

		// Step down to function above
		fn = fn.parent;
		if (!fn) break;

		// Stop if reached function where var originates
		if (fn.id <= blockId) break;
	}

	// Return array of function props objects (used in `processArguments()` and `superVisitor()`)
	return fns;
}

/**
 * Create tracker comment.
 * @param {number} id - Block ID
 * @param {Array<object>} scopes - Array of scopes
 * @param {Array|undefined} callArguments - Arguments to call function with to trigger tracker
 * @param {boolean} isClass - `true` if is class
 * @param {boolean} isAsync - `true` if is async function
 * @param {boolean} isGenerator - `true` if is generator function
 * @param {boolean} isStrict - `true` if is strict mode
 * @param {boolean} superIsProto - `true` if `super` refers to class prototype
 * @param {boolean} containsEval - `true` if function contains `eval()`
 * @param {Array<string>} [argNames] - Array of argument names if function refers to `arguments` var
 * @param {Object} state - Babel state object for file
 * @returns {string} - Tracker comment body
 */
function createTrackerComment(
	id, scopes, callArguments, isClass, isAsync, isGenerator, isStrict, superIsProto,
	containsEval, argNames, state
) {
	// eslint-disable-next-line max-len
	// `/*livepack_track:{"id":3,"scopes":[{"blockId":1,"varNames":["a"],"constNames":["a"],"blockName":"index"},{"blockId":2,"varNames":["b", "arguments"],"constNames":["arguments"],"blockName":"outer"}],"filename":"/path/to/file.js","isStrict":true,argNames:["b"]}*/`
	const {filename} = state;
	const props = {
		id,
		scopes: scopes.map(({blockId, varNames, constNames, constInStrictNames, blockName}) => {
			const scopeDef = {blockId, varNames: [...varNames]};
			if (constNames.size > 0) scopeDef.constNames = [...constNames];
			if (constInStrictNames.size > 0) scopeDef.constInStrictNames = [...constInStrictNames];
			if (blockName) scopeDef.blockName = blockName;
			return scopeDef;
		})
	};
	if (filename) props.filename = filename;
	if (callArguments) props.callArguments = callArguments;
	if (isClass) {
		props.isClass = true;
	} else {
		if (isAsync) props.isAsync = true;
		if (isGenerator) props.isGenerator = true;
	}
	if (isStrict) props.isStrict = true;
	if (superIsProto) props.superIsProto = true;
	if (containsEval) props.containsEval = true;
	if (argNames) props.argNames = argNames;

	return `${TRACKER_COMMENT_PREFIX}${JSON.stringify(props)}`;
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
 * @returns {Object} - `scopeId` var node (named e.g. 'scopeId_100')
 */
function getOrCreateScope(block, state) {
	block = block.varsBlock;
	return block.scopeIdVarNode // eslint-disable-line no-return-assign
		|| (block.scopeIdVarNode = createScopeIdVarNode(block.id, state));
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
