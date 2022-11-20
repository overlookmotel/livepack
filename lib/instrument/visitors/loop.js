/* --------------------
 * livepack module
 * Code instrumentation visitor for `for` / `while` statements
 * ------------------*/

'use strict';

// Export

module.exports = {
	ForStatement,
	ForXStatement,
	WhileStatement,
	DoWhileStatement
};

// Modules
const t = require('@babel/types');

// Import
const Statement = require('./statement.js'),
	Expression = require('./expression.js'),
	VariableDeclaration = require('./variableDeclaration.js'),
	{AssigneeAssignOnly} = require('./assignee.js'),
	{createBlock, createAndEnterBlock, createBindingWithoutNameCheck} = require('../blocks.js'),
	{insertBlockVarsIntoBlockStatement} = require('../tracking.js'),
	{visitKey, visitKeyMaybe, visitKeyContainer} = require('../visit.js'),
	{createTempVarNode} = require('../internalVars.js');

// Exports

/**
 * Visitor for `for` statement.
 * @param {Object} node - `for` statement AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function ForStatement(node, state) {
	// Create blocks for init clause and body.
	// NB Init block is required even if no `const` / `let` declaration,
	// if initializer contains a class/object expression with method using `super`.
	// TODO Add scope ID var and temp vars to init `const` / `let` initializer, rather than in block
	// TODO Actually it's more complicated than this:
	// e.g. `for (let i = 0, getI = () => i; i < 3; i++) {}`
	// Initial vars declaration is only evaluated once, and `getI()` returns `0` in every turn of the loop,
	// whereas `i` evaluates to a different value of `i` in each turn of loop.
	// So `i` within the var declaration and `i` within the test + update clauses and body
	// are essentially separate vars.
	const initBlock = createAndEnterBlock('for', false, state);
	const bodyBlock = createBlock('for', true, state);
	initBlock.varsBlock = bodyBlock;

	visitKeyMaybe(node, 'init', ForInitializer, state);
	visitKeyMaybe(node, 'test', Expression, state);
	visitKeyMaybe(node, 'update', Expression, state);

	state.currentBlock = bodyBlock;
	visitKey(node, 'body', LoopBody, state);
	state.currentBlock = initBlock.parent;
}

/**
 * Visitor for `for` statement initializer.
 * @param {Object} node - `for` statement initializer AST node
 * @param {Object} state - State object
 * @param {Object} parent - `for` statement AST node
 * @returns {undefined}
 */
function ForInitializer(node, state, parent) {
	if (node.type === 'VariableDeclaration') {
		VariableDeclaration(node, state);
	} else {
		Expression(node, state, parent, 'init');
	}
}

/**
 * Visitor for `for in` or `for of` statement.
 * @param {Object} node - `for in` / `for of` statement AST node
 * @param {Object} state - State object
 * @param {Object} parent - `for` statement's parent AST node / array
 * @param {string} key - Key on parent for `for` statement AST node
 * @returns {undefined}
 */
function ForXStatement(node, state, parent, key) {
	// Create block for initializer clause (i.e. left side of `of` or `in`).
	// NB Init block is required even if no `const` / `let` declaration,
	// if initializer contains a class/object expression with method using `super`.
	const parentBlock = state.currentBlock;
	const initBlock = createAndEnterBlock('for', true, state);

	// Visit initializer. If `var` declaration in init clause, get var names declared.
	const numVarsBeforeInit = (node.left.type === 'VariableDeclaration' && node.left.kind === 'var')
		? Object.keys(state.currentHoistBlock.bindings).length
		: undefined;

	visitKey(node, 'left', ForXInitializer, state);

	const varDeclarationNames = numVarsBeforeInit !== undefined
		? Object.keys(state.currentHoistBlock.bindings).slice(numVarsBeforeInit)
		: undefined;

	// In 2nd pass, set vars block for init block to be body block if vars defined in init block
	// are not also used within functions in init block. Or vice-versa if they are.
	// eslint-disable-next-line no-use-before-define
	state.secondPass(setForXVarsBlock, node, initBlock, () => bodyBlock);

	// Create block for right-hand side (i.e. expression after `in` or `of`)
	// with all same bindings as init block. Accessing these vars from within right-hand side
	// is temporal dead zone violation.
	// https://github.com/overlookmotel/livepack/issues/323
	state.currentBlock = parentBlock;
	const initBindingNames = Object.keys(initBlock.bindings);
	if (initBindingNames.length !== 0) {
		const rightBlock = createAndEnterBlock('for', false, state);
		for (const varName of initBindingNames) {
			createBindingWithoutNameCheck(rightBlock, varName, {isConst: true});
		}
	}

	// Visit right-hand side
	visitKey(node, 'right', Expression, state);

	// Visit body
	state.currentBlock = initBlock;
	const bodyBlock = createAndEnterBlock('for', true, state);
	visitKey(node, 'body', LoopBody, state);
	state.currentBlock = parentBlock;

	// In 2nd pass, create scope ID var in init clause if required
	state.secondPass(instrumentForXStatement, node, initBlock, varDeclarationNames, parent, key, state);
}

/**
 * Visitor for `for in` / `for of` statement initializer.
 * @param {Object} node - `for in` / `for of` statement initializer AST node
 * @param {Object} state - State object
 * @param {Object} parent - `for in` /  `for of` statement AST node
 * @returns {undefined}
 */
function ForXInitializer(node, state, parent) {
	if (node.type === 'VariableDeclaration') {
		VariableDeclaration(node, state);
	} else {
		AssigneeAssignOnly(node, state, parent, 'left');
	}
}

/**
 * Visitor for `while` statement.
 * @param {Object} node - `while` statement AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function WhileStatement(node, state) {
	// Init block is required to hold scope ID and temp vars if test clause contains
	// a class/object expression with method using `super`
	// TODO Convert to a `for (...; ...; ...)` loop if init block is used for `super` temp vars
	const initBlock = createAndEnterBlock('while', false, state);
	const bodyBlock = createBlock('while', true, state);
	initBlock.varsBlock = bodyBlock;

	visitKey(node, 'test', Expression, state);

	state.currentBlock = bodyBlock;
	visitKey(node, 'body', LoopBody, state);
	state.currentBlock = initBlock.parent;
}

/**
 * Visitor for `do while` statement.
 * @param {Object} node - `do while` statement AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function DoWhileStatement(node, state) {
	// Init block is required to hold scope ID and temp vars if test clause contains
	// a class/object expression with method using `super`
	// TODO Convert to a `for (...; ...; ...)` loop if init block is used for `super` temp vars
	const initBlock = createAndEnterBlock('doWhile', false, state);
	const bodyBlock = createAndEnterBlock('doWhile', true, state);
	initBlock.varsBlock = bodyBlock;

	visitKey(node, 'body', LoopBody, state);

	state.currentBlock = initBlock;
	visitKey(node, 'test', Expression, state);
	state.currentBlock = initBlock.parent;
}

/**
 * Visitor for `for` / `for in` / `for of` / `while` / `do while` statement body.
 * @param {Object} node - Loop statement body AST node
 * @param {Object} state - State object
 * @param {Object} statementNode - Loop statement AST node
 * @returns {undefined}
 */
function LoopBody(node, state, statementNode) {
	const hasBodyBlock = node.type === 'BlockStatement';
	if (hasBodyBlock) {
		visitKeyContainer(node, 'body', Statement, state);
	} else {
		Statement(node, state, statementNode, 'body');
	}

	state.secondPass(instrumentLoopBody, node, statementNode, state.currentBlock, hasBodyBlock, state);
}

/**
 * Called after init clause of `for of` / `for in` statement is instrumented in 2nd pass.
 * Sets vars block for init block and body block to same block. Which block is used depends
 * on whether vars defined in init clause are accessed by functions also defined in init clause.
 * If they are, the scope ID var needs to be in init clause (rare case).
 * If not, it can be defined inside body, which is simpler.
 *
 * @param {Object} node - `for of` / `for in` statement node (not needed but passed for debug reasons)
 * @param {Object} initBlock - Init block object
 * @param {Function} getBodyBlock - Function which returns body block object
 * @returns {undefined}
 */
function setForXVarsBlock(node, initBlock, getBodyBlock) {
	const bodyBlock = getBodyBlock();
	if (initBlock.scopeIdVarNode || initBlock.tempVarNodes) {
		bodyBlock.varsBlock = initBlock;
	} else {
		initBlock.varsBlock = bodyBlock;
	}
}

/**
 * Instrument loop body.
 * Convert body to statement block if needs scope ID or temp vars.
 * Insert block vars.
 * @param {Object} bodyNode - Loop statement body AST node
 * @param {Object} statementNode - Loop statement AST node
 * @param {Object} bodyBlock - Body block object
 * @param {boolean} hasBodyBlock - `true` if body is a statement block
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentLoopBody(bodyNode, statementNode, bodyBlock, hasBodyBlock, state) {
	if (!bodyBlock.scopeIdVarNode) return;

	// Convert body to block statement, so can have scope ID and temp vars added
	if (!hasBodyBlock) {
		bodyNode = t.blockStatement([bodyNode]);
		statementNode.body = bodyNode;
	}

	insertBlockVarsIntoBlockStatement(bodyBlock, bodyNode, state);
}

/**
 * Instrument `for ( ... of ... )` / `for ( ... in ... )` statements to define scope ID var
 * in initialization clause if required.
 *
 * In below examples, it's not required, but would be if `x` was replaced with e.g. `{x, fn = () => x}`.
 *
 * `for (const x of y) ;` ->
 * `for (const [livepack_scopeId, x] of livepack_getScopeId.wrapForOfIterable(y)) ;`
 *
 * `for (let x of y) ;` ->
 * `for (let [livepack_scopeId, x] of livepack_getScopeId.wrapForOfIterable(y)) ;`
 *
 * `for (var {x, y} of z) ;` ->
 * `{
 *   var x, y;
 *   for (
 *     let [livepack_scopeId, livepack_temp1, livepack_temp2 = {x, y} = livepack_temp1]
 *     of livepack_getScopeId.wrapForOfIterable(z)
 *   ) ;
 * }`
 *
 * `for (x of y) ;` ->
 * `for (
 *   let [livepack_scopeId, livepack_temp1, livepack_temp2 = x = livepack_temp1]
 *   of livepack_getScopeId.wrapForOfIterable(y)
 * ) ;`
 *
 * @param {Object} statementNode - `for of` / `for in` statement AST node
 * @param {Object} initBlock - For statement init block object
 * @param {Array<string>} [varDeclarationNames] - Var names declared in `var` declaration in init clause.
 * @param {Object} parent - `for` statement's parent AST node / array
 * @param {string} key - Key on parent for `for` statement AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentForXStatement(statementNode, initBlock, varDeclarationNames, parent, key, state) {
	// Exit if init block doesn't need scope ID var or temp vars injected into it
	if (!initBlock.scopeIdVarNode && !initBlock.tempVarNodes) return;

	// TODO Handle `for await ( ... of ... )`
	if (statementNode.type === 'ForOfStatement' && statementNode.await) return;

	// Convert `for in` to `for of` and get wrapper function for left side
	let wrapperName;
	if (statementNode.type === 'ForOfStatement') {
		wrapperName = 'wrapForOfIterable';
	} else {
		wrapperName = 'wrapForInObject';
		statementNode.type = 'ForOfStatement';
	}

	let tempVarNodes = initBlock.tempVarNodes || [];
	statementNode.right = t.callExpression(
		t.memberExpression(state.getScopeIdVarNode, t.identifier(wrapperName)),
		[statementNode.right, ...(tempVarNodes.length === 0 ? [] : [t.numericLiteral(tempVarNodes.length)])]
	);

	const leftNode = statementNode.left;
	if (leftNode.type !== 'VariableDeclaration') {
		// `for ({x} of ...)`
		// -> `for (let [livepack_scopeId, livepack_temp1, [] = [{x} = livepack_temp1]] of ...)`
		statementNode.left = t.variableDeclaration('let', [t.variableDeclarator(
			createArrayPatternForExternalVars(leftNode, initBlock, tempVarNodes, state)
		)]);
	} else if (leftNode.kind === 'var') {
		// `for (var {x} of ...)` ->
		// `{
		//   var x;
		//   for (let [livepack_scopeId, livepack_temp1, [] = [{x} = livepack_temp1]] of ...))
		// }`
		leftNode.kind = 'let';
		const declaratorNode = leftNode.declarations[0];
		declaratorNode.id = createArrayPatternForExternalVars(
			declaratorNode.id, initBlock, tempVarNodes, state
		);

		if (varDeclarationNames.length > 0) {
			parent[key] = t.blockStatement([
				t.variableDeclaration(
					'var', varDeclarationNames.map(varName => t.variableDeclarator(t.identifier(varName)))
				),
				statementNode
			]);
		}
	} else {
		// `for (const x of ...)` / `for (let x of ...)` / `for (const x in ...)` / `for (let x in ...)`
		// -> e.g. `for (const [livepack_scopeId, x] of ...)`

		// If `const` declaration, substitute temp vars for objects so they can be internally mutable.
		// Temp vars need to be written to after definition.
		// `livepack_temp1` -> `livepack_temp1.value`
		if (leftNode.kind === 'const' && tempVarNodes.length > 0) {
			tempVarNodes = tempVarNodes.map((tempVarNode) => {
				const clonedTempVarNode = t.identifier(tempVarNode.name);
				tempVarNode.type = 'MemberExpression';
				tempVarNode.name = undefined;
				tempVarNode.object = clonedTempVarNode;
				tempVarNode.property = t.identifier('value');
				return t.assignmentPattern(clonedTempVarNode, t.objectExpression([]));
			});
		}

		const declaratorNode = leftNode.declarations[0];
		declaratorNode.id = t.arrayPattern([
			initBlock.scopeIdVarNode,
			...tempVarNodes,
			declaratorNode.id
		]);
	}
}

function createArrayPatternForExternalVars(idNode, initBlock, tempVarNodes, state) {
	// If `idNode` is `{x}`, returns `[livepack_scopeId, livepack_temp1, [] = [{x} = livepack_temp1]]`
	const valueVarNode = createTempVarNode(state);
	return t.arrayPattern([
		initBlock.scopeIdVarNode || null,
		...tempVarNodes,
		valueVarNode,
		t.assignmentPattern(
			t.arrayPattern([]),
			t.arrayExpression([t.assignmentExpression('=', idNode, valueVarNode)])
		)
	]);
}
