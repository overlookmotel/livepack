/* --------------------
 * livepack module
 * Babel plugin util functions
 * ------------------*/

'use strict';

// Modules
const pathParse = require('path').parse,
	t = require('@babel/types');

// Imports
const {SCOPE_ID_VAR_NODE, BLOCK_ID, BLOCK_NAME, FUNCTION_PROPS} = require('./symbols.js'),
	{TRACKER_COMMENT_PREFIX, TEMP_COMMENT_PREFIX} = require('../shared/constants.js'),
	assertBug = require('../shared/assertBug.js');

// Exports

module.exports = {
	recordVarUse,
	createTrackerComment,
	enterBlock,
	createBlockId,
	initScope,
	getParentBlockPath,
	tagTempVarWithType,
	createParentVarBindingBlockPath,
	assertWithLocation
};

// Import after exports to avoid circular require
const {createScopeIdVarNode} = require('./internalVars.js');

/**
 * Record use of var in call to `tracker()`.
 * @param {string} name - Var name
 * @param {Object} functionPath - Babel path for function in which the use of var occurs
 * @param {Object} bindingBlockPath - Babel path for statement block which includes var definition
 * @param {boolean} isConst - `true` if var is a const
 * @param {Object} state - State object
 * @returns {Array<Object>} - Array of function props objects
 */
function recordVarUse(name, functionPath, bindingBlockPath, isConst, state) {
	// Init scope on statement block which includes var definition
	const blockId = bindingBlockPath[BLOCK_ID];
	let scopeIdVarNode = bindingBlockPath[SCOPE_ID_VAR_NODE];
	if (!scopeIdVarNode) scopeIdVarNode = initScope(bindingBlockPath, blockId, state);

	// Record var use on all functions above
	const fns = [];
	do {
		// Record var use in function props
		const fnProps = functionPath[FUNCTION_PROPS],
			fnScopes = fnProps.scopes;
		let scope = fnScopes.get(blockId);
		if (!scope) {
			const blockName = bindingBlockPath[BLOCK_NAME];
			scope = {
				blockId,
				scopeIdVarNode,
				varNames: new Set(),
				constNames: new Set(),
				blockName
			};
			fnScopes.set(blockId, scope);
		} else if (scope.varNames.has(name)) {
			// Stop if already recorded on this function (and therefore also on parents)
			break;
		}

		scope.varNames.add(name);
		if (isConst) scope.constNames.add(name);

		fns.push(fnProps);

		functionPath = functionPath.findParent(path => path.isFunction() || path === bindingBlockPath);
	} while (functionPath && functionPath !== bindingBlockPath);

	// Return array of function props objects (used in `processArguments()` and `superVisitor()`)
	return fns;
}

/**
 * Create tracker comment.
 * @param {number} id - Block ID
 * @param {Array<object>} scopes - Array of scopes
 * @param {boolean} isStrict - `true` if is strict mode
 * @param {boolean} isMethod - `true` if is method
 * @param {boolean} superIsProto - `true` if `super` refers to class prototype
 * @param {Array<Array>} [importVars] - Array of imported var mappings
 * @param {Array<string>} [exportNames] - Array of exported var names
 * @param {Array<string>} [argNames] - Array of argument names if function refers to `arguments` var
 * @param {Object} state - Babel state object for file
 * @returns {Object} - Tracker comment node
 */
function createTrackerComment(
	id, scopes, isStrict, isMethod, superIsProto, importVars, exportNames, argNames, state
) {
	// eslint-disable-next-line max-len
	// `/*livepack_track:{"id":3,"scopes":[{"blockId":1,"varNames":["a"],"constNames":["a"],"blockName":"index"},{"blockId":2,"varNames":["b", "arguments"],"constNames":["arguments"],"blockName":"outer"}],"filename":"/path/to/file.js","isMethod":true,argNames:["b"]}*/`
	const {filename} = state;
	const props = {
		id,
		scopes: scopes.map(({blockId, varNames, constNames, blockName}) => {
			const scopeDef = {blockId, varNames: [...varNames]};
			if (constNames.size > 0) scopeDef.constNames = [...constNames];
			if (blockName) scopeDef.blockName = blockName;
			return scopeDef;
		})
	};
	if (filename) props.filename = filename;
	if (isStrict) props.isStrict = true;
	if (isMethod) props.isMethod = true;
	if (superIsProto) props.superIsProto = true;
	if (argNames) props.argNames = argNames;
	if (state.isEvalCode) props.isEval = true;
	if (importVars) props.importNames = importVars;
	if (exportNames) props.exportNames = exportNames;

	return {
		type: 'CommentBlock',
		value: `${TRACKER_COMMENT_PREFIX}${JSON.stringify(props)}`
	};
}

/**
 * Set unique block ID on path.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {Object} state - State object
 * @returns {number} - Block ID
 */
function enterBlock(blockPath, state) {
	const blockId = createBlockId(state);
	blockPath[BLOCK_ID] = blockId;
	return blockId;
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
 * @param {Object} blockPath - Babel path object for statement block
 * @param {number} blockId - Block ID
 * @param {Object} state - State object
 * @returns {Object} - `scopeId` var node (named e.g. 'scopeId_100')
 */
function initScope(blockPath, blockId, state) {
	// If block is a class or object literal, use scope var from parent block
	const isClass = blockPath.isClass();
	if (isClass || blockPath.isObjectExpression()) {
		const parentBlockPath = getParentBlockPath(blockPath, state);
		let scopeIdVarNode = parentBlockPath[SCOPE_ID_VAR_NODE];
		if (!scopeIdVarNode) scopeIdVarNode = initScope(parentBlockPath, parentBlockPath[BLOCK_ID], state);
		blockPath[SCOPE_ID_VAR_NODE] = scopeIdVarNode;
		const idNode = isClass ? blockPath.node.id : undefined;
		blockPath[BLOCK_NAME] = idNode ? idNode.name : undefined;
		return scopeIdVarNode;
	}

	// Create scopeId var node + record on path
	const scopeIdVarNode = createScopeIdVarNode(blockId, state);
	blockPath[SCOPE_ID_VAR_NODE] = scopeIdVarNode;

	// Get block name and record on path
	let blockName;
	const parentBindingPath = blockPath.parentPath;
	if (!parentBindingPath) {
		const {filename} = state;
		if (filename) blockName = pathParse(filename).name;
	} else if (parentBindingPath.isFunction()) {
		const idNode = parentBindingPath.node.id;
		if (idNode) blockName = idNode.name;
	}
	blockPath[BLOCK_NAME] = blockName;

	return scopeIdVarNode;
}

function getParentBlockPath(path, state) {
	return path.findParent(parentPath => parentPath.isBlockStatement()) || state.programPath;
}

function tagTempVarWithType(node, type) {
	node.leadingComments = [{
		type: 'CommentBlock',
		value: `${TEMP_COMMENT_PREFIX}${type}`
	}];
}

/**
 * Create synthetic binding block path for a parent var used in `eval`-ed code.
 * @param {Object} parentVar - Parent var props object
 * @returns {Object} - Imitation Babel path object
 */
function createParentVarBindingBlockPath(parentVar) {
	return {
		[BLOCK_ID]: parentVar.blockId,
		[SCOPE_ID_VAR_NODE]: t.numericLiteral(parentVar.scopeId),
		[BLOCK_NAME]: parentVar.blockName
	};
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
