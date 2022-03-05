/* --------------------
 * livepack module
 * Code instrumentation functions for function params
 * ------------------*/

'use strict';

// Export
module.exports = {
	isInFunctionWithComplexParams,
	moveComplexParamsIntoFunctionBody
};

// Modules
const t = require('@babel/types');

// Imports
const {createTempVarNode} = require('../internalVars.js');

// Exports

function isInFunctionWithComplexParams(state) {
	const fn = state.currentFunction;
	return fn ? fn.complexParamIndex !== undefined : false;
}

const undefinedNode = t.unaryExpression('void', t.numericLiteral(0));

/**
 * Move complex function params into function body.
 * Purpose of this is:
 * 1. Avoid side-effects when calling function to extract scope vars.
 * 2. Support functions within params referring to other params.
 * e.g. `(x, getX = () => x) => getX`
 * See https://github.com/overlookmotel/livepack/issues/108
 *
 * @param {Object} fn - Function object
 * @param {Object} fnNode - Function AST node
 * @param {Object} paramsBlock - Block object for function params block
 * @param {Object} [bodyBlock] - Block object for function body block
 *   (`undefined` for arrow function with body which isn't block statement)
 * @param {Object} state - State object
 * @returns {undefined}
 */
function moveComplexParamsIntoFunctionBody(fn, fnNode, paramsBlock, bodyBlock, state) {
	const {complexParamIndex} = fn;
	if (complexParamIndex === undefined) return;

	// Move complex params into function body.
	// `([x], y = x, ...z) => [x, y, z]` ->
	// `(livepack_temp1, livepack_temp2 = void 0, ...livepack_temp3) => {
	//   let [x] = livepack_temp1,
	//     y = livepack_temp2 !== void 0 ? livepack_temp2 : x,
	//     z = livepack_temp3;
	//   {
	//     return [x, y, z];
	//   }
	// }`
	// Vars defined with `let` to preserve TDZ violations.
	// e.g. `(x = y, y) => x` called with no args throws error "Cannot access 'y' before initialization".
	// NB No need to handle duplicate params e.g. `(x, x) => x`.
	// Duplicate params are legal in sloppy mode, but only if all function's params are simple.
	const paramNodes = fnNode.params,
		numParams = paramNodes.length,
		replacmentDeclaratorNodes = [];
	let noComplexReplacementParams = true,
		assignmentPatternReplacement;
	for (let index = complexParamIndex; index < numParams; index++) {
		const paramNode = paramNodes[index],
			{type} = paramNode,
			tempVarNode = createTempVarNode(state);
		if (type === 'AssignmentPattern') {
			// `(x = 1, {y, z} = f()) => [x, y, z]` ->
			// `(livepack_temp1 = void 0, livepack_temp2) => {
			//   let [x = 1, {y, z} = f()] = [livepack_temp1, livepack_temp2];
			//   {
			//     return [x, y, z];
			//   }
			// }`
			// NB `= void 0` in first param is to maintain `fn.length === 0`.
			if (noComplexReplacementParams) {
				paramNodes[index] = t.assignmentPattern(tempVarNode, undefinedNode);
				noComplexReplacementParams = false;
			} else {
				paramNodes[index] = tempVarNode;
			}

			if (assignmentPatternReplacement) {
				assignmentPatternReplacement.id.elements.push(paramNode);
				assignmentPatternReplacement.init.elements.push(tempVarNode);
			} else {
				assignmentPatternReplacement = t.variableDeclarator(
					t.arrayPattern([paramNode]), t.arrayExpression([tempVarNode])
				);
				replacmentDeclaratorNodes.push(assignmentPatternReplacement);
			}
		} else {
			assignmentPatternReplacement = undefined;

			if (type === 'RestElement') {
				// `(...[x]) => x` -> `(...livepack_temp1) => { let [x] = livepack_temp1; return x; }`
				replacmentDeclaratorNodes.push(t.variableDeclarator(paramNode.argument, tempVarNode));
				paramNode.argument = tempVarNode;
				noComplexReplacementParams = false;
			} else {
				// `([x]) => x` -> `(livepack_temp1) => { let [x] = livepack_temp1; { return x; } }`
				// `({x}) => x` -> `(livepack_temp1) => { let {x} = livepack_temp1; { return x; } }`
				// Also handles simple params which follow a complex param:
				// `(..., x) => x` -> `(..., livepack_temp2) => { let ..., x = livepack_temp2; { return x; } }`
				paramNodes[index] = tempVarNode;
				replacmentDeclaratorNodes.push(t.variableDeclarator(paramNode, tempVarNode));
			}
		}
	}

	if (noComplexReplacementParams && !fn.isStrict) {
		// Sloppy mode function which did have complex params, but now doesn't.
		// Add extra `livepack_temp1 = void 0` param to prevent `arguments` and param vars being linked.
		paramNodes.push(t.assignmentPattern(createTempVarNode(state), undefinedNode));
	}

	const bodyNode = fnNode.body;
	if (bodyBlock) {
		const hoistedDeclaratorNodes = [];
		const paramsBindings = paramsBlock.bindings;
		for (const [varName, binding] of Object.entries(bodyBlock.bindings)) {
			if (!binding.isHoistable) continue;
			if (paramsBindings[varName]) {
				// Var defined as param and shadowed by a `var` statement or function declaration in body.
				// Init replacement var's value to value of param upon exit from params.
				// If param value changed inside the params, this is reflected in the initial `var` value.
				// e.g. `((x = 1, y = x = 2) => { console.log(x); var x = 3; })()` -> Logs '2'
				const tempVarNode = createTempVarNode(state);
				replacmentDeclaratorNodes.push(t.variableDeclarator(tempVarNode, t.identifier(varName)));
				hoistedDeclaratorNodes.push(t.variableDeclarator(t.identifier(varName), tempVarNode));
			} else {
				hoistedDeclaratorNodes.push(t.variableDeclarator(t.identifier(varName)));
			}
		}

		if (hoistedDeclaratorNodes.length !== 0) {
			bodyNode.body.unshift(
				t.variableDeclaration('let', hoistedDeclaratorNodes),
				...fn.hoistFunctionCallNodes
			);
		}
	}

	// Enclose function body in block statement and insert replacement declaration of params vars
	fnNode.body = t.blockStatement([
		t.variableDeclaration('let', replacmentDeclaratorNodes),
		bodyNode
	]);
}
