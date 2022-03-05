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
	visitFunctionParamsAndBody,
	removeUnnecessaryUseStrictDirectives,
	createFunction,
	getFunctionType,
	escapeFilename,
	withStrictModeState,
	hoistSloppyFunctionDeclarations,
	instrumentFunctionOrClassConstructor,
	insertTrackerComment
};

// Modules
const mapValues = require('lodash/mapValues'),
	t = require('@babel/types');

// Imports
const Statement = require('./statement.js'),
	Expression = require('./expression.js'),
	{IdentifierLet, AssigneeLet} = require('./assignee.js'),
	{isInFunctionWithComplexParams, moveComplexParamsIntoFunctionBody} = require('./params.js'),
	{visitKey, visitKeyContainer} = require('../visit.js'),
	{
		createBlock, createAndEnterBlock, createBinding, createThisBinding, createArgumentsBinding,
		getOrCreateExternalVar, insertBlockVars
	} = require('../blocks.js'),
	{createFnInfoVarNode, createTempVarNode} = require('../internalVars.js'),
	{
		insertComment, hasUseStrictDirective, stringLiteralWithSingleQuotes, copyLoc
	} = require('../utils.js'),
	{
		FN_TYPE_FUNCTION, FN_TYPE_ASYNC_FUNCTION, FN_TYPE_GENERATOR_FUNCTION,
		FN_TYPE_ASYNC_GENERATOR_FUNCTION, TRACKER_COMMENT_PREFIX
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
	// TODO Whether the value of the function is hoisted depends on whether is a top level statement
	// (including in a labeled statement)
	// `() => { console.log(typeof x); function x() {} }` -> Logs 'function'
	// `() => { console.log(typeof x); q: function x() {} }` -> Logs 'function'
	// `() => { console.log(typeof x); if (true) function x() {} }` -> Logs 'undefined'
	const {currentBlock: block, currentHoistBlock: hoistBlock} = state,
		isInHoistBlock = block === hoistBlock,
		isHoistable = !state.isStrict && !node.async && !node.generator;
	let binding = block.bindings[fnName];
	if (binding) {
		// Existing binding must be a `var` declaration or another function declaration
		if (isHoistable) binding.isHoistable = true;
		binding.isFunction = true;
	} else {
		binding = createBinding(block, fnName, {isVar: true, isHoistable, isFunction: true}, state);

		// If is a sloppy-mode function declaration which may need to be hoisted, record that.
		// Determine whether to hoist after 1st pass is complete, once all other bindings created.
		if (isHoistable && !isInHoistBlock) {
			state.sloppyFunctionDeclarations.push({varName: fnName, binding, block, hoistBlock});
		}
	}

	if ((isHoistable || isInHoistBlock) && isInFunctionWithComplexParams(state)) {
		state.secondPass(
			convertFunctionDeclarationToAssignmentIfNecessary,
			node, parent, key, fnName, state.currentFunction, block, isInHoistBlock, state
		);
	}

	// Insert tracker comment
	insertFunctionDeclarationOrExpressionTrackerComment(fn, node, state);
}

/**
 * Convert function declaration to assignment if parent function has complex params
 * and function is being hoisted, or would be hoisted once moved into a nested block.
 * @param {Object} node - Function declaration AST node
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {string} [fnName] - Function name (`undefined` if unnamed)
 * @param {Object} parentFunction - Parent function object
 * @param {Object} block - Block object for block function is declared in
 * @param {boolean} isInHoistBlock - `true` if function is declared in body of parent function or program
 * @param {Object} state - State object
 * @returns {undefined}
 */
function convertFunctionDeclarationToAssignmentIfNecessary(
	node, parent, key, fnName, parentFunction, block, isInHoistBlock, state
) {
	// Skip if does not need to be amended
	if (!block.bindings[fnName].isHoistable) return;

	// Value of the var created by function declaration is immediately initialized as the function
	// (i.e. the value of the var is hoisted, not just the binding) if the function declaration:
	// - is not nested in a block e.g. `() => { { function f() {} } }`
	// - is not nested within an `if` statement e.g. `() => { if (true) function f() {} }`
	// - there is not a `var` declaration with same name in parent function body
	//   *and* a var defined in parent function's params e.g. `f => { var f; function f() {} }`
	// TODO The last condition is not handled at present.
	// It is legal for a function declaration to be prefixed with 1 or more labels and this does
	// not prevent the var's value being immediately initialized.

	// Convert to anonymous function expression assigned to var.
	// Removing function name ensures `f` within function still refers to outer scope `f`.
	// `function f() {}` -> `f = function() {}`
	node.type = 'FunctionExpression';
	let replacementNode = copyLoc(t.expressionStatement(t.assignmentExpression('=', node.id, node)), node);
	node.id = null;

	// TODO This is wrong. Functions are always hoisted to the top of the block they're in,
	// regardless of whether it's the hoist block or not.
	if (isInHoistBlock) {
		// Value of var will be hoisted.
		// Wrap function declaration in a temp wrapper declaration. This wrapper function
		// is then called at start of parent function body to hoist the nested function declaration.
		// `function f() {}` -> `function livepack_temp3() { f = function() {} }`
		const wrapperVarNode = createTempVarNode(state);
		replacementNode = t.functionDeclaration(wrapperVarNode, [], t.blockStatement([replacementNode]));
		parentFunction.hoistFunctionCallNodes.push(
			t.expressionStatement(t.callExpression(wrapperVarNode, []))
		);
	}

	parent[key] = replacementNode;
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
	createBinding(block, fnName, {isConst: true, isSilentConst, isFunction: true}, state);
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
	// Create params block. If is full function, create binding for `this`.
	const paramsBlock = createAndEnterBlock(fnName, false, state);
	let parentThisBlock;
	if (isFullFunction) {
		createThisBinding(paramsBlock);
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

	// Visit params + body
	const argNames = visitFunctionParamsAndBody(fn, fnNode, bodyBlock, isStrict, state);

	// If is full function, create binding for `arguments` in params block.
	// Param called `arguments` takes precedence.
	if (isFullFunction) {
		if (!paramsBlock.bindings.arguments) createArgumentsBinding(paramsBlock, isStrict, argNames);
		state.currentThisBlock = parentThisBlock;
	}

	// Serialize AST
	const astJson = serializeFunctionAst(fnNode, hasBodyBlock, isStrict, isEnteringStrict);

	// Exit function
	state.currentBlock = paramsBlock.parent;
	state.currentFunction = fn.parent;
	state.trail = parentTrail;

	// Temporarily remove from AST so is not included in parent function's serialized AST
	parent[key] = null;

	// Queue instrumentation of function in 2nd pass
	state.secondPass(
		instrumentFunction, fnNode, fn, parent, key, astJson, paramsBlock, hasBodyBlock, state
	);

	return fn;
}

/**
 * Visit function params and body.
 * Caller must ensure `state.currentBlock` is params block,
 * and `state.currentThisBlock` is params block if is a full function.
 * Caller must set `state.currentBlock` and `state.currentThisBlock` back afterwards.
 * @param {Object} fn - Function object
 * @param {Object} fnNode - Function/method AST node
 * @param {Object} [bodyBlock] - Block object for body block, if function's body is a statement block
 * @param {boolean} isStrict - `true` if function is strict mode
 * @param {Object} state - State object
 * @returns {Array<string>} - Array of argument names which are linked to argument vars.
 *   Will be empty array if strict mode, or arguments are not all simple identifiers.
 */
function visitFunctionParamsAndBody(fn, fnNode, bodyBlock, isStrict, state) {
	// Visit params and find first complex param (i.e. param which is not just an identifier).
	// Do not consider `...x` to be complex.
	const argNames = [];
	let hasLinkedArguments = !isStrict,
		complexParamIndex;
	visitKeyContainer(fnNode, 'params', (paramNode, _state, paramNodes, index) => {
		if (paramNode.type === 'Identifier') {
			if (hasLinkedArguments) argNames.push(paramNode.name);
			IdentifierLet(paramNode, state, paramNodes, index);
		} else {
			if (complexParamIndex === undefined) {
				hasLinkedArguments = false;
				argNames.length = 0;
				if (paramNode.type !== 'RestElement' || paramNode.argument.type !== 'Identifier') {
					complexParamIndex = index;
				}
			}
			AssigneeLet(paramNode, state, paramNodes, index);
		}
	}, state);

	// Record index of first complex param
	if (complexParamIndex !== undefined) {
		fn.complexParamIndex = complexParamIndex;
		fn.hoistFunctionCallNodes = [];
	}

	// Visit body
	if (bodyBlock) {
		state.currentBlock = bodyBlock;
		const parentHoistBlock = state.currentHoistBlock;
		state.currentHoistBlock = bodyBlock;
		visitKey(fnNode, 'body', FunctionBodyBlock, state);
		state.currentHoistBlock = parentHoistBlock;
	} else {
		visitKey(fnNode, 'body', Expression, state);
	}

	// Return argNames
	return argNames;
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
 * Do not mutate input - clone if needs alteration.
 * Return `undefined` if no alteration necessary.
 * @param {Object} fnNode - Function AST node
 * @param {boolean} needsNoDirective - `true` if function already strict mode from outer environment
 * @returns {Object|undefined} - Altered function AST node, or `undefined` if no directives removed
 */
function removeUnnecessaryUseStrictDirectives(fnNode, needsNoDirective) {
	const bodyNode = fnNode.body,
		directiveNodes = bodyNode.directives;
	if (directiveNodes.length === 0) return undefined;

	const newDirectiveNodes = directiveNodes.filter((directiveNode) => {
		if (directiveNode.value.value === 'use strict') {
			if (needsNoDirective) return false;
			needsNoDirective = true;
		}
		return true;
	});

	// If no directives need to be removed, return `undefined`
	if (newDirectiveNodes.length === directiveNodes.length) return undefined;

	// Return clone of function node
	return {...fnNode, body: {...bodyNode, directives: newDirectiveNodes}};
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
		isStrict,
		parent: parentFunction,
		children: [],
		trail: parentFunction ? [...state.trail] : undefined,
		internalVars: Object.create(null), // Keyed by var name
		externalVars: new Map(), // Keyed by block
		globalVarNames: new Set(),
		amendments: [],
		superIsProto: false,
		containsEval: false,
		containsImport: false,
		hasSuperClass: false,
		firstSuperStatementIndex: undefined,
		returnsSuper: false,
		complexParamIndex: undefined,
		hoistFunctionCallNodes: undefined
	};

	if (parentFunction) parentFunction.children.push(fn);

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
		const isHoisted = hoistSloppyFunctionDeclaration(declaration);
		if (!isHoisted) declaration.binding.isHoistable = false;
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
 * @returns {boolean} - `true` if function is hoisted
 */
function hoistSloppyFunctionDeclaration(declaration) {
	const {varName, hoistBlock} = declaration;

	// Do not hoist if existing const, let or class declaration binding in hoist block
	const hoistBlockBinding = hoistBlock.bindings[varName];
	if (hoistBlockBinding && !hoistBlockBinding.isVar) return false;

	// If parent function's params include var with same name, do not hoist.
	// NB `hoistBlock.parent` here is either parent function params block or file block.
	// In CommonJS code, file block is CommonJS wrapper function's params, and in any other context
	// file block contains no bindings except `this`. So it's safe to treat as a params block in all cases.
	// NB `paramsBlockBinding.argNames` check is to avoid the pseudo-param `arguments` blocking hoisting.
	const paramsBlockBinding = hoistBlock.parent.bindings[varName];
	if (paramsBlockBinding && !paramsBlockBinding.argNames) return false;

	// If any binding in intermediate blocks, do not hoist.
	// NB This includes function declarations which will be themselves hoisted.
	const originBlock = declaration.block;
	let thisBlock = originBlock.parent;
	while (thisBlock !== hoistBlock) {
		if (thisBlock.bindings[varName]) return false;
		thisBlock = thisBlock.parent;
	}

	// Can be hoisted
	if (hoistBlockBinding) {
		hoistBlockBinding.isHoistable = true;
		hoistBlockBinding.isFunction = true;
	} else {
		hoistBlock.bindings[varName] = declaration.binding;
	}
	return true;
}

/**
 * Instrument function.
 * @param {Object} node - Function or method AST node
 * @param {Object} fn - Function object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {string} astJson - JSON-stringified function AST
 * @param {Object} paramsBlock - Function's params block object
 * @param {boolean} hasBodyBlock - `true` if has body block (only arrow functions can not)
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentFunction(node, fn, parent, key, astJson, paramsBlock, hasBodyBlock, state) {
	// Restore to original place in AST
	parent[key] = node;

	// If body is not a block, convert it to one
	if (!hasBodyBlock) node.body = t.blockStatement([t.returnStatement(node.body)]);

	instrumentFunctionOrClassConstructor(node, fn, paramsBlock, paramsBlock.varsBlock, astJson, state);

	if (node.type === 'ArrowFunctionExpression') insertArrowFunctionTrackerComment(fn, node, state);
}

/**
 * Instrument function, method or class constructor.
 *   - Insert `livepack_tracker()` call in function body.
 *   - Insert block vars (`livepack_scopeId`, `livepack_temp`) in function body.
 *   - Create function info function containing function AST, details of internal and external vars etc.
 *
 * @param {Object} node - Function, method, or class constructor AST node
 * @param {Object} fn - Function object
 * @param {Object} paramsBlock - Function's params block object
 * @param {Object} bodyBlock - Function's body block object
 * @param {string} astJson - JSON-stringified function/class AST
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentFunctionOrClassConstructor(node, fn, paramsBlock, bodyBlock, astJson, state) {
	// NB `bodyBlock` here may actually be params block if is an arrow function with no body
	// Sort scopes in ascending order of block ID
	const scopes = [...fn.externalVars].map(([block, vars]) => ({block, vars}))
		.sort((scope1, scope2) => (scope1.block.id > scope2.block.id ? 1 : -1));

	// Add external vars to parent function where external to that function too
	const parentFunction = fn.parent;
	if (parentFunction) {
		// External vars
		const {id: parentFunctionId, externalVars: parentExternalVars} = parentFunction;
		for (const {block, vars} of scopes) {
			if (block.id >= parentFunctionId) break;
			for (const varName in vars) {
				getOrCreateExternalVar(parentExternalVars, block, varName, vars[varName]);
			}
		}
	}

	// Move complex params into function body
	const actualBodyBlock = bodyBlock === paramsBlock ? undefined : bodyBlock;
	moveComplexParamsIntoFunctionBody(fn, node, paramsBlock, actualBodyBlock, state);

	// Insert block vars (`livepack_scopeId` and `livepack_temp`)
	insertBlockVars(bodyBlock, node.body, state);

	// Insert tracker code at start of function body
	const fnInfoVarNode = createFnInfoVarNode(fn.id, state);
	insertTrackerCode(node, scopes, fnInfoVarNode, state);

	// Create function info function
	createFunctionInfoFunction(fn, scopes, astJson, fnInfoVarNode, state);
}

/**
 * Insert tracker call into function body.
 * @param {Object} node - Function or method AST node
 * @param {Array<Object>} scopes - Array of scope objects in ascending order of block ID
 * @param {Object} fnInfoVarNode - Function info function identifier AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertTrackerCode(node, scopes, fnInfoVarNode, state) {
	// `livepack_tracker(livepack_getFnInfo_3, () => [[livepack_scopeId_2, x]]);`
	node.body.body.unshift(
		t.expressionStatement(
			t.callExpression(state.trackerVarNode, [
				fnInfoVarNode,
				t.arrowFunctionExpression([], t.arrayExpression(
					scopes.map(scope => t.arrayExpression([
						scope.block.varsBlock.scopeIdVarNode,
						...Object.values(scope.vars).map(blockVar => blockVar.varNode)
					]))
				))
			])
		)
	);
}

/**
 * Insert tracker comment into function declaration/expression.
 * @param {Object} fn - Function object
 * @param {Object} node - Function declaration or expression AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertFunctionDeclarationOrExpressionTrackerComment(fn, node, state) {
	// Insert tracker comment after `function` keyword
	insertTrackerComment(fn.id, getFunctionType(node), node, 'inner', state);
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
 * Add to `state.functionInfoNodes`. It will be inserted into file at end of 2nd pass.
 * @param {Object} fn - Function object
 * @param {Array<Object>} scopes - Array of scope objects in ascending order of block ID
 * @param {string} astJson - JSON-stringified function AST
 * @param {Object} fnInfoVarNode - Function info function identifier AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function createFunctionInfoFunction(fn, scopes, astJson, fnInfoVarNode, state) {
	// Create JSON function info string
	const {children} = fn;
	let argNames;
	let json = JSON.stringify({
		scopes: scopes.map(({block, vars}) => ({
			blockId: block.id,
			blockName: block.name,
			vars: mapValues(vars, (varProps, varName) => {
				if (varName === 'arguments') argNames = varProps.argNames;
				return {
					isReadFrom: varProps.isReadFrom || undefined,
					isAssignedTo: varProps.isAssignedTo || undefined,
					isFunction: varProps.isFunction || undefined,
					trails: varProps.trails
				};
			})
		})),
		isStrict: fn.isStrict || undefined,
		superIsProto: fn.superIsProto || undefined,
		containsEval: fn.containsEval || undefined,
		containsImport: fn.containsImport || undefined,
		argNames,
		internalVars: fn.internalVars,
		globalVarNames: fn.globalVarNames.size !== 0 ? [...fn.globalVarNames] : undefined,
		amendments: fn.amendments.length !== 0
			? fn.amendments.map(({type, blockId, trail}) => [type, blockId, ...trail]).reverse()
			: undefined,
		hasSuperClass: fn.hasSuperClass || undefined,
		firstSuperStatementIndex: fn.firstSuperStatementIndex,
		returnsSuper: fn.returnsSuper || undefined,
		childFns: children.map(childFn => childFn.trail)
	});

	// Add AST JSON to JSON
	json = `${json.slice(0, -1)},"ast":${astJson}}`;

	// Create function returning JSON string and references to function info function for child fns.
	// Make output as single-quoted string for shorter output (not escaping every `"`).
	state.functionInfoNodes.push(
		t.functionDeclaration(fnInfoVarNode, [], t.blockStatement([
			t.returnStatement(t.arrayExpression([
				stringLiteralWithSingleQuotes(json),
				t.arrayExpression(children.map(childFn => createFnInfoVarNode(childFn.id, state))),
				state.getSourcesNode
			]))
		]))
	);
}
