/* --------------------
 * livepack module
 * Code instrumentation visitor for classes
 * ------------------*/

'use strict';

// Export
module.exports = {
	ClassDeclaration,
	ClassExpression
};

// Modules
const t = require('@babel/types'),
	assert = require('simple-invariant');

// Imports
const {
		createFunction, createAndEnterFunctionOrClassNameBlock, visitFunctionParamsAndBody,
		removeUnnecessaryUseStrictDirectives, insertTrackerComment, instrumentFunctionOrClassConstructor
	} = require('./function.js'),
	{visitMethod, getMethodName} = require('./method.js'),
	Expression = require('./expression.js'),
	Statement = require('./statement.js'),
	{assertNoCommonJsVarsClash} = require('./assignee.js'),
	{recordSuper, getSuperVarNode} = require('./super.js'),
	{
		createBlockId, createBlock, createBlockWithId, createAndEnterBlock, createBindingWithoutNameCheck,
		createThisBinding, createArgumentsBinding, createBlockTempVar
	} = require('../blocks.js'),
	{visitKey, visitKeyMaybe, visitKeyContainer} = require('../visit.js'),
	{createTempVarNode} = require('../internalVars.js'),
	{FN_TYPE_CLASS} = require('../../shared/constants.js');

// Exports

/**
 * Visitor for class declaration.
 * @param {Object} node - Class declaration AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function ClassDeclaration(node, state, parent, key) {
	// Create binding for function name in parent block
	const block = state.currentBlock,
		className = node.id.name;
	assertNoCommonJsVarsClash(block, className, state);
	// No need to check for internal var name clash here as will be checked when creating
	// the binding for class name accessed from inside class
	createBindingWithoutNameCheck(block, className, {isFunction: true});

	// Visit class
	visitClass(node, parent, key, className, state);
}

/**
 * Visitor for class expression.
 * @param {Object} node - Class expression AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function ClassExpression(node, state, parent, key) {
	visitClass(node, parent, key, node.id ? node.id.name : undefined, state);
}

/**
 * Visit class declaration/expression.
 * Class members are visited out of order as different types of members e.g. static/prototype methods
 * are within different blocks.
 * @param {Object} classNode - Class declaration or expression AST node
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Class node's key on parent AST node/container
 * @param {string} [className] - Class name (`undefined` if unnamed)
 * @param {Object} state - State object
 * @returns {Object} - Function object
 */
function visitClass(classNode, parent, key, className, state) {
	const parentFunction = state.currentFunction,
		parentBlock = state.currentBlock,
		parentThisBlock = state.currentThisBlock,
		parentSuperBlock = state.currentSuperBlock,
		parentSuperIsProto = state.currentSuperIsProto,
		parentIsStrict = state.isStrict,
		externalTrail = state.trail;

	// If not anonymous, create and enter block for class name accessed from within class
	let nameBlock;
	if (className) nameBlock = createAndEnterFunctionOrClassNameBlock(className, false, state);

	// Create block for `super` target (but don't enter it yet).
	// `super` block is child of name block as `extends` clause and method/property
	// computed keys can access class name, but not `super`.
	// NB Binding for `super` target is created lazily when a use of `super` is encountered.
	const superBlock = createBlock(className, false, state);

	// Create function (but don't enter it yet)
	const fn = createFunction(createBlockId(state), classNode, true, state);

	// Get block ID for inner name block in case it's needed
	const innerNameBlockId = createBlockId(state);

	// Enter strict mode
	state.isStrict = true;

	// Visit `extends` clause
	const hasSuperClass = !!classNode.superClass;
	if (hasSuperClass) {
		fn.hasSuperClass = true;
		visitKey(classNode, 'superClass', Expression, state);
	}

	// Visit class body. Visited in this order:
	// 1. Class constructor
	// 2. Prototype properties
	// 3. Static properties and static blocks
	// 4. Methods
	// 5. Computed method/property keys
	// Class constructor and prototype properties are processed within class.
	// Methods, static blocks and static properties are processed as within class's parent function.
	// Computed keys are processed as within class's parent function and parent super block.

	// Split class body members into categories
	const methodIndexes = [],
		protoPropertyIndexes = [],
		staticPropertyOrBlockIndexes = [],
		computedKeys = [];
	let constructorIndex, constructorNode;
	const memberNodes = classNode.body.body;
	memberNodes.forEach((memberNode, index) => {
		const {type} = memberNode;
		if (type === 'ClassMethod') {
			if (memberNode.kind === 'constructor') {
				constructorIndex = index;
				constructorNode = memberNode;
			} else {
				if (memberNode.computed) computedKeys.push({memberNode, index});
				methodIndexes.push(index);
			}
		} else if (type === 'ClassPrivateMethod') {
			// TODO Will be missed out when serializing.
			// Flag the class that it has private methods so serialization can throw error?
			methodIndexes.push(index);
		} else if (type === 'ClassProperty') {
			if (memberNode.computed) computedKeys.push({memberNode, index});
			if (memberNode.static) {
				staticPropertyOrBlockIndexes.push(index);
			} else {
				protoPropertyIndexes.push(index);
			}
		} else if (type === 'ClassPrivateProperty') {
			// TODO Will be missed out when serializing.
			// Flag the class that it has private properties so serialization can throw error?
			if (memberNode.static) {
				staticPropertyOrBlockIndexes.push(index);
			} else {
				protoPropertyIndexes.push(index);
			}
		} else {
			assert(type === 'StaticBlock', `Unexpected class body member type '${memberNode.type}'`);
			staticPropertyOrBlockIndexes.push(index);
		}
	});

	// Enter `super` block
	state.currentBlock = state.currentSuperBlock = superBlock;

	// Create blocks for constructor params and body.
	const constructorParamsBlock = createAndEnterBlock(className, false, state),
		constructorBodyBlock = createBlock(className, true, state);
	constructorParamsBlock.varsBlock = constructorBodyBlock;

	// Visit constructor and prototype properties
	let protoThisBlock;
	if (constructorNode || protoPropertyIndexes.length !== 0) {
		// Enter function
		state.currentFunction = fn;
		state.trail = ['body', 'body'];
		state.currentSuperIsProto = true;

		// Visit constructor
		if (constructorNode) {
			visitKey(
				memberNodes, constructorIndex,
				() => visitClassConstructor(
					constructorNode, fn, constructorParamsBlock, constructorBodyBlock, state
				),
				state
			);
		}

		// Visit prototype properties
		if (protoPropertyIndexes.length !== 0) {
			// Create and enter block for `this` in the context of prototype properties
			// TODO This should be a vars block and all prototype methods should be wrapped
			// in closures. See https://github.com/overlookmotel/livepack/issues/305
			state.currentBlock = superBlock;
			protoThisBlock = createAndEnterBlock(className, false, state);
			createThisBinding(protoThisBlock);
			state.currentThisBlock = protoThisBlock;

			for (const index of protoPropertyIndexes) {
				visitKey(memberNodes, index, ClassPropertyMaybePrivate, state);
			}
		}

		// Exit function
		state.currentFunction = parentFunction;
		state.trail = externalTrail;
	}

	// Enter class body container (applies to methods, computed keys, static properties, static blocks)
	externalTrail.push('body', 'body');

	// Visit static properties and static blocks
	if (staticPropertyOrBlockIndexes.length !== 0) {
		// Create and enter block for `this` in the context of static properties
		state.currentBlock = superBlock;
		const staticThisBlock = createAndEnterBlock(className, false, state);
		createThisBinding(staticThisBlock);
		state.currentThisBlock = staticThisBlock;
		state.currentSuperIsProto = false;

		for (const index of staticPropertyOrBlockIndexes) {
			visitKey(memberNodes, index, ClassStaticPropertyOrBlock, state);
		}
	}

	// Visit methods
	if (methodIndexes.length !== 0) {
		state.currentBlock = superBlock;
		// NB `state.currentThisBlock` is not relevant for methods as they create their own `this` block.
		// `ClassMethodMaybePrivate` visitor sets `state.currentSuperIsProto` for each method.
		for (const index of methodIndexes) {
			visitKey(memberNodes, index, ClassMethodMaybePrivate, state);
		}
	}

	// Exit `super` and `this` blocks
	state.currentThisBlock = parentThisBlock;
	state.currentSuperBlock = parentSuperBlock;
	state.currentSuperIsProto = parentSuperIsProto;

	// Visit computed keys
	// TODO Pass values of computed prototype property keys to serializer so it can recreate them
	if (computedKeys.length !== 0) {
		state.currentBlock = nameBlock || parentBlock;
		for (const {memberNode, index} of computedKeys) {
			externalTrail.push(index, 'key');
			Expression(memberNode.key, state, memberNode, 'key');
			externalTrail.length -= 2;
		}
	}

	// Serialize class AST
	const astJson = serializeClassAst(classNode, constructorNode, constructorIndex);

	// If constructor or a prototype property contains `eval()`, make class name internal to class.
	// Achieved by inserting an extra block between `super` block and constructor params
	// + prototype `this` blocks. This block has a binding for class name added to it.
	if (className && fn.containsEval) {
		state.currentBlock = superBlock;
		const innerNameBlock = createBlockWithId(innerNameBlockId, className, false, state);
		constructorParamsBlock.parent = innerNameBlock;
		if (protoThisBlock) protoThisBlock.parent = innerNameBlock;
		innerNameBlock.bindings[className] = nameBlock.bindings[className];
	}

	// If class has super class but no existing constructor, activate super block.
	// Constructor will be added in 2nd pass, and will contain `super()`.
	if (hasSuperClass && !constructorNode) recordSuper(superBlock, fn, state);

	// Exit class body
	state.currentBlock = parentBlock;
	externalTrail.length -= 2;
	if (!parentIsStrict) state.isStrict = false;

	// Insert tracking comment
	insertTrackerComment(fn.id, FN_TYPE_CLASS, classNode, 'inner', state);

	// Temporarily remove from AST so is not included in parent function's serialized AST
	parent[key] = null;

	// Queue instrumentation of class in 2nd pass
	state.secondPass(
		instrumentClass,
		classNode, fn, parent, key, constructorNode, constructorParamsBlock, constructorBodyBlock,
		superBlock, astJson, state
	);

	return fn;
}

/**
 * Visit class constructor.
 * @param {Object} node - Class constructor AST node
 * @param {Object} fn - Function object
 * @param {Object} paramsBlock - Constructor params block object
 * @param {Object} bodyBlock - Constructor body block object
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitClassConstructor(node, fn, paramsBlock, bodyBlock, state) {
	// NB No need to check for existence of param called `arguments`,
	// as this is illegal in strict mode, and classes are always strict.
	createThisBinding(paramsBlock);
	createArgumentsBinding(paramsBlock, true, []);
	state.currentThisBlock = paramsBlock;

	// Visit constructor
	visitFunctionParamsAndBody(fn, node, bodyBlock, true, state);

	// `Super` visitor will set `fn.firstSuperStatementIndex` to `-1` if `super()` is used
	// in a position which isn't a top-level statement. Amend to `undefined` in this case.
	if (fn.firstSuperStatementIndex === -1) fn.firstSuperStatementIndex = undefined;
}

/**
 * Visitor for class methods and class private methods.
 * @param {Object} node - Class method or class private method AST node
 * @param {Object} state - State object
 * @param {Array} parent - Class body container
 * @param {number} key - Method node's index on class body container
 * @returns {undefined}
 */
function ClassMethodMaybePrivate(node, state, parent, key) {
	// Get method name
	let keyIsComputed, fnName;
	if (node.type === 'ClassPrivateMethod') {
		keyIsComputed = false;
		fnName = node.key.id.name;
	} else {
		keyIsComputed = node.computed;
		fnName = keyIsComputed ? undefined : getMethodName(node);
	}

	// Set whether `super` is prototype `super`.
	// No need to reset after as will be set again by next method.
	state.currentSuperIsProto = !node.static;

	// Don't visit `key` as has been dealt with separately above
	visitMethod(node, parent, key, fnName, true, false, keyIsComputed, state);
}

/**
 * Visitor for class static property or static block.
 * @param {Object} node - Class static property or static block AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function ClassStaticPropertyOrBlock(node, state) {
	if (node.type === 'StaticBlock') {
		StaticBlock(node, state);
	} else {
		ClassPropertyMaybePrivate(node, state);
	}
}

/**
 * Visitor for class property or class private property.
 * Can be prototype or static property.
 * @param {Object} node - Class property or private property AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function ClassPropertyMaybePrivate(node, state) {
	// Don't visit `key` as has been dealt with separately above
	visitKeyMaybe(node, 'value', Expression, state);
}

/**
 * Visitor for class static block.
 * @param {Object} node - Class static block AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function StaticBlock(node, state) {
	// `var` declarations in a static block are hoisted to top level within the static block
	const parentBlock = state.currentBlock,
		parentHoistBlock = state.currentHoistBlock;
	state.currentHoistBlock = createAndEnterBlock('staticBlock', false, state);

	visitKeyContainer(node, 'body', Statement, state);

	state.currentBlock = parentBlock;
	state.currentHoistBlock = parentHoistBlock;
}

/**
 * Serialize class AST to JSON.
 * Remove 'use strict' directives from constructor if present.
 * Do not mutate the node passed in, to ensure these changes only affect the serialized AST,
 * and not the instrumented output.
 * @param {Object} classNode - Class AST node
 * @param {Object} [constructorNode] - Class constructor AST node if present
 * @param {number} [constructorIndex] - Index if class constructor if present
 * @returns {string} - Function AST as JSON
 */
function serializeClassAst(classNode, constructorNode, constructorIndex) {
	// Remove 'use strict' directives in constructor
	if (constructorNode) {
		const alteredConstructorNode = removeUnnecessaryUseStrictDirectives(constructorNode, true);
		if (alteredConstructorNode) {
			const classBodyNode = classNode.body,
				memberNodes = [...classBodyNode.body];
			memberNodes[constructorIndex] = alteredConstructorNode;
			classNode = {...classNode, body: {...classBodyNode, body: memberNodes}};
		}
	}

	// Stringify AST to JSON
	return JSON.stringify(classNode);
}

/**
 * Instrument class.
 * @param {Object} classNode - Class declaration or expression AST node
 * @param {Object} fn - Function object for class
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {Object} [constructorNode] - Class constructor AST node (or `undefined` if no constructor)
 * @param {Object} constructorParamsBlock - Constructor params block object
 * @param {Object} constructorBodyBlock - Constructor body block object
 * @param {Object} superBlock - `super` target block object
 * @param {string} astJson - JSON-stringified class AST
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentClass(
	classNode, fn, parent, key, constructorNode, constructorParamsBlock, constructorBodyBlock,
	superBlock, astJson, state
) {
	// If class has no constructor, create one for tracker code to be inserted in
	if (!constructorNode) {
		constructorNode = createClassConstructor(fn, state);
		classNode.body.body.push(constructorNode);
	}

	// Wrap with var for `super` target if `super` used in class
	const superVarNode = getSuperVarNode(superBlock);
	if (superVarNode) {
		classNode = wrapClassWithSuperTargetVar(classNode, parent, key, superBlock, superVarNode, state);
	}

	// Restore to original place in AST
	parent[key] = classNode;

	// Add tracker code + block vars to constructor
	instrumentFunctionOrClassConstructor(
		constructorNode, fn, constructorParamsBlock, constructorBodyBlock, astJson, state
	);

	// TODO Handle prototype properties
}

/**
 * Create empty class constructor node.
 * It will be instrumented by `instrumentFunctionOrClassConstructor()`, same as a real constructor.
 * @param {Object} fn - Function object for class
 * @param {Object} state - State object
 * @returns {Object} - Class constructor AST node
 */
function createClassConstructor(fn, state) {
	// If extends a super class: `constructor(...livepack_temp_4) { super(...livepack_temp_4); }`
	// Otherwise: `constructor() {}`
	let paramNodes, bodyNode;
	if (fn.hasSuperClass) {
		const argsVarNode = createTempVarNode(state);
		paramNodes = [t.restElement(argsVarNode)];
		bodyNode = t.blockStatement([
			t.expressionStatement(t.callExpression(t.super(), [t.spreadElement(argsVarNode)]))
		]);
	} else {
		paramNodes = [];
		bodyNode = t.blockStatement([]);
	}

	return t.classMethod('constructor', t.identifier('constructor'), paramNodes, bodyNode);
}

/**
 * Wrap class declaration / class expression to capture value of class in temp var,
 * which can be used in tracker functions to pass `super` target to serializer.
 * @param {Object} classNode - Class declaration or class expression AST node
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {Object} superBlock - `super` target block object
 * @param {Object} superVarNode - Temp var node for `super` target
 * @param {Object} state - State object
 * @returns {Object} - Wrapped AST node
 */
function wrapClassWithSuperTargetVar(classNode, parent, key, superBlock, superVarNode, state) {
	return classNode.type === 'ClassDeclaration'
		? getClassDeclarationReplacement(classNode, superVarNode)
		: getClassExpressionReplacement(classNode, parent, key, superVarNode, superBlock, state);
}

/**
 * Convert class declaration to var declaration.
 * `class X { foo() { super.foo() } }` -> `let X = temp_1 = class X { foo() { super.foo() } };`
 * @param {Object} classNode - Class declaration or expression AST node
 * @param {Object} superVarNode - Identifier node for temp var for super target
 * @returns {Object} - Replacement AST node
 */
function getClassDeclarationReplacement(classNode, superVarNode) {
	classNode.type = 'ClassExpression';
	return t.variableDeclaration(
		'let', [t.variableDeclarator(classNode.id, t.assignmentExpression('=', superVarNode, classNode))]
	);
}

/**
 * Wrap class expression.
 * If is an unnamed class, preserve implicit name.
 * @param {Object} classNode - Class declaration or expression AST node
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Key for class node on parent AST node/container
 * @param {Object} superVarNode - Identifier node for temp var for super target
 * @param {Object} superBlock - `super` target block object
 * @param {Object} state - State object
 * @returns {Object} - Replacement AST node
 */
function getClassExpressionReplacement(classNode, parent, key, superVarNode, superBlock, state) {
	return t.assignmentExpression(
		'=',
		superVarNode,
		classNode.id
			? classNode
			: wrapAnonymousClassExpression(classNode, parent, key, superBlock, state)
	);
}

/**
 * Wrap unnamed class expression to ensure class name is preserved
 * if was gained implicitly from assignment.
 * Using object prop to provide class name rather than setting directly, as that
 * would add a variable to scope which could potentially interfere with a var
 * with same name in an upper scope.
 * `let X = class {};` -> `let X = temp_1 = { X: class {} }.X;`
 * `const o = { [fn()]: class {} };`
 * -> `const o = { [temp_2 = fn() + '']: temp_1 = { [temp_2]: class {} }[temp_2] } };`
 *
 * @param {Object} classNode - Class declaration or expression AST node
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Key for class node on parent AST node/container
 * @param {Object} superBlock - `super` target block object
 * @param {Object} state - State object
 * @returns {Object} - Wrapped AST node
 */
function wrapAnonymousClassExpression(classNode, parent, key, superBlock, state) {
	if (key === 'right') {
		if (
			parent.type === 'AssignmentExpression' && isNamingAssignmentOperator(parent.operator)
		) {
			const leftNode = parent.left;
			if (leftNode.type === 'Identifier') {
				// `X = class {}` -> `X = temp_1 = {X: class {}}.X`
				return wrapInNamingObject(classNode, leftNode, false, false);
			}
		}
	} else if (key === 'init') {
		if (parent.type === 'VariableDeclarator') {
			const assignedToNode = parent.id;
			if (assignedToNode.type === 'Identifier') {
				// `const x = class {};` -> `const X = temp_1 = {X: class {}}.X;`
				return wrapInNamingObject(classNode, assignedToNode, false, false);
			}
		}
	} else if (key === 'value') {
		const parentType = parent.type;
		if (parentType === 'ObjectProperty') {
			const keyNode = parent.key;
			if (!parent.computed) {
				// `{ foo: class {} }` -> `{ foo: temp_1 = { foo: class {} }.foo } }`
				// `{ 123: class {} }` -> `{ 123: temp_1 = { 123: class {} }[123] } }`
				return wrapInNamingObject(classNode, keyNode, false, keyNode.type !== 'Identifier');
			}

			if (isLiteralTypeWithNoSideEffects(keyNode.type)) {
				// `{ [123]: class {} }` -> `{ [123]: temp_1 = { [123]: class {} }[123] }`
				return wrapInNamingObject(classNode, keyNode, true, true);
			}

			// Key is expression which may have side effects.
			// Create temp var to hold key, to prevent expression being evaluated multiple times.
			// `+ ''` is added in case `.toString()` method has side effects,
			// so need to prevent it being called multiple times too.
			// `{ [f()]: class {} }` -> `{ [temp_2 = fn() + '']: temp_1 = { [temp_2]: class {} }[temp_2] }`
			// TODO Conversion to string won't work for Symbols.
			// Needs to be `{ [temp_2 = livepack_getKey(fn())]: temp_1 = { [temp_2]: class {} }[temp_2] }`
			// where `livepack_getKey` is defined as:
			// `k => (typeof k === 'symbol' || require('util').types.isSymbolObject(k)) ? k : k + '';`
			const idNode = createBlockTempVar(superBlock, state);
			parent.key = t.assignmentExpression(
				'=',
				idNode,
				t.binaryExpression('+', keyNode, t.stringLiteral(''))
			);
			return wrapInNamingObject(classNode, idNode, true, true);
		}

		if (parentType === 'ClassPrivateProperty') {
			// `class X { #foo = class {} }` -> `class X { #foo = temp_1 = { '#foo': class {} }['#foo'] } }`
			return wrapInNamingObject(
				classNode, t.stringLiteral(`#${parent.key.id.name}`), true, true
			);
		}

		if (parentType === 'ClassProperty' && !parent.computed) {
			// `class X { foo = class {} }` -> `class X { foo = temp_1 = { foo: class {} }.foo }`
			// `class X { 123 = class {} }` -> `class X { 123 = temp_1 = { 123: class {} }[123] }`
			// NB Unlike object properties, computed key in class property does not name class.
			// `(class { static ['x'] = class {} } ).x.name === ''`
			// and `new (class { ['x'] = class {} })().x.name === ''`
			// TODO Add tests for this.
			const keyNode = parent.key;
			return wrapInNamingObject(classNode, keyNode, false, keyNode.type !== 'Identifier');
		}
	}

	// Class will remain anonymous.
	// `class {}` -> `temp_3 = (0, class {})`
	return t.sequenceExpression([t.numericLiteral(0), classNode]);
}

/**
 * Wrap class expression in an object to preserve implicit name.
 * `C = class {}` -> `C = temp_3 = { C: class {} }.C`
 * @param {Object} classNode - Class expression AST node
 * @param {Object} keyNode - Object key / accessor AST node
 * @param {boolean} keyIsComputed - `true` if key needs to be computed
 * @param {boolean} accessIsComputed - `true` if accessor needs to be computed
 * @returns {Object} - Wrapped AST node
 */
function wrapInNamingObject(classNode, keyNode, keyIsComputed, accessIsComputed) {
	return t.memberExpression(
		t.objectExpression([t.objectProperty(keyNode, classNode, keyIsComputed)]),
		keyNode,
		accessIsComputed
	);
}

/**
 * Check if AST node type is a literal with no side effects.
 * This is all literals except `TemplateLiteral`.
 * @param {string} type - AST node type
 * @returns {boolean} - `true` if is a literal type with no side effects
 */
function isLiteralTypeWithNoSideEffects(type) {
	return type === 'StringLiteral' || type === 'NumericLiteral' || type === 'BooleanLiteral'
		|| type === 'NullLiteral' || type === 'RegExpLiteral' || type === 'BigIntLiteral'
		|| type === 'DecimalLiteral';
}

/**
 * Determine if an assignment operator names a class on right-hand side of assignment.
 * @param {string} operator - Operator
 * @returns {boolean} - `true` if this assignment operator names a class on right-hand side
 */
function isNamingAssignmentOperator(operator) {
	return operator === '=' || operator === '&&=' || operator === '||=' || operator === '??=';
}
