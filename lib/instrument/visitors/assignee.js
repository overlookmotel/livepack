/* --------------------
 * livepack module
 * Code instrumentation visitor for assignment targets
 * ------------------*/

'use strict';

// Export
const assignees = {
	IdentifierLet,
	// Will be created below
	AssigneeConst: undefined,
	AssigneeLet: undefined,
	AssigneeVar: undefined,
	AssigneeAssignOnly: undefined,
	AssigneeReadAndAssign: undefined
};
module.exports = assignees;

// Imports
const Expression = require('./expression.js'),
	{IdentifierAssignOnly, IdentifierReadAndAssign} = require('./identifier.js'),
	MemberExpression = require('./memberExpression.js'),
	{createBinding} = require('../blocks.js'),
	{visitKey, visitKeyContainer, visitKeyContainerWithEmptyMembers} = require('../visit.js');

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
 *   - a member expression e.g. `obj.x = 1` (when not in variable declaration context)
 *
 * @param {Function} Identifier - Identifier visitor for this context
 * @param {boolean} isDeclaration - `true` if is declaration context
 * @returns {Function} - Assignee visitor
 */
function createAssigneeVisitor(Identifier, isDeclaration) {
	const Assignee = isDeclaration
		? function DeclarationAssignee(node, state) {
			switch (node.type) {
				case 'Identifier': return Identifier(node, state);
				case 'AssignmentPattern': return AssignmentPattern(node, state);
				case 'ArrayPattern': return ArrayPattern(node, state);
				case 'ObjectPattern': return ObjectPattern(node, state);
				case 'RestElement': return RestElement(node, state);
				default: throw new Error(`Unexpected assignee type '${node.type}'`);
			}
		}
		: function AnyAssignee(node, state) {
			switch (node.type) {
				case 'Identifier': return Identifier(node, state);
				case 'AssignmentPattern': return AssignmentPattern(node, state);
				case 'ArrayPattern': return ArrayPattern(node, state);
				case 'ObjectPattern': return ObjectPattern(node, state);
				case 'RestElement': return RestElement(node, state);
				case 'MemberExpression': return MemberExpression(node, state); // Keep as 2 params
				default: throw new Error(`Unexpected assignee type '${node.type}'`);
			}
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

	function ObjectPatternMember(node, state) {
		switch (node.type) {
			case 'ObjectProperty': return ObjectPatternProperty(node, state);
			case 'RestElement': return RestElement(node, state);
			default: throw new Error(`Unexpected object pattern member type '${node.type}'`);
		}
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
	const binding = createBinding(state.currentBlock, node.name, {isConst}, state);

	// Record binding as in function and trail of binding identifier
	const fn = state.currentFunction;
	if (fn) {
		fn.bindings.push(binding);
		binding.trails.push([...state.trail]);
	}
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
		fn = state.currentFunction,
		block = state.currentHoistBlock;
	let binding = block.bindings.get(varName);
	if (!binding) {
		// If function has a param with same name, create a separate binding on the hoist block,
		// but reuse the same binding object. This is so that if the param is frozen,
		// this var is too, so that the var continues to inherit its initial value from the param.
		// e.g. `function(x, y = eval('foo')) { var x; return x; }`
		binding = block.parent.bindings.get(varName);
		if (binding) {
			block.bindings.set(varName, binding);
			if (binding.isFrozenName) return; // Possible if var is called `arguments`
		} else {
			binding = createBinding(block, varName, {isVar: true}, state);
			if (fn) fn.bindings.push(binding);
		}
	} else if (binding.isFrozenName) {
		return;
	}

	// Record trail of binding identifier.
	// If a function declaration reuses the same binding later, trail will be deleted again.
	if (fn) binding.trails.push([...state.trail]);
}
