/* --------------------
 * livepack module
 * Code instrumentation visitor for functions
 * ------------------*/

'use strict';

// Export
module.exports = {
	ArrowFunctionExpression,
	FunctionDeclaration,
	FunctionExpression,
	createAndEnterFunctionOrClassNameBlock,
	visitFunctionOrMethod,
	visitFunctionParams,
	visitFunctionBody,
	removeUnnecessaryUseStrictDirectives,
	createFunction,
	getFunctionType,
	escapeFilename,
	withStrictModeState,
	hoistSloppyFunctionDeclarations,
	createTrackerCall,
	insertTrackerComment,
	createFunctionInfoFunction
};

// Modules
const t = require('@babel/types');

// Imports
const Statement = require('./statement.js'),
	Expression = require('./expression.js'),
	{IdentifierLet, AssigneeLet} = require('./assignee.js'),
	{visitKey, visitKeyContainer} = require('../visit.js'),
	{
		createBlock, createAndEnterBlock, createBinding, createThisBinding, createArgumentsBinding,
		createNewTargetBinding, getOrCreateExternalVar
	} = require('../blocks.js'),
	{insertTrackerCodeIntoFunction} = require('../tracking.js'),
	{createFnInfoVarNode} = require('../internalVars.js'),
	{insertComment, hasUseStrictDirective, stringLiteralWithSingleQuotes} = require('../utils.js'),
	{combineArraysWithDedup} = require('../../shared/functions.js'),
	{
		FN_TYPE_FUNCTION, FN_TYPE_ASYNC_FUNCTION, FN_TYPE_GENERATOR_FUNCTION,
		FN_TYPE_ASYNC_GENERATOR_FUNCTION, TRACKER_COMMENT_PREFIX,
		CONST_VIOLATION_NEEDS_VAR, CONST_VIOLATION_NEEDS_NO_VAR
	} = require('../../shared/constants.js');

// Exports

/**
 * Visitor for arrow function.
 * @param {Object} node - Arrow function AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function ArrowFunctionExpression(node, state, parent, key) {
	// Tracker comment is inserted later to avoid it getting relocated if function has complex params
	// which are later relocated to inside function body
	visitFunction(node, parent, key, undefined, false, node.body.type === 'BlockStatement', state);
}

/**
 * Visitor for function declaration.
 * @param {Object} node - Function declaration AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function FunctionDeclaration(node, state, parent, key) {
	// Visit function
	const fnName = node.id.name;
	const fn = visitFunction(node, parent, key, fnName, true, true, state);

	// Create binding for function name
	// TODO: Whether the value of the function is hoisted depends on whether is a top level statement
	// (including in a labeled statement)
	// `() => { console.log(typeof x); function x() {} }` -> Logs 'function'
	// `() => { console.log(typeof x); q: function x() {} }` -> Logs 'function'
	// `() => { console.log(typeof x); if (true) function x() {} }` -> Logs 'undefined'
	const {currentBlock: block, currentHoistBlock: hoistBlock} = state;
	let binding = block.bindings.get(fnName);
	if (!binding) {
		const isTopLevel = block === hoistBlock;
		binding = createBinding(block, fnName, {isVar: isTopLevel, isFrozenName: true}, state);
		state.currentFunction?.reservedVarNames.add(fnName);

		// If is a sloppy-mode function declaration which may need to be hoisted, record that.
		// Determine whether to hoist after 1st pass is complete, once all other bindings created.
		if (!isTopLevel && !state.isStrict && !node.async && !node.generator) {
			state.sloppyFunctionDeclarations.push({
				varName: fnName,
				binding,
				block,
				hoistBlock,
				parentFn: state.currentFunction
			});
		}
	} else if (!binding.isFrozenName) {
		// Existing binding is a `var` declaration.
		// Flag binding as frozen so `var` declarations' identifiers don't get renamed.
		binding.isFrozenName = true;
		binding.trails.length = 0;
	}

	// Insert tracker comment
	insertFunctionDeclarationOrExpressionTrackerComment(fn, node, state);
}

/**
 * Visitor for function expression.
 * @param {Object} node - Function expression AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function FunctionExpression(node, state, parent, key) {
	// If not anonymous, create and enter name block
	let nameBlock, fnName;
	const idNode = node.id;
	if (idNode) {
		fnName = idNode.name;
		nameBlock = createAndEnterFunctionOrClassNameBlock(fnName, true, state);
	}

	// Visit function
	const fn = visitFunction(node, parent, key, fnName, true, true, state);

	if (nameBlock) {
		// Exit name block
		state.currentBlock = nameBlock.parent;

		// If contains `eval()`, change function ID to make name block be considered internal to function.
		// An external var representing the function is pointless as its name will be frozen anyway
		// due to being in scope of the `eval()`.
		if (fn.containsEval) fn.id = nameBlock.id;
	}

	// Insert tracker comment
	insertFunctionDeclarationOrExpressionTrackerComment(fn, node, state);
}

/**
 * Create block for function/class name accessed within the function/class.
 * @param {string} fnName - Function name
 * @param {boolean} isSilentConst - `true` if assignment to function name silently fails in sloppy mode
 * @param {Object} state - State object
 * @returns {Object} - Block object
 */
function createAndEnterFunctionOrClassNameBlock(fnName, isSilentConst, state) {
	const block = createAndEnterBlock(fnName, false, state);
	createBinding(block, fnName, {isConst: true, isSilentConst, isFrozenName: true}, state);
	state.currentFunction?.reservedVarNames.add(fnName);
	return block;
}

/**
 * Visit function declaration, function expression or arrow function.
 * @param {Object} node - Function declaration, function expression or arrow function AST node
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {string} [fnName] - Function name (`undefined` if unnamed)
 * @param {boolean} isFullFunction - `true` if is not arrow function
 * @param {boolean} hasBodyBlock - `true` if has body block (only arrow functions can not)
 * @param {Object} state - State object
 * @returns {Object} - Function object
 */
function visitFunction(node, parent, key, fnName, isFullFunction, hasBodyBlock, state) {
	return withStrictModeState(
		node, hasBodyBlock, state,
		(isStrict, isEnteringStrict) => visitFunctionOrMethod(
			node, parent, key, fnName, isStrict, isEnteringStrict, isFullFunction, hasBodyBlock, state
		)
	);
}

/**
 * Visit function or method.
 * @param {Object} fnNode - Function declaration, function expression, arrow function,
 *   class method, class private method or object method AST node
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {string} [fnName] - Function name (`undefined` if unnamed)
 * @param {boolean} isStrict - `true` if function is strict mode
 * @param {boolean} isEnteringStrict - `true` if function is strict mode and parent is sloppy mode
 * @param {boolean} isFullFunction - `true` if is not arrow function
 * @param {boolean} hasBodyBlock - `true` if has body block (only arrow functions can not)
 * @param {Object} state - State object
 * @returns {Object} - Function object
 */
function visitFunctionOrMethod(
	fnNode, parent, key, fnName, isStrict, isEnteringStrict, isFullFunction, hasBodyBlock, state
) {
	// Create params block. If is full function, create bindings for `this` + `new.target`.
	const paramsBlock = createAndEnterBlock(fnName, false, state);
	let parentThisBlock;
	if (isFullFunction) {
		createThisBinding(paramsBlock);
		createNewTargetBinding(paramsBlock);
		parentThisBlock = state.currentThisBlock;
		state.currentThisBlock = paramsBlock;
	}

	// Create and enter function
	const fn = createFunction(paramsBlock.id, fnNode, isStrict, state);
	state.currentFunction = fn;
	const parentTrail = state.trail;
	state.trail = [];

	// Create body block or make params block a vars block
	let bodyBlock;
	if (hasBodyBlock) {
		bodyBlock = createBlock(fnName, true, state);
		paramsBlock.varsBlock = bodyBlock;
	} else {
		paramsBlock.varsBlock = paramsBlock;
	}

	// Visit params
	const argNames = visitFunctionParams(fn, fnNode, paramsBlock, bodyBlock, isStrict, state);

	// If is full function, create binding for `arguments` in params block.
	// Param called `arguments` takes precedence.
	if (isFullFunction && !paramsBlock.bindings.has('arguments')) {
		createArgumentsBinding(paramsBlock, isStrict, argNames);
	}

	// Visit body
	if (bodyBlock) {
		visitFunctionBody(fnNode, bodyBlock, state);
	} else {
		visitKey(fnNode, 'body', Expression, state);
	}

	// Serialize AST
	fn.astJson = serializeFunctionAst(fnNode, hasBodyBlock, isStrict, isEnteringStrict);

	// Exit function
	state.currentBlock = paramsBlock.parent;
	if (isFullFunction) state.currentThisBlock = parentThisBlock;
	state.currentFunction = fn.parent;
	state.trail = parentTrail;

	// Temporarily remove from AST so is not included in parent function's serialized AST
	parent[key] = null;

	// Queue instrumentation of function in 2nd pass
	state.secondPass(instrumentFunction, fnNode, fn, parent, key, paramsBlock, bodyBlock, state);

	return fn;
}

/**
 * Visit function params.
 * Caller must ensure `state.currentBlock` is params block,
 * and `state.currentThisBlock` is params block if is a full function.
 * Caller must set `state.currentBlock` and `state.currentThisBlock` back afterwards.
 * @param {Object} fn - Function object
 * @param {Object} fnNode - Function/method AST node
 * @param {Object} paramsBlock - Block object for function params
 * @param {Object} [bodyBlock] - Block object for body block, if function's body is a statement block
 * @param {boolean} isStrict - `true` if function is strict mode
 * @param {Object} state - State object
 * @returns {Array<string>} - Array of argument names which are linked to argument vars.
 *   Will be empty array if strict mode, or arguments are not all simple identifiers.
 */
function visitFunctionParams(fn, fnNode, paramsBlock, bodyBlock, isStrict, state) {
	// Visit params and find first complex param (i.e. param which is not just an identifier).
	// Do not consider `...x` to be complex.
	// Also get array of params which are linked to `arguments`.
	// i.e. `((x) => { arguments[0] = 2; return x; })(1) === 2`
	// `arguments` is only linked in sloppy mode functions with no complex params.
	const argNames = [];
	let hasLinkedArguments = !isStrict,
		firstComplexParamIndex;
	visitKeyContainer(fnNode, 'params', (paramNode, _state, paramNodes, index) => {
		if (paramNode.type === 'Identifier') {
			if (hasLinkedArguments) argNames.push(paramNode.name);
			IdentifierLet(paramNode, state, paramNodes, index);
		} else {
			if (firstComplexParamIndex === undefined) {
				hasLinkedArguments = false;
				argNames.length = 0;
				if (paramNode.type !== 'RestElement' || paramNode.argument.type !== 'Identifier') {
					firstComplexParamIndex = index;

					// Make params block the vars block. Tracker call and scope ID var will go in params.
					if (bodyBlock) paramsBlock.varsBlock = bodyBlock.varsBlock = paramsBlock;
				}
			}

			AssigneeLet(paramNode, state, paramNodes, index);
		}
	}, state);

	// Record index of first complex param
	fn.firstComplexParamIndex = firstComplexParamIndex;

	// Return array of params which are linked to `arguments`
	return argNames;
}

/**
 * Visit function body of a function with a statement block as body.
 * Creates and enters a block for function body.
 * Caller must set `state.currentBlock` back afterwards.
 * @param {Object} fnNode - Function/method AST node
 * @param {Object} bodyBlock - Block object for body block
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitFunctionBody(fnNode, bodyBlock, state) {
	state.currentBlock = bodyBlock;
	const parentHoistBlock = state.currentHoistBlock;
	state.currentHoistBlock = bodyBlock;
	visitKey(fnNode, 'body', FunctionBodyBlock, state);
	state.currentHoistBlock = parentHoistBlock;
}

/**
 * Visitor for function body block.
 * @param {Object} node - Function body block AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function FunctionBodyBlock(node, state) {
	visitKeyContainer(node, 'body', Statement, state);
}

/**
 * Serialize function AST to JSON.
 * Remove unnecessary 'use strict' directives if present.
 * Do not mutate the node passed in, to ensure these changes only affect the serialized AST,
 * and not the instrumented output.
 * @param {Object} fnNode - Function AST node
 * @param {boolean} hasBodyBlock - `true` if has body block (only arrow functions can not)
 * @param {boolean} isStrict - `true` if function is strict mode
 * @param {boolean} isEnteringStrict - `true` if function transitions into strict mode
 *   (and therefore needs to retain a 'use strict' directive)
 * @returns {string} - Function AST as JSON
 */
function serializeFunctionAst(fnNode, hasBodyBlock, isStrict, isEnteringStrict) {
	// Remove unnecessary 'use strict' directives
	if (hasBodyBlock && isStrict) {
		const alteredFnNode = removeUnnecessaryUseStrictDirectives(fnNode, !isEnteringStrict);
		if (alteredFnNode) fnNode = alteredFnNode;
	}

	// Stringify AST to JSON
	return JSON.stringify(fnNode);
}

/**
 * Remove unnecessary 'use strict' directives from function body.
 * Relocate any comments from deleted directives.
 * Do not mutate input - clone if needs alteration.
 * Return `undefined` if no alteration necessary.
 * @param {Object} fnNode - Function AST node
 * @param {boolean} needsNoDirective - `true` if function already strict mode from outer environment
 * @returns {Object|undefined} - Altered function AST node, or `undefined` if no directives removed
 */
function removeUnnecessaryUseStrictDirectives(fnNode, needsNoDirective) {
	// If no directives, return `undefined`
	let bodyNode = fnNode.body;
	const directiveNodes = bodyNode.directives;
	if (directiveNodes.length === 0) return undefined;

	// Remove unnecessary directives
	const newDirectiveNodes = [],
		commentNodes = [];
	for (let directiveNode of directiveNodes) {
		if (directiveNode.value.value === 'use strict') {
			if (needsNoDirective) {
				commentNodes.push(
					...(directiveNode.leadingComments || []),
					...(directiveNode.trailingComments || [])
				);
				continue;
			}
			needsNoDirective = true;
		}

		// Add any comments removed from previous directives
		if (commentNodes.length !== 0) {
			directiveNode = {
				...directiveNode,
				leadingComments: combineArraysWithDedup(commentNodes, directiveNode.leadingComments)
			};
			commentNodes.length = 0;
		}

		newDirectiveNodes.push(directiveNode);
	}

	// If no directives need to be removed, return `undefined`
	if (newDirectiveNodes.length === directiveNodes.length) return undefined;

	// Clone function node
	bodyNode = {...bodyNode, directives: newDirectiveNodes};
	fnNode = {...fnNode, body: bodyNode};

	// Add any remaining comments to first statement / last directive / function body
	if (commentNodes.length !== 0) {
		let statementNodes = bodyNode.body;
		if (statementNodes.length !== 0) {
			statementNodes = bodyNode.body = [...statementNodes];
			const firstStatementNode = statementNodes[0];
			statementNodes[0] = {
				...firstStatementNode,
				leadingComments: combineArraysWithDedup(commentNodes, firstStatementNode.leadingComments)
			};
		} else if (newDirectiveNodes.length !== 0) {
			const lastDirectiveNode = newDirectiveNodes[newDirectiveNodes.length - 1];
			newDirectiveNodes[newDirectiveNodes.length - 1] = {
				...lastDirectiveNode,
				trailingComments: combineArraysWithDedup(lastDirectiveNode.trailingComments, commentNodes)
			};
		} else {
			bodyNode.innerComments = combineArraysWithDedup(bodyNode.innerComments, commentNodes);
		}
	}

	// Return clone of function node
	return fnNode;
}

/**
 * Create object representing function.
 * @param {number} id - Function ID
 * @param {Object} node - Function/method/class AST node
 * @param {boolean} isStrict - `true` if function is strict mode
 * @param {Object} state - State object
 * @returns {Object} - Function object
 */
function createFunction(id, node, isStrict, state) {
	const parentFunction = state.currentFunction;
	const fn = {
		id,
		node,
		astJson: undefined,
		isStrict,
		parent: parentFunction,
		children: [],
		trail: parentFunction ? [...state.trail] : undefined,
		bindings: [],
		externalVars: new Map(), // Keyed by block
		scopes: undefined,
		globalVarNames: new Set(),
		reservedVarNames: new Set(),
		amendments: [],
		superIsProto: false,
		containsEval: false,
		containsImport: false,
		hasSuperClass: false,
		firstComplexParamIndex: undefined
	};

	if (parentFunction) parentFunction.children.push(fn);

	state.functions.push(fn);
	state.fileContainsFunctionsOrEval = true;

	return fn;
}

/**
 * Get type code for function.
 * @param {Object} fnNode - Function AST node
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
 * Escape filename so it can be safely included in tracker comment.
 * @param {string} filename - File path
 * @returns {string} - Filename escaped
 */
function escapeFilename(filename) {
	// Encode filename as JSON to escape non-ascii chars.
	// Convert `*/` to `*\/` so does not terminate comment early.
	// `JSON.parse('"*\/"')` is `'*/'` so it needs no special unescaping.
	return JSON.stringify(filename).slice(1, -1).replace(/\*\//g, '*\\/');
}

/**
 * Determine if function is strict mode. If it is, set `state.isStrict` flag.
 * Call visitor with strict/sloppy mode flags.
 * @param {Object} fnNode - Function or method AST node
 * @param {boolean} hasBodyBlock - `true` if has body block (only arrow functions can not)
 * @param {Object} state - State object
 * @param {Function} visit - Visitor function
 * @returns {*} - Visitor function's return value
 */
function withStrictModeState(fnNode, hasBodyBlock, state, visit) {
	// Get if strict mode
	let {isStrict} = state,
		isEnteringStrict = false;
	if (!isStrict && hasBodyBlock && hasUseStrictDirective(fnNode.body)) {
		isStrict = isEnteringStrict = state.isStrict = true;
	}

	// Call visitor
	const res = visit(isStrict, isEnteringStrict);

	// If entered strict mode, exit it again
	if (isEnteringStrict) state.isStrict = false;

	// Return visitor's return value
	return res;
}

/**
 * Hoist sloppy function declarations if they can be hoisted.
 * Function declarations are hoisted to the top block in parent function body or program
 * if they are defined in sloppy mode (i.e. outside environment is sloppy mode, regardless of
 * whether function itself strict mode) and they are not async or generator functions.
 *
 * They can only be hoisted if:
 *   1. No `const`, `let` or class declaration with same name in block they'd be hoisted to.
 *   2. No parameter in parent function with same name.
 *   3. No other bindings in intermediate blocks
 *      (including other function declarations which are themselves hoisted)
 *
 * When a function declaration is hoisted, it produces two separate bindings:
 *   1. Binding in block where originally defined.
 *   2. Binding in block it's hoisted to.
 *
 * See https://github.com/babel/babel/pull/14203#issuecomment-1038187168
 *
 * @param {Object} state - State object
 * @returns {undefined}
 */
function hoistSloppyFunctionDeclarations(state) {
	for (const declaration of state.sloppyFunctionDeclarations) {
		hoistSloppyFunctionDeclaration(declaration);
	}
}

/**
 * Hoist function declaration, if it can be hoisted.
 * Should only be called for functions which:
 *   1. are not already in the top block in parent function / program
 *   2. are not async or generator functions
 *
 * @param {Object} declaration - Declaration object
 * @param {string} declaration.varName - Function name
 * @param {Object} declaration.binding - Binding object for binding in block where originally declared
 * @param {Object} declaration.block - Block object for block where originally declared
 * @param {Object} declaration.hoistBlock - Block object for block where could be hoisted to
 * @param {Object} [declaration.parentFn] - Function object for parent function
 * @returns {undefined}
 */
function hoistSloppyFunctionDeclaration(declaration) {
	const {varName, hoistBlock} = declaration;

	// Do not hoist if existing const, let or class declaration binding in hoist block
	const hoistBlockBinding = hoistBlock.bindings.get(varName);
	if (hoistBlockBinding && !hoistBlockBinding.isVar) return;

	// If parent function's params include var with same name, do not hoist.
	// NB: `hoistBlock.parent` here is either parent function params block or file block.
	// In CommonJS code, file block is CommonJS wrapper function's params, and in any other context
	// file block contains no bindings except `this`. So it's safe to treat as a params block in all cases.
	// NB: `paramsBlockBinding.argNames` check is to avoid the pseudo-param `arguments` blocking hoisting.
	const paramsBlockBinding = hoistBlock.parent.bindings.get(varName);
	if (paramsBlockBinding && !paramsBlockBinding.argNames) return;

	// If any binding in intermediate blocks, do not hoist.
	// NB: This includes function declarations which will be themselves hoisted.
	let inBetweenBlock = declaration.block.parent;
	while (inBetweenBlock !== hoistBlock) {
		if (inBetweenBlock.bindings.has(varName)) return;
		inBetweenBlock = inBetweenBlock.parent;
	}

	// Can be hoisted
	if (!hoistBlockBinding) {
		hoistBlock.bindings.set(varName, {...declaration.binding, isVar: true});
	} else if (!hoistBlockBinding.isFrozenName) {
		// Existing binding is a `var` declaration.
		// Flag binding as frozen so `var` declarations' identifiers don't get renamed.
		hoistBlockBinding.isFrozenName = true;
		hoistBlockBinding.trails.length = 0;
	}
}

/**
 * Instrument function.
 * @param {Object} node - Function or method AST node
 * @param {Object} fn - Function object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {Object} paramsBlock - Function's params block object
 * @param {Object} [bodyBlock] - Function's body block object (if it has one, arrow functions may not)
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentFunction(node, fn, parent, key, paramsBlock, bodyBlock, state) {
	// Restore to original place in AST
	parent[key] = node;

	// Insert tracker call and block vars (`livepack_scopeId` and `livepack_temp`) into function.
	// NB: `bodyBlock` here may actually be params block if is an arrow function with no body.
	const trackerNode = createTrackerCall(fn, state);
	insertTrackerCodeIntoFunction(fn, node, paramsBlock, bodyBlock, trackerNode, state);

	if (node.type === 'ArrowFunctionExpression') insertArrowFunctionTrackerComment(fn, node, state);
}

/**
 * Create tracker call.
 * Create scopes array, and copy external vars down to parent function.
 * @param {Object} fn - Function object
 * @param {Object} state - State object
 * @returns {Object} - AST node for tracker call
 */
function createTrackerCall(fn, state) {
	// Sort scopes in ascending order of block ID
	const scopes = [...fn.externalVars].map(([block, vars]) => ({block, vars}))
		.sort((scope1, scope2) => (scope1.block.id > scope2.block.id ? 1 : -1));
	fn.scopes = scopes;

	// Add external vars to parent function where external to that function too
	const parentFunction = fn.parent;
	if (parentFunction) {
		// External vars
		for (const {block, vars} of scopes) {
			if (block.id >= parentFunction.id) break;
			for (const [varName, {binding}] of vars) {
				getOrCreateExternalVar(parentFunction, block, varName, binding);
			}
		}
	}

	// `livepack_tracker(livepack_getFnInfo_3, () => [[livepack_scopeId_2, x]])`
	return t.callExpression(state.trackerVarNode, [
		createFnInfoVarNode(fn.id, state),
		t.arrowFunctionExpression([], t.arrayExpression(
			scopes.map(scope => t.arrayExpression([
				scope.block.varsBlock.scopeIdVarNode,
				...[...scope.vars.values()].map(blockVar => blockVar.binding.varNode)
			]))
		))
	]);
}

/**
 * Insert tracker comment into function declaration/expression.
 * @param {Object} fn - Function object
 * @param {Object} node - Function declaration or expression AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertFunctionDeclarationOrExpressionTrackerComment(fn, node, state) {
	// Insert tracker comment before identifier, or before 1st param or before function body
	const commentHolderNode = node.id || (node.params.length !== 0 ? node.params[0] : node.body);
	insertTrackerComment(fn.id, getFunctionType(node), commentHolderNode, 'leading', state);
}

/**
 * Insert tracker comment into arrow function.
 * @param {Object} fn - Function object
 * @param {Object} node - Arrow function AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertArrowFunctionTrackerComment(fn, node, state) {
	// Insert tracker comment before first param. If no params, before function body.
	const paramNodes = node.params;
	insertTrackerComment(
		fn.id, node.async ? FN_TYPE_ASYNC_FUNCTION : FN_TYPE_FUNCTION,
		paramNodes.length !== 0 ? paramNodes[0] : node.body, 'leading', state
	);
}

/**
 * Insert tracker comment.
 * @param {number} fnId - Function ID
 * @param {string} fnType - Function type
 * @param {Object} commentHolderNode - AST node to attach comment to
 * @param {string} commentType - 'leading' / 'inner' / 'trailing'
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertTrackerComment(fnId, fnType, commentHolderNode, commentType, state) {
	insertComment(
		commentHolderNode, commentType,
		`${TRACKER_COMMENT_PREFIX}${fnId};${fnType};${state.filenameEscaped}`
	);
}

/**
 * Create function info function containing function AST, details of internal and external vars etc.
 * @param {Object} fn - Function object
 * @param {Object} state - State object
 * @returns {Object} - AST node for function info function
 */
function createFunctionInfoFunction(fn, state) {
	// Compile internal vars and reserved var names
	const internalVars = Object.create(null),
		{reservedVarNames} = fn;
	for (const {name: varName, trails, isFrozenName} of fn.bindings) {
		if (isFrozenName) {
			reservedVarNames.add(varName);
		} else {
			const internalVar = internalVars[varName] || (internalVars[varName] = []);
			internalVar.push(...trails);
		}
	}

	// Compile amendments.
	// Reverse order so deepest are first.
	// Remove the need for an internal var if binding has frozen name.
	let amendments;
	if (fn.amendments.length > 0) {
		amendments = fn.amendments.map(({type, blockId, trail, binding}) => {
			if (type === CONST_VIOLATION_NEEDS_VAR && binding.isFrozenName) {
				type = CONST_VIOLATION_NEEDS_NO_VAR;
			}
			return [type, blockId, ...trail];
		}).reverse();
	}

	// Create JSON function info string
	const {children} = fn;
	let argNames;
	let json = JSON.stringify({
		scopes: fn.scopes.map(({block, vars}) => ({
			blockId: block.id,
			blockName: block.name,
			vars: Object.fromEntries([...vars].map(([varName, varProps]) => {
				if (varName === 'arguments') argNames = varProps.binding.argNames;
				return [
					varName,
					{
						isReadFrom: varProps.isReadFrom || undefined,
						isAssignedTo: varProps.isAssignedTo || undefined,
						isFrozenInternalName: varProps.binding.isFrozenName || undefined,
						trails: varProps.trails
					}
				];
			}))
		})),
		isStrict: fn.isStrict || undefined,
		superIsProto: fn.superIsProto || undefined,
		containsEval: fn.containsEval || undefined,
		containsImport: fn.containsImport || undefined,
		argNames,
		internalVars,
		reservedVarNames: reservedVarNames.size !== 0 ? [...reservedVarNames] : undefined,
		globalVarNames: fn.globalVarNames.size !== 0 ? [...fn.globalVarNames] : undefined,
		amendments,
		hasSuperClass: fn.hasSuperClass || undefined,
		childFns: children.map(childFn => childFn.trail)
	});

	// Add AST JSON to JSON
	json = `${json.slice(0, -1)},"ast":${fn.astJson}}`;

	// Create function returning JSON string and references to function info function for child fns.
	// Make output as single-quoted string for shorter output (not escaping every `"`).
	return t.functionDeclaration(createFnInfoVarNode(fn.id, state), [], t.blockStatement([
		t.returnStatement(t.arrayExpression([
			stringLiteralWithSingleQuotes(json),
			t.arrayExpression(children.map(childFn => createFnInfoVarNode(childFn.id, state))),
			state.getSourcesNode
		]))
	]));
}
