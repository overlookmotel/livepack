/* --------------------
 * livepack module
 * Babel plugin function to move function params into function body
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createTempVarNode} = require('./internalVars.js'),
	{undefinedNode} = require('./utils.js'),
	{createArrayOrPush} = require('../shared/functions.js');

// Exports

module.exports = {
	variableDeclarationExitVisitor,
	moveFunctionParams
};

/**
 * Visitor to record location of `var` statement if any of the vars
 * clash with external/global vars used in function params.
 * Will be processed later in `moveFunctionParams()`.
 * @param {Object} declarationPath - Babel path object for variable declaration
 * @param {Object} state - State object
 * @returns {undefined}
 */
function variableDeclarationExitVisitor(declarationPath, state) {
	if (declarationPath.node.kind !== 'var') return;

	const fn = state.currentFunction;
	if (!fn) return;
	const {clashingVarNames} = fn;
	if (!clashingVarNames) return;

	const varNames = Object.keys(declarationPath.getBindingIdentifiers());
	if (!varNames.some(varName => clashingVarNames.has(varName))) return;

	createArrayOrPush(fn, 'varDeclarations', {
		parentNode: declarationPath.container,
		key: declarationPath.key,
		varNames
	});
}

/**
 * Move complex function params into function body.
 * Purpose of this is:
 * 1. Avoid side-effects when calling functions to extract scope vars.
 * 2. Support functions within params referring to other params.
 * e.g. `(x, getX = () => x) => getX`
 * See https://github.com/overlookmotel/livepack/issues/108
 *
 * @param {Object} fn - Function props object
 * @param {Object} fnNode - AST node for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function moveFunctionParams(fn, fnNode, state) {
	const {complexParamIndex} = fn;
	if (complexParamIndex === undefined) return;

	// Move complex params into function body.
	// `([x], y = x, ...z) => [x, y, z]` ->
	// `(livepack_temp1, livepack_temp2 = void 0, ...livepack_temp3) => {
	//   let [x] = livepack_temp1,
	//     y = livepack_temp2 !== void 0 ? livepack_temp2 : x,
	//     z = livepack_temp3;
	//   return [x, y, z];
	// }`
	// Vars defined with `let` to preserve TDZ violations.
	// e.g. `(x = y, y) => x` called with no args throws error "Cannot access 'y' before initialization".
	// NB No need to handle duplicate params e.g. `(x, x) => x`.
	// Duplicate params are legal in sloppy mode, but only if all function's params are simple.
	const paramNodes = fnNode.params,
		numParams = paramNodes.length,
		replacmentDeclaratorNodes = [];
	let noComplexReplacementParams = true;
	for (let index = complexParamIndex; index < numParams; index++) {
		const paramNode = paramNodes[index],
			tempVarNode = createTempVarNode(state);
		if (t.isAssignmentPattern(paramNode)) {
			// `(x = f(), y = f2()) => [x, y]` ->
			// `(livepack_temp1 = void 0, livepack_temp2) => {
			//   let x = livepack_temp1 !== void 0 ? livepack_temp1 : f(),
			//     y = livepack_temp2 !== void 0 ? livepack_temp2 : f2();
			//   return [x, y];
			// }`
			// `= void 0` in first param is to maintain `fn.length === 0`.
			if (noComplexReplacementParams) {
				paramNodes[index] = t.assignmentPattern(tempVarNode, undefinedNode());
				noComplexReplacementParams = false;
			} else {
				paramNodes[index] = tempVarNode;
			}

			// If right-hand side is anonymous function, maintain function name
			const leftNode = paramNode.left;
			let rightNode = paramNode.right;
			if (t.isFunction(rightNode) && !rightNode.id && t.isIdentifier(leftNode)) {
				// `x = () => {}` -> right hand side `{x: () => {}}.x`
				const {name} = leftNode;
				rightNode = t.memberExpression(
					t.objectExpression([t.objectProperty(t.identifier(name), rightNode)]),
					t.identifier(name)
				);
			}

			replacmentDeclaratorNodes.push(t.variableDeclarator(
				leftNode,
				t.conditionalExpression(
					t.binaryExpression('!==', tempVarNode, undefinedNode()),
					tempVarNode,
					rightNode
				)
			));
		} else if (t.isRestElement(paramNode)) {
			// `(...[x]) => x` -> (...livepack_temp1) => { let [x] = livepack_temp1; return x; }`
			paramNodes[index] = t.restElement(tempVarNode);
			replacmentDeclaratorNodes.push(t.variableDeclarator(paramNode.argument, tempVarNode));
			noComplexReplacementParams = false;
		} else {
			// `([x]) => x` -> `livepack_temp1 => { let [x] = livepack_temp1; return x; }`
			// `({x}) => x` -> `livepack_temp1 => { let {x} = livepack_temp1; return x; }`
			paramNodes[index] = tempVarNode;
			replacmentDeclaratorNodes.push(t.variableDeclarator(paramNode, tempVarNode));
		}
	}

	if (noComplexReplacementParams && !fn.isStrict) {
		// Sloppy mode function which did have complex params, but now doesn't.
		// Add extra `livepack_temp1 = void 0` param to prevent `arguments` and param vars being linked.
		paramNodes.push(t.assignmentPattern(createTempVarNode(state), undefinedNode()));
	}

	// If params include references to external/global vars which are also defined in function body,
	// enclose function body in a statement block to avoid the clash.
	// `({[y]: x}) => { let y = 1; return x + y; }` ->
	// `(livepack_temp1) => { let {[y]: x} = livepack_temp1; { let y = 1; return x + y; } }`
	// If some of clashing vars are defined with `var`, convert to `let`.
	// `({[y]: x}) => { if (1) { var y = 1; return x + y; } }` ->
	// `(livepack_temp1) => { let {[y]: x} = livepack_temp1; { let y; if (1) { y = 1; return x + y; } } }`
	let bodyNode = fnNode.body;
	if (fn.hasClashingVarNames) {
		const {varDeclarations} = fn,
			bodyNodes = bodyNode.body;
		if (varDeclarations) {
			// Replace `var x = 1, y, z = 2;` with `x = 1; z = 2;`.
			// Process in reverse order to avoid later changes having wrong `key`
			// due to insertions/removals prior to it in same block.
			const hoistedVars = Object.create(null), // Keyed by var name
				hoistFunctionCallNodes = [];
			for (let index = varDeclarations.length - 1; index >= 0; index--) {
				const {parentNode, key, varNames} = varDeclarations[index],
					declarationNode = parentNode[key];
				for (const varName of varNames) {
					hoistedVars[varName] = null;
				}

				if (t.isFunctionDeclaration(declarationNode)) {
					// Function declaration.
					// Wrap function declaration in a temp wrapper declaration. This wrapper function
					// is then called at start of function body to hoist the nested function declaration.
					// Doing like this rather than just moving the function declaration to the start
					// so that order of the code and line numbers is not altered in the output.
					// Therefore, if source maps are not enabled, the line number in an error will still be right.
					// `function x() {}` -> `function livepack_temp3() { x = function() {} }`
					const fnIdNode = declarationNode.id;
					declarationNode.id = null;
					declarationNode.type = 'FunctionExpression';
					const wrapperVarNode = createTempVarNode(state);
					parentNode[key] = t.functionDeclaration(wrapperVarNode, [], t.blockStatement([
						copyLoc(
							t.expressionStatement(t.assignmentExpression('=', fnIdNode, declarationNode)),
							declarationNode
						)
					]));

					hoistFunctionCallNodes.push(t.expressionStatement(t.callExpression(wrapperVarNode, [])));
				} else {
					const declaratorNodes = declarationNode.declarations;
					if (key === 'left') {
						// `for (var x of arr) {}` -> `for (x of arr) {}`
						// `for (var x in obj) {}` -> `for (x in obj) {}`
						parentNode.left = declaratorNodes[0].id;
					} else if (key === 'init') {
						// `for (var x = 1, y, z = 2;;) {}` => `for (x = 1, z = 2;;) {}`
						// `for (var x;;) {}` => `for (;;) {}`
						parentNode.init = declaratorsToExpression(declaratorNodes);
					} else if (key === 'body') {
						// Labelled statement (legal in sloppy mode)
						// `label: var x = 1;` -> `label: x = 1;`
						// `label: var x = 1, y, z = 2;` -> `label: x = 1, z = 2;`
						// `label: var x, y;` -> `label: ;`
						const expressionNode = declaratorsToExpression(declaratorNodes);
						parentNode.body = expressionNode
							? t.expressionStatement(expressionNode)
							: t.emptyStatement();
					} else {
						// `var w = 1, x = 2, y, [z] = [3];` -> `w = 1; x = 2; [z] = [3];`
						// `var x, y, x;` -> `` (statement removed)
						parentNode.splice(
							key,
							1,
							...declaratorsToAssignments(declaratorNodes).map(node => t.expressionStatement(node))
						);
					}
				}
			}

			if (hoistFunctionCallNodes.length !== 0) bodyNodes.unshift(...hoistFunctionCallNodes);

			const paramClashVarNames = Object.keys(fn.paramClashes);
			if (paramClashVarNames.length !== 0) {
				for (const varName of paramClashVarNames) {
					const tempVarNode = createTempVarNode(state);
					replacmentDeclaratorNodes.push(t.variableDeclarator(tempVarNode, t.identifier(varName)));
					hoistedVars[varName] = tempVarNode;
				}
			}

			bodyNodes.unshift(t.variableDeclaration(
				'let',
				Object.entries(hoistedVars).map(
					([varName, initNode]) => t.variableDeclarator(t.identifier(varName), initNode)
				)
			));
		}

		bodyNode = fnNode.body = t.blockStatement([bodyNode]);
	}

	bodyNode.body.unshift(t.variableDeclaration('let', replacmentDeclaratorNodes));
}

/**
 * Convert var declarators to assignment expressions.
 * Any declarators which have no init clause (i.e. `var x` rather than `var x = 1`) are omitted.
 * @param {Array<Object>} declaratorNodes - Array of `var` declarator AST nodes
 * @returns {Array<Object>} - Array of assignment expression AST nodes
 */
function declaratorsToAssignments(declaratorNodes) {
	const assignmentNodes = [];
	for (const declaratorNode of declaratorNodes) {
		if (declaratorNode.init) {
			assignmentNodes.push(copyLoc(
				t.assignmentExpression('=', declaratorNode.id, declaratorNode.init),
				declaratorNode
			));
		}
	}
	return assignmentNodes;
}

/**
 * Convert var declarators to a single expression.
 * If no declarators have an init clause, return `null`.
 * @param {Array<Object>} declaratorNodes - Array of `var` declarator AST nodes
 * @returns {Object|null} - Expression AST node
 */
function declaratorsToExpression(declaratorNodes) {
	const assignmentNodes = declaratorsToAssignments(declaratorNodes),
		numAssignments = assignmentNodes.length;
	if (numAssignments === 0) return null;
	if (numAssignments === 1) return assignmentNodes[0];
	return t.sequenceExpression(assignmentNodes);
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
