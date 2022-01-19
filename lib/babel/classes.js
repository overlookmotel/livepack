/* --------------------
 * livepack module
 * Babel plugin class visitors
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {
		enterFunctionOrClass, exitFunctionOrClass, insertTrackerComment, createTrackerNode
	} = require('./functions.js'),
	{createBlockId, createBlockProps, initBlockScope} = require('./blocks.js'),
	{replaceWith} = require('./utils.js'),
	{createTempVarNode} = require('./internalVars.js'),
	{FUNCTION_PROPS, SUPER_BLOCK, NAME_BLOCK, SUPER_VAR_NODE, SUPER_VARS} = require('./symbols.js'),
	{createArrayOrPush} = require('../shared/functions.js'),
	{FN_TYPE_CLASS} = require('../shared/constants.js');

// Exports

module.exports = {
	classEnterVisitor,
	classBodyExitVisitor,
	classExitVisitor
};

/**
 * Visitor to init scope and state for class.
 * @param {Object} classPath - Babel path object for class
 * @param {Object} state - State object
 * @returns {undefined}
 */
function classEnterVisitor(classPath, state) {
	// Create blocks for `super` target and class name. Don't enter these blocks.
	const classNode = classPath.node,
		idNode = classNode.id,
		blockName = idNode ? idNode.name : undefined;
	classPath[SUPER_BLOCK] = createBlockProps(blockName, false, state);
	classPath[NAME_BLOCK] = idNode ? createBlockProps(blockName, false, state) : undefined;

	// Enter class (NB Classes are always strict mode)
	const fn = enterFunctionOrClass(classPath, createBlockId(state), true, false, false, state);

	// Flag if has superclass
	if (classNode.superClass) fn.hasSuperClass = true;

	// Init props for tracking `super` target var
	classPath[SUPER_VAR_NODE] = undefined;
	classPath[SUPER_VARS] = undefined;
}

/**
 * Visitor to add constructor to classes with no existing constructor.
 * Constructor is required for serializer to call.
 * Exit function. Exit is performed after class body, which is prior to entering
 * class's `extends` clause. `extends` clause is treated as part of function enclosing the class,
 * not part of class itself.
 * @param {Object} bodyPath - Babel path object for class body
 * @param {Object} state - State object
 * @returns {undefined}
 */
function classBodyExitVisitor(bodyPath, state) {
	// Exit function
	const fn = exitFunctionOrClass(state);

	// If class has constructor, inherit scopes and other info from constructor.
	// Add constructor's child functions to start of class's functions and record how many.
	const {constructorFn} = fn;
	if (constructorFn) {
		const constructorChildren = constructorFn.children,
			numClassChildren = constructorChildren.length;
		fn.numClassChildren = numClassChildren;
		if (numClassChildren > 0) fn.children.unshift(...constructorChildren);
		if (fn.firstSuperStatementIndex === -1) fn.firstSuperStatementIndex = undefined;

		for (const key of [
			'scopes', 'containsEval', 'containsImport', 'internalVars', 'globalVarNames', 'amendments'
		]) {
			fn[key] = constructorFn[key];
		}
		return;
	}

	// Create constructor.
	// If extends a super class: `constructor(...args) { super(...args); }`
	// Otherwise: `constructor() {}`
	const {id: fnId, hasSuperClass} = fn,
		classPath = bodyPath.parentPath,
		classNode = classPath.node;
	let scopes;
	if (hasSuperClass) {
		const block = classPath[SUPER_BLOCK];
		initBlockScope(block, state);
		scopes = [{block, vars: {super: {isReadFrom: true, isAssignedTo: false, trails: []}}}];
	} else {
		scopes = [];
	}
	fn.scopes = scopes;
	fn.numClassChildren = 0;

	classNode.body.body.push(t.classMethod(
		'constructor',
		t.identifier('constructor'),
		hasSuperClass ? [t.restElement(t.identifier('args'))] : [],
		t.blockStatement([
			t.expressionStatement(createTrackerNode(fnId, scopes, null, state)),
			...(
				hasSuperClass
					? [t.expressionStatement(t.callExpression(t.super(), [t.spreadElement(t.identifier('args'))]))]
					: []
			)
		])
	));

	// Insert tracker comment
	insertTrackerComment(fnId, FN_TYPE_CLASS, undefined, classNode, 'inner', state);
}

/**
 * Visitor to insert temp var for `super` if required.
 * @param {Object} classPath - Babel path object for class
 * @param {Object} state - State object
 * @returns {undefined}
 */
function classExitVisitor(classPath, state) {
	insertClassTempSuperVar(classPath, state);

	// Clear `.path` to free memory and indicate class has been exited (used in `getBindingBlock()`).
	// Needs to happen only after traversing class `extends` clause as a function defined in that clause
	// can reference the class name and it refers to the class itself, not the var in parent scope.
	// e.g. `let f; class X extends (f = () => X, Object) {}; X = 123; console.log(f());`
	// logs `[Function: X]` not `123`.
	classPath[FUNCTION_PROPS].path = undefined;

	// Restore `isStrict` to as was before entering class
	const {currentFunction} = state;
	state.isStrict = currentFunction ? currentFunction.isStrict : state.topLevelIsStrict;
}

/**
 * Insert temp var for `super` if required for class.
 *
 * Class declarations are converted to var declaration
 * `class X { foo() { const X = 1; super.foo() } }`
 * -> `let X = temp_0 = class X { foo() { const X = 1; super.foo() } };`
 *
 * If is an unnamed class, preserve implicit name.
 * `let X = class {};` -> `let X = temp_0 = {X: class {}}.X;`
 * `const o = { [fn()]: class {} };`
 * -> `const o = { [temp_2 = fn() + '']: temp_1 = { [temp_2]: class {} }[temp_2] } };`
 *
 * @param {Object} classPath - Babel path for class which is target of `super`
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertClassTempSuperVar(classPath, state) {
	const superVarNode = classPath[SUPER_VAR_NODE];
	if (!superVarNode) return;

	const tempVarNodes = [superVarNode],
		classNode = classPath.node,
		isClassDeclaration = t.isClassDeclaration(classNode);
	let replacementNode = classNode;
	if (isClassDeclaration) {
		classNode.type = 'ClassExpression';
	} else if (!classNode.id) {
		// Ensure class name is preserved if gained implicitly from assignment
		const {parentPath} = classPath;
		let idNode,
			keyIsComputed = false,
			accessIsComputed = false;
		if (parentPath.isAssignmentExpression()) {
			if (classPath.key === 'right') {
				const parentNode = parentPath.node;
				if (['=', '&&=', '||=', '??='].includes(parentNode.operator)) {
					const leftNode = parentNode.left;
					if (t.isIdentifier(leftNode)) idNode = leftNode;
				}
			}
		} else if (parentPath.isVariableDeclarator()) {
			if (classPath.key === 'init') {
				const assignedToNode = parentPath.node.id;
				if (t.isIdentifier(assignedToNode)) idNode = assignedToNode;
			}
		} else if (parentPath.isProperty()) {
			if (classPath.key === 'value') {
				const parentNode = parentPath.node,
					keyNode = parentNode.key;
				keyIsComputed = parentNode.computed;

				if (!keyIsComputed) {
					idNode = keyNode;
					accessIsComputed = t.isLiteral(keyNode);
				} else if (t.isLiteral(keyNode)) {
					idNode = keyNode;
					accessIsComputed = true;
				} else {
					// Key is expression.
					// Create temp var to hold key, to prevent expression being evaluated multiple times.
					// `+ ''` is added in case `.toString()` method has side effects,
					// so need to prevent it being called multiple times too.
					// `{[f()]: class {}}` -> `{[temp_2 = fn() + '']: temp_1 = {[temp_2]: class {}}[temp_2]}`
					// TODO Conversion to string won't work for Symbols.
					// Needs to be `{[temp_2 = livepack_getKey(fn())]: temp_1 = {[temp_2]: class {}}[temp_2]}}`
					// where `livepack_getKey` is defined as:
					// `k => (typeof k === 'symbol' || require('util').types.isSymbolObject(k)) ? k : k + '';`
					idNode = createTempVarNode(state);
					tempVarNodes.push(idNode);
					accessIsComputed = true;
					parentNode.key = t.assignmentExpression(
						'=',
						idNode,
						t.binaryExpression('+', keyNode, t.stringLiteral(''))
					);
				}
			}
		}

		if (idNode) {
			// Class will be named by assignment.
			// `let C = class {};` -> `let C = temp_3 = {C: class {}}.C;`
			// Using object prop to provide class name rather than setting directly, as that
			// would add a variable to scope which could potentially interfere with a var
			// with same name in an upper scope.
			replacementNode = t.memberExpression(
				t.objectExpression([t.objectProperty(idNode, classNode, keyIsComputed)]),
				idNode,
				accessIsComputed
			);
		} else {
			// Class will remain anonymous.
			// `class {}` -> `temp_3 = (0, class {})`
			replacementNode = t.sequenceExpression([t.numericLiteral(0), classNode]);
		}
	}

	replacementNode = t.assignmentExpression('=', superVarNode, replacementNode);

	// If class declaration, replace with `let ... = ...`.
	// `class X {}` -> `let X = temp_3 = class X {}`
	if (isClassDeclaration) {
		replacementNode = t.variableDeclaration(
			'let', [t.variableDeclarator(classNode.id, replacementNode)]
		);
	}

	replaceWith(classPath, replacementNode);

	// Create temp vars at start of enclosing block (will be inserted in `blockStatementExitVisitor()`)
	createArrayOrPush(state.currentBlock.varsBlock, 'tempVarNodes', ...tempVarNodes);
}
