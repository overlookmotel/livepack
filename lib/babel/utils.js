/* --------------------
 * livepack module
 * Babel plugin util functions
 * ------------------*/

'use strict';

// Modules
const pathParse = require('path').parse,
	t = require('@babel/types');

// Imports
const {
		SCOPE_ID_VAR_NODE, BLOCK_ID, BLOCK_NAME, FUNCTION_PROPS, IS_INTERNAL, IS_EVAL_CODE
	} = require('./symbols.js'),
	{TRACKER_COMMENT_PREFIX, TEMP_COMMENT_PREFIX} = require('../shared/constants.js'),
	assertBug = require('../shared/assertBug.js');

// Exports

module.exports = {
	recordVarUse,
	createTrackerComment,
	enterBlock,
	createBlockId,
	initScope,
	tagTempVarWithType,
	internalIdentifier,
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
 * @param {Object} state - Babel state object for file
 * @returns {Array<Object>} - Array of scope objects
 */
function recordVarUse(name, functionPath, bindingBlockPath, isConst, state) {
	// Init scope on statement block which includes var definition
	const blockId = bindingBlockPath[BLOCK_ID];
	let scopeIdVarNode = bindingBlockPath[SCOPE_ID_VAR_NODE];
	if (!scopeIdVarNode) scopeIdVarNode = initScope(bindingBlockPath, blockId, state);

	// Record var use on all functions above
	const scopes = [];
	do {
		// Record var use in function props
		const fnScopes = functionPath[FUNCTION_PROPS].scopes;
		let scope = fnScopes.get(blockId);
		if (!scope) {
			const blockName = bindingBlockPath[BLOCK_NAME];
			scope = {
				blockId,
				scopeIdVarNode,
				varNames: new Set(),
				constNames: new Set(),
				blockName,
				argNames: undefined
			};
			fnScopes.set(blockId, scope);
		}
		scope.varNames.add(name);
		if (isConst) scope.constNames.add(name);

		scopes.push(scope);

		functionPath = functionPath.findParent(path => path.isFunction() || path === bindingBlockPath);
	} while (functionPath && functionPath !== bindingBlockPath);

	// Return array of scopes (used in `processArguments()`)
	return scopes;
}

/**
 * Create tracker comment.
 * @param {number} id - Block ID
 * @param {Array<object>} scopes - Array of scopes
 * @param {boolean} isStrict - `true` if is strict mode
 * @param {boolean} isMethod - `true` if is method
 * @param {boolean} isProtoMethod - `true` if is class prototype method
 * @param {string|undefined} superVarName - Var name referred to by `super`
 * @param {boolean} superIsTemp - `true` if super var is temp (should be substituted with `super`)
 * @param {Object} state - Babel state object for file
 * @returns {Object} - Tracker comment node
 */
function createTrackerComment(
	id, scopes, isStrict, isMethod, isProtoMethod, superVarName, superIsTemp, state
) {
	// eslint-disable-next-line max-len
	// `/*livepack_track:{"id":3,"scopes":[{"blockId":1,"varNames":["a"],"constNames":["a"],"blockName":"index"},{"blockId":2,"varNames":["b", "arguments"],"constNames":["arguments"],"blockName":"outer",argNames:["b"]}],"filename":"/path/to/file.js","isMethod":true,"superVarName":"b"}*/`
	const {filename} = state.file.opts;
	const substituteSuper = superIsTemp ? superVarName : undefined;
	const propsStr = JSON.stringify({
		id,
		scopes: scopes.map(({blockId, varNames, constNames, blockName, argNames}) => ({
			blockId,
			varNames: [...varNames].map(varName => (varName === substituteSuper ? 'super' : varName)),
			...(constNames.size > 0 ? {constNames: [...constNames]} : null),
			...(blockName ? {blockName} : null),
			...(argNames ? {argNames} : null)
		})),
		...(filename ? {filename} : null),
		...(isStrict ? {isStrict: true} : null),
		...(isMethod ? {[isProtoMethod ? 'isProtoMethod' : 'isMethod']: true} : null),
		...(superVarName && !superIsTemp ? {superVarName} : null),
		...(state[IS_EVAL_CODE] ? {isEval: true} : null)
	});

	return {
		type: 'CommentBlock',
		value: `${TRACKER_COMMENT_PREFIX}${propsStr}`
	};
}

/**
 * Set unique block ID on path.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {Object} state - Babel state object for file
 * @returns {number} - Block ID
 */
function enterBlock(blockPath, state) {
	const blockId = createBlockId(state);
	blockPath[BLOCK_ID] = blockId;
	return blockId;
}

/**
 * Create unique block ID.
 * @param {Object} state - Babel state object for file
 * @returns {number} - Block ID
 */
function createBlockId(state) {
	return state[BLOCK_ID]++;
}

/**
 * Init scope on statement block.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {number} blockId - Block ID
 * @param {Object} state - Babel state object for file
 * @returns {Object} - `scopeId` var node (named e.g. 'scopeId_100')
 */
function initScope(blockPath, blockId, state) {
	// Create scopeId var node + record on path
	const scopeIdVarNode = createScopeIdVarNode(blockId, state);
	blockPath[SCOPE_ID_VAR_NODE] = scopeIdVarNode;

	// Get block name and record on path
	let blockName;
	const parentBindingPath = blockPath.parentPath;
	if (!parentBindingPath) {
		const {filename} = state.file.opts;
		if (filename) blockName = pathParse(filename).name;
	} else if (parentBindingPath.isFunction()) {
		const idNode = parentBindingPath.node.id;
		if (idNode) blockName = idNode.name;
	}
	blockPath[BLOCK_NAME] = blockName;

	return scopeIdVarNode;
}

function tagTempVarWithType(node, type) {
	node.leadingComments = [{
		type: 'CommentBlock',
		value: `${TEMP_COMMENT_PREFIX}${type}`
	}];
}

/**
 * Create identifier node, flagged as internal.
 * Flag prevents identifier visitor acting on identifiers which livepack has created.
 * @param {string} name - Identifier name
 * @returns {Object} - AST Node object
 */
function internalIdentifier(name) {
	const node = t.identifier(name);
	node[IS_INTERNAL] = true;
	return node;
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
 * @param {Object} state - Babel state object
 * @param {string} message - Error message
 * @throws {Error} - If assertion fails
 * @returns {undefined}
 */
function assertWithLocation(condition, nodeOrPath, state, message) {
	assertBug(condition, message, () => {
		const {filename} = state.file.opts;
		const node = nodeOrPath.node || nodeOrPath;
		const {start} = node.loc || {start: {line: '?', column: '?'}};
		return `Location: ${filename ? `${filename}:` : ''}${start.line}:${start.column}`;
	});
}
