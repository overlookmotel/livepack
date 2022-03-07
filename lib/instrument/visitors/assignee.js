/* --------------------
 * livepack module
 * Code instrumentation visitor for assignment targets
 * ------------------*/

'use strict';

// Export
const assignees = {
	IdentifierLet,
	assertNoCommonJsVarsClash,
	// Will be created below
	AssigneeConst: undefined,
	AssigneeLet: undefined,
	AssigneeVar: undefined,
	AssigneeAssignOnly: undefined,
	AssigneeReadAndAssign: undefined
};
module.exports = assignees;

// Modules
const assert = require('simple-invariant');

// Imports
const Expression = require('./expression.js'),
	{IdentifierAssignOnly, IdentifierReadAndAssign} = require('./identifier.js'),
	MemberExpression = require('./memberExpression.js'),
	{createBinding} = require('../blocks.js'),
	{visitKey, visitKeyContainer, visitKeyContainerWithEmptyMembers, visitWith} = require('../visit.js'),
	{createArrayOrPush} = require('../../shared/functions.js');

// Exports

// Create Assignee visitors
assignees.AssigneeConst = createAssigneeVisitor(IdentifierConst, true);
assignees.AssigneeLet = createAssigneeVisitor(IdentifierLet, true);
assignees.AssigneeVar = createAssigneeVisitor(IdentifierVar, true);
assignees.AssigneeAssignOnly = createAssigneeVisitor(IdentifierAssignOnly, false);
assignees.AssigneeReadAndAssign = createAssigneeVisitor(IdentifierReadAndAssign, false);

/**
 * Create `Assignee` visitor.
 *
 * Assignees are any expression which is assigned to. `x` is Assignee in following examples:
 *   - Assignment expression `x = 1`, `x += 2`, `x++`
 *   - Variable declaration `const x = 1`, `var x`
 *   - Function parameter `function f(x) {}`
 *   - Object deconstruction `{x} = obj`
 *   - Array deconstruction `[x] = arr`
 *   - Rest expression `[...x] = arr`
 *   - For loop initializer `for (x of arr) {}`, `for (x in obj) {}`
 *   - Catch error clause `try { f() } catch (x) {}`
 *
 * Different `Assignee` visitors are used depending on context. e.g.:
 *   - `AssigneeConst` in a `const` declaration.
 *   - `AssigneeAssignOnly` in an assignment which assigns and does not read existing value (`x = 1`).
 *   - `AssigneeReadAndAssign` in an assignment which both reads and assigns (`x++`, `x += 2`)
 *
 * An Assignee can be:
 *   - an identifier e.g. `x`
 *   - a deconstruction pattern e.g. `{x} = obj`, `[x] = arr`
 *   - rest element `[...x] = arr`
 *   - assignment pattern e.g. `function f(x = 1) {}`
 *   - a combination of any of the above e.g. `function f( { p: [ ...{ length: x } ] } = obj ) {}`
 *   - an expression e.g. `obj.x = 1` (when not in variable declaration context)
 *
 * @param {Function} Identifier - Identifier visitor for this context
 * @param {boolean} isDeclaration - `true` if is declaration context
 * @returns {Function} - Assignee visitor
 */
function createAssigneeVisitor(Identifier, isDeclaration) {
	const declarationAssigneeVisitors = {
		Identifier,
		AssignmentPattern,
		ArrayPattern,
		ObjectPattern,
		RestElement
	};

	const allAssigneeVisitors = {
		...declarationAssigneeVisitors,
		MemberExpression
	};

	const Assignee = isDeclaration
		? function Assignee(node, state, parent, key) {
			visitWith(node, declarationAssigneeVisitors, 'assignee', state, parent, key);
		}
		: function Assignee(node, state, parent, key) {
			visitWith(node, allAssigneeVisitors, 'assignee', state, parent, key);
		};

	function AssignmentPattern(node, state) {
		visitKey(node, 'left', Assignee, state);
		visitKey(node, 'right', Expression, state);
	}

	function ArrayPattern(node, state) {
		visitKeyContainerWithEmptyMembers(node, 'elements', Assignee, state);
	}

	function ObjectPattern(node, state) {
		visitKeyContainer(node, 'properties', ObjectPatternMember, state);
	}

	const objectPatternMemberVisitors = {
		ObjectProperty: ObjectPatternProperty,
		RestElement
	};

	function ObjectPatternMember(node, state, parent, key) {
		visitWith(node, objectPatternMemberVisitors, 'object pattern member', state, parent, key);
	}

	function ObjectPatternProperty(node, state) {
		if (node.computed) visitKey(node, 'key', Expression, state);
		visitKey(node, 'value', Assignee, state);
	}

	function RestElement(node, state) {
		visitKey(node, 'argument', Assignee, state);
	}

	return Assignee;
}

/**
 * Visitor for identifier in `const` declaration context
 * @param {Object} node - Identifier AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function IdentifierConst(node, state) {
	visitConstOrLetIdentifier(node, true, state);
}

/**
 * Visitor for identifier in `let` declaration context
 * @param {Object} node - Identifier AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function IdentifierLet(node, state) {
	visitConstOrLetIdentifier(node, false, state);
}

/**
 * Visit identifier in `const` or `let` declaration context.
 * Create binding and record as internal var in function where declaration occurs.
 * @param {Object} node - Identifier AST node
 * @param {boolean} isConst - `true` if is const
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitConstOrLetIdentifier(node, isConst, state) {
	const varName = node.name,
		block = state.currentBlock;
	assertNoCommonJsVarsClash(block, varName, state);
	const binding = createBinding(block, varName, {isConst}, state);
	recordIdentifierInSecondPass(node, binding, varName, state);
}

/**
 * Visitor for identifier in `var` declaration context
 * @param {Object} node - Identifier AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function IdentifierVar(node, state) {
	// Create binding.
	// Check if existing binding to avoid overwriting existing binding
	// if function declaration already encountered in the block.
	const varName = node.name,
		block = state.currentHoistBlock;
	let binding = block.bindings[varName];
	if (!binding) {
		binding = createBinding(block, varName, {isVar: true}, state);
	} else if (binding.isFunction) {
		return;
	}

	recordIdentifierInSecondPass(node, binding, varName, state);
}

/**
 * Add identifier to function's internal vars in 2nd pass.
 * Not done in 1st pass in case binding is redeclared later as a function declaration
 * (if `var` statement), or has an anonymous function assigned to it in a way where the function
 * is named by the assignment. Not adding to `internalVars` prevents var being renamed.
 * @param {Object} node - Identifier AST node
 * @param {Object} binding - Binding object
 * @param {string} varName - Variable name
 * @param {Object} state - State object
 * @returns {undefined}
 */
function recordIdentifierInSecondPass(node, binding, varName, state) {
	const fn = state.currentFunction;
	if (fn) state.secondPass(addIdentifierToInternalVars, node, binding, varName, fn, [...state.trail]);
}

/**
 * Add identifier to parent function's internal vars.
 * @param {Object} node - Identifier AST node (not needed but passed for debug reasons)
 * @param {Object} binding - Binding object
 * @param {string} varName - Variable name
 * @param {Object} fn - Function object
 * @param {Array<string|number>} trail - Trail
 * @returns {undefined}
 */
function addIdentifierToInternalVars(node, binding, varName, fn, trail) {
	if (!binding.isFunction) createArrayOrPush(fn.internalVars, varName, trail);
}

/**
 * Throw error if is an illegal `const`, `let` or `class` declaration at top level of program,
 * where file is CommonJS and var name is a CommonJS var.
 * NB This is the only illegal declaration need to check for.
 * Any other illegal declarations will have thrown an error already in `@babel/parser`.
 *
 * @param {Object} block - Block object
 * @param {string} varName - Var name
 * @param {Object} state - State object
 * @returns {undefined}
 */
function assertNoCommonJsVarsClash(block, varName, state) {
	assert(
		block !== state.programBlock || varName === 'arguments' || !state.fileBlock.bindings[varName],
		`Clashing binding for var '${varName}'`
	);
}
