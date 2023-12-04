/* --------------------
 * livepack module
 * Code instrumentation functions to add vars and tracker to functions/blocks
 * ------------------*/

'use strict';

// Export
module.exports = {
	insertBlockVarsIntoBlockStatement,
	insertTrackerCodeIntoFunction
};

// Modules
const t = require('@babel/types');

// Imports
const {createTempVarNode} = require('./internalVars.js'),
	{copyLocAndComments} = require('./utils.js');

// Exports

/**
 * Insert block var declarations at start of block statement.
 * @param {Object} block - Block object
 * @param {Object} blockNode - Statement block / program AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertBlockVarsIntoBlockStatement(block, blockNode, state) {
	const {scopeIdVarNode} = block;
	if (!scopeIdVarNode) return;

	// `const livepack_scopeId_1 = livepack_getScopeId()`
	const statementNodes = [
		t.variableDeclaration(
			'const', [t.variableDeclarator(scopeIdVarNode, t.callExpression(state.getScopeIdVarNode, []))]
		)
	];

	// `let livepack_temp_2, livepack_temp_3`
	const {tempVarNodes} = block;
	if (tempVarNodes) {
		statementNodes[1] = t.variableDeclaration(
			'let', tempVarNodes.map(tempVarNode => t.variableDeclarator(tempVarNode, null))
		);
	}

	blockNode.body.unshift(...statementNodes);
}

/**
 * Insert tracker code, scope ID var and temp vars into function.
 * If function has complex params, insert into params. Otherwise, into function body.
 * @param {Object} fn - Function object
 * @param {Object} fnNode - Function AST node
 * @param {Object} paramsBlock - Function params block object
 * @param {Object} [bodyBlock] - Function body block object
 *   (`undefined` if arrow function with no body block)
 * @param {Object} trackerNode - AST node for tracker call
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertTrackerCodeIntoFunction(fn, fnNode, paramsBlock, bodyBlock, trackerNode, state) {
	const {firstComplexParamIndex} = fn;
	if (firstComplexParamIndex === undefined) {
		insertTrackerCodeIntoFunctionBody(fnNode, paramsBlock, bodyBlock, trackerNode, state);
	} else {
		insertTrackerCodeIntoFunctionParams(
			fnNode, paramsBlock, bodyBlock, trackerNode, firstComplexParamIndex, state
		);
	}
}

/**
 * Insert tracker code, scope ID var and temp vars into function body.
 * @param {Object} fnNode - Function AST node
 * @param {Object} paramsBlock - Function params block object
 * @param {Object} [bodyBlock] - Function body block object
 *   (`undefined` if arrow function with no body block)
 * @param {Object} trackerNode - AST node for tracker call
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertTrackerCodeIntoFunctionBody(fnNode, paramsBlock, bodyBlock, trackerNode, state) {
	// If body is not a block statement, convert it to one
	let bodyNode = fnNode.body;
	if (!bodyBlock) bodyNode = fnNode.body = t.blockStatement([t.returnStatement(bodyNode)]);

	// Insert scope ID and temp var nodes
	insertBlockVarsIntoBlockStatement(bodyBlock || paramsBlock, bodyNode, state);

	// Insert tracker call
	bodyNode.body.unshift(t.expressionStatement(trackerNode));
}

/**
 * Insert tracker code, scope ID var and temp vars into function params.
 *
 * Objectives:
 *   - Insert tracker call before any code in function params which could produce side effects.
 *   - Initialize scope ID and temp vars before they may be used
 *     (including coping with scenario where error thrown in params)
 *   - Allow functions defined in params to access other params.
 *   - Allow functions defined in params to access vars outside function which are shadowed in
 *     function body.
 *   - Do not move initialization of params into function body, to:
 *     1. Preserve behavior of generator functions which execute params upon calling function
 *        but only execute function body when `.next()` called on generator.
 *     2. Avoid complications with hoisted `var` statements and sloppy function declarations.
 *
 * See https://github.com/overlookmotel/livepack/issues/108
 *
 * Solution is to add an object pattern rest element to end of params.
 * Tracker call is added as key for object property and is first to be evaluated.
 * `livepack_tracker()` returns a dummy Symbol, so this property will never exist
 * on the rest object being destructured.
 * Any complex params are moved into an array deconstruction expression and will be evaluated
 * in original order.
 * If function already has a rest element, it's merged with the substitute.
 *
 * `(x = 1, {y}, ...z) => () => [x, y, z]` ->
 * `(
 *   livepack_temp1 = void 0, // `= void 0` preserves `fn.length = 0`
 *   livepack_temp2,
 *   ...{
 *     [ livepack_tracker(...) ]: [
 *       livepack_scopeId_1,
 *       livepack_temp3,
 *       x = 1,
 *       {y}
 *     ] = [
 *       livepack_getScopeId(),
 *       () => z = livepack_getScopeId.toRest(z) // Convert `z` from object to array,
 *       livepack_temp1,
 *       livepack_temp2
 *     ],
 *     ...z
 *   }
 * ) => ( livepack_temp3(), () => [x, y, z] )`
 *
 * @param {Object} fnNode - Function AST node
 * @param {Object} paramsBlock - Function params block object
 * @param {Object} [bodyBlock] - Function body block object
 *   (`undefined` if arrow function with no body block)
 * @param {Object} trackerNode - AST node for tracker call
 * @param {number} firstComplexParamIndex - Index of first param which is a complex param
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertTrackerCodeIntoFunctionParams(
	fnNode, paramsBlock, bodyBlock, trackerNode, firstComplexParamIndex, state
) {
	// Create object pattern to use as rest element.
	// `{ [ livepack_tracker(...) ]: [] = [] }`
	// Assignments will be added to each side of `[] = []` to init vars and assign to them.
	const leftNodes = [],
		rightNodes = [],
		propNodes = [
			t.objectProperty(
				trackerNode,
				t.assignmentPattern(t.arrayPattern(leftNodes), t.arrayExpression(rightNodes)),
				true
			)
		],
		objNode = t.objectPattern(propNodes);

	function addAssignment(leftNode, rightNode) {
		leftNodes.push(leftNode);
		rightNodes.push(rightNode);
	}

	// Insert assignments for scope ID var node and temp var nodes
	const {scopeIdVarNode} = paramsBlock;
	if (scopeIdVarNode) {
		addAssignment(scopeIdVarNode, t.callExpression(state.getScopeIdVarNode, []));

		const {tempVarNodes} = paramsBlock;
		if (tempVarNodes) tempVarNodes.forEach(tempVarNode => addAssignment(tempVarNode, null));
	}

	// Flatten rest array param if present.
	// `(w, ...[x, {y}, ...z])` => `(w, x, {y}, ...z)`
	// `(x, ...[, , y, , z, , ])` => `(x, , , y, , z)`
	// `(...[x, ...[y, ...z]]])` => `(x, y, ...z)`
	// `(...[...[...x]]])` => `(...x)`
	// `(...[])` => `()`
	// If first param replacing rest array would cause function's `.length` to increase,
	// record that it needs to have a default added to prevent this
	const paramNodes = fnNode.params;
	let lastParamIndex = paramNodes.length - 1,
		firstLengthTrucatingIndex = Infinity;
	if (flattenRestArray(paramNodes, lastParamIndex, objNode)) {
		const paramNode = paramNodes[firstComplexParamIndex];
		if (
			paramNode === null || (paramNode.type !== 'AssignmentPattern' && paramNode.type !== 'RestElement')
		) {
			firstLengthTrucatingIndex = lastParamIndex;
		}
		lastParamIndex = paramNodes.length - 1;
	}

	// Handle rest element
	if (lastParamIndex !== -1) {
		const paramNode = paramNodes[lastParamIndex];
		if (paramNode.type === 'RestElement') {
			const argumentNode = paramNode.argument;
			if (argumentNode.type === 'Identifier') {
				// Capture rest arguments as an object.
				// Create a function which uses `livepack_getScopeId.toRest()` to convert it to an array.
				// Insert call to this function into function body.
				// `(...x) => x` -> `(...{
				//   [livepack_tracker(...)]: [livepack_temp_1] = [() => x = livepack_getScopeId.toRest(x)],
				//   ...x
				// }) => (livepack_temp_1(), x)`
				// NB: Function to convert to array is placed inside params rather than in function body
				// in case the var is shadowed inside function body by a function declaration.
				// e.g. `(getX = () => x, ...x) => { function x() {}; return getX; }`
				const convertToArrayNode = createTempVarNode(state);
				addAssignment(
					convertToArrayNode,
					// `() => x = livepack_getScopeId.toRest(x)`
					t.arrowFunctionExpression(
						[],
						t.assignmentExpression('=', argumentNode, t.callExpression(
							t.memberExpression(state.getScopeIdVarNode, t.identifier('toRest')),
							[argumentNode]
						))
					)
				);

				// Add call in function body
				const callNode = t.callExpression(convertToArrayNode, []);
				if (bodyBlock) {
					fnNode.body.body.unshift(t.expressionStatement(callNode));
				} else {
					fnNode.body = t.sequenceExpression([callNode, fnNode.body]);
				}

				// Add rest element to object pattern
				propNodes.push(paramNode);
			} else {
				// ObjectPattern - add properties to replacement object pattern
				copyLocAndComments(objNode, paramNode);
				propNodes.push(...argumentNode.properties);
			}

			// Remove rest element
			paramNodes.pop();
			lastParamIndex--;
		}
	}

	// Convert all other params to assignments in object pattern
	for (let index = firstComplexParamIndex; index <= lastParamIndex; index++) {
		// Replace param with a temp var
		const paramNode = paramNodes[index],
			tempVarNode = createTempVarNode(state);
		paramNodes[index] = tempVarNode;

		// Add assignment to object pattern.
		// NB: Function params cannot be `null` usually, but `flattenRestArray()` can produce them.
		if (paramNode) {
			addAssignment(paramNode, tempVarNode);
			if (paramNode.type === 'AssignmentPattern' && firstLengthTrucatingIndex > index) {
				firstLengthTrucatingIndex = index;
			}
		}
	}

	// If above operations would change function's `.length` property by replacing what were
	// complex params with simple ones, add a default `= void 0` to param
	// to reduce `.length` to as it was originally
	if (firstLengthTrucatingIndex !== Infinity) {
		paramNodes[firstLengthTrucatingIndex] = t.assignmentPattern(
			paramNodes[firstLengthTrucatingIndex], t.unaryExpression('void', t.numericLiteral(0))
		);
	}

	// Add rest object pattern to function params
	paramNodes.push(t.restElement(objNode));
}

/**
 * Flatten rest array.
 * If last element of rest array is itself a rest array, recursively flatten.
 * Mutates `paramNodes` passed in.
 * e.g. `...[x, y]` -> `x, y`, `...[...[x]]` -> `x`
 * @param {Array<Object>} paramNodes - Function params or rest argument elements AST nodes
 * @param {number} index - `paramNodes.length - 1`
 * @param {Object} objNode - Object pattern AST node
 * @returns {boolean} - `true` if flattened a rest array
 */
function flattenRestArray(paramNodes, index, objNode) {
	// Exit if not a rest array
	const paramNode = paramNodes[index];
	if (paramNode.type !== 'RestElement') return false;
	const argumentNode = paramNode.argument;
	if (argumentNode.type !== 'ArrayPattern') return false;

	// Copy comments from array pattern as it's going to be deleted
	copyLocAndComments(objNode, argumentNode);

	// Remove empty elements from end of array pattern. Exit if none remaining.
	const elementNodes = argumentNode.elements;
	let lastElementIndex = elementNodes.length - 1;
	while (true) { // eslint-disable-line no-constant-condition
		if (lastElementIndex === -1) {
			paramNodes.pop();
			return true;
		}
		if (elementNodes[lastElementIndex]) break;
		elementNodes.pop();
		lastElementIndex--;
	}

	// Recusively flatten
	flattenRestArray(elementNodes, lastElementIndex, objNode);
	paramNodes.splice(index, 1, ...elementNodes);

	return true;
}
