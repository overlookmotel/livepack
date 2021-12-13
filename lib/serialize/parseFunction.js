/* --------------------
 * livepack module
 * Parse function code
 * ------------------*/

'use strict';

// Modules
const traverse = require('@babel/traverse').default,
	{isString, isArray, isObject} = require('is-it-type'),
	last = require('lodash/last'),
	t = require('@babel/types');

// Imports
const {identifierIsVariable} = require('../shared/functions.js'),
	{
		internalIdentifier, flagAsInternal, isInternalNode, isJsIdentifier, isNumberKey
	} = require('./utils.js'),
	{isReservedVarName, isRuntimePath} = require('../shared/functions.js');

// Exports

/**
 * Parse function code to AST and identify nodes referring to external variables.
 * @param {Function} fn - Function
 * @param {Function} getAst - Function to get AST
 * @param {string} filename - File path
 * @param {Set<string>} externalVarNames - Names of external vars
 * @param {Set<string>} constVarNames - Names of const external vars
 * @param {Set<string>} constInStrictVarNames - Names of external vars which throw error
 *   if assigned to in strict mode only
 * @param {boolean} isClass - `true` if is a class
 * @param {boolean} isAsync - `true` if is an async function
 * @param {boolean} isGenerator - `true` if is a generator function
 * @param {boolean} isStrict - `true` if is strict mode
 * @param {boolean} containsEval - `true` if function contains `eval()`
 * @param {boolean} superIsProto - `true` if `super` refers to class prototype
 * @param {boolean} sourceMapsEnabled - `true` if source maps enabled
 * @returns {Object} - Object with props:
 *   {Object} .node - AST node for function
 *   {Object} .externalVars - Object keyed by var name, values are arrays of identifier nodes
 *   {Object} .internalVars - Object keyed by var name, values are arrays of identifier nodes
 *   {Set<string>} .globalVarNames - Set of names of global vars used
 *   {Set<string>} .functionNames - Set of function names used
 *   {Set<string>} .readFromVarNames - Set of names of external vars which are read from
 *   {Set<string>} .assignedToVarNames - Set of names of external vars which are assigned to
 *   {string} .name - `.name` of created function
 *   {number} .numParams - `.length` of created function
 *   {boolean} .isClass - `true` if is class
 *   {boolean} .isAsync - `true` if is async function
 *   {boolean} .isGenerator - `true` if is generator
 *   {boolean} .isArrow - `true` if is arrow function
 *   {boolean} .isMethod - `true` if is a method
 *   {boolean|null} .isStrict - `true` if is strict mode, `false` if sloppy, `null` if indeterminate
 *     (classes and runtime functions are indeterminate)
 *   {boolean} .containsEval - `true` if contains direct `eval()`
 */
module.exports = function parseFunction(
	fn, getAst, filename, externalVarNames, constVarNames, constInStrictVarNames,
	isClass, isAsync, isGenerator, isStrict, containsEval, superIsProto, sourceMapsEnabled
) {
	// Get AST
	let node;
	if (!sourceMapsEnabled) {
		node = resolveAst(getAst, undefined, undefined);
	} else {
		let sourceFiles;
		if (!this.filesHaveSourcesFor.has(filename)) {
			this.filesHaveSourcesFor.add(filename);
			sourceFiles = this.sourceFiles;
		}
		node = resolveAst(getAst, filename, sourceFiles);
	}

	// Prep function for traversal
	const isMethod = t.isMethod(node);
	let programNode = node,
		{params} = node;
	if (isMethod) {
		if (node.type === 'ClassMethod') {
			node.type = 'ObjectMethod';
			if (node.static) node.static = false;
		}

		// Convert getter/setter to plain method
		node.kind = 'method';

		// Remove computed key i.e. `[a]() {}` -> `x() {}`
		if (node.computed) {
			node.key = t.identifier('x');
			node.computed = false;
		}

		programNode = t.objectExpression([node]);
	} else if (isClass) {
		if (node.type === 'ClassDeclaration') node.type = 'ClassExpression';

		// Remove all methods except constructor
		let ctorNode = node.body.body.find(methodNode => methodNode.kind === 'constructor');
		if (node.superClass) {
			// Remove `extends`
			node.superClass = null;

			// Add constructor if none present
			if (!ctorNode) {
				ctorNode = t.classMethod(
					'constructor',
					t.identifier('constructor'),
					[t.restElement(t.identifier('args'))],
					t.blockStatement(
						[t.expressionStatement(t.callExpression(t.super(), [t.spreadElement(t.identifier('args'))]))]
					)
				);
			}
		}

		node.body.body = ctorNode ? [ctorNode] : [];

		params = ctorNode ? ctorNode.params : [];
	} else if (node.type === 'FunctionDeclaration') {
		node.type = 'FunctionExpression';
	}

	programNode = t.file(t.program(
		[t.expressionStatement(programNode)],
		isStrict ? [t.directive(t.directiveLiteral('use strict'))] : []
	));

	// Get nodes for vars and transpile `super`
	const externalVars = Object.create(null),
		internalVars = Object.create(null),
		globalVarNames = new Set(),
		functionNames = new Set(),
		readFromVarNames = new Set(),
		assignedToVarNames = new Set(),
		thisPaths = [],
		strictStack = []; // Strict mode flag pushed on entering function, popped when exiting
	let topFunctionPath, // Will be set to path of top level function
		fullFunctionDepth = 0,
		thisReplacementNode,
		containsFunctionNameReferenceWithEval = false,
		currentIsStrict = isStrict; // Whether current function in traversal is strict mode

	traverse(programNode, {
		Class: {
			enter() {
				// Enter strict mode
				strictStack.push(currentIsStrict);
				currentIsStrict = true;
			},
			exit() {
				// Revert to parent strict mode status
				currentIsStrict = strictStack.pop();
			}
		},

		Function: {
			enter(path) {
				// Skip temp functions created by livepack (in transpiling `super.foo = ...`)
				const fnNode = path.node;
				if (isInternalNode(fnNode)) return;

				// Determine if strict mode, and remove 'use strict' directive if unnecessary.
				// NB `currentIsStrict` will be true for top function if top function is strict,
				// so will always remove 'use strict' directive from top function. It will be
				// added again if required when creating scopes.
				// `currentIsStrict` is not updated here. Is updated when entering body block, to avoid
				// getting wrong strict status for a function within dynamic method key (if this is a method).
				strictStack.push(currentIsStrict);

				const bodyNode = fnNode.body;
				if (t.isBlockStatement(bodyNode)) {
					let strictDirectiveIsUnnecessary = currentIsStrict;
					bodyNode.directives = bodyNode.directives.filter(({value: valueNode}) => {
						if (valueNode.value === 'use strict') {
							if (strictDirectiveIsUnnecessary) return false;
							strictDirectiveIsUnnecessary = true;
						}

						// Ensure directive renders with double quotes
						valueNode.extra = undefined;
						return true;
					});
				}

				if (!path.isArrowFunctionExpression()) fullFunctionDepth++;
				if (!topFunctionPath) topFunctionPath = path;

				const idNode = fnNode.id;
				if (idNode && fnNode !== node) functionNames.add(idNode.name);
			},
			exit(path) {
				if (isInternalNode(path.node)) return;
				if (!path.isArrowFunctionExpression()) fullFunctionDepth--;
				currentIsStrict = strictStack.pop();
			}
		},

		BlockStatement(path) {
			// If is function body containing 'use strict' directive, set strict mode flag
			if (
				path.parentPath.isFunction()
				&& path.node.directives.some(directive => directive.value.value === 'use strict')
			) currentIsStrict = true;
		},

		Identifier(path) {
			// Skip `this` and internal var nodes
			const idNode = path.node;
			const {name} = idNode;
			if (name === 'this' || isInternalNode(idNode)) return;

			// Skip identifiers not used as vars e.g. `{a: 1}`
			if (!identifierIsVariable(path)) return;

			// Skip functions' names
			const {parentPath} = path;
			if ((parentPath.isFunction() || parentPath.isClass()) && path.key === 'id') return;

			// Add to internal / external vars
			// Is external if:
			// 1. not bound within function and
			// 2. not `arguments` which refers to outside function
			const binding = path.scope.getBinding(name);
			if (binding) {
				// Skip if binding is function name - will not be renamed - tracked in `functionNames` instead
				const bindingPath = binding.path;
				if (!bindingPath.isFunction() && !bindingPath.isClass()) {
					addToVars(name, idNode, internalVars);
					return;
				}

				if (bindingPath.node !== node) return;

				// Reference to name of function being serialized. Record this.
				// If not treated as an external var (function expressions), will need to freeze it.
				if (containsEval) {
					containsFunctionNameReferenceWithEval = true;
					if (!externalVarNames.has(name)) return;
				}
			}

			if (name !== 'arguments' || fullFunctionDepth === 0) {
				if (externalVarNames.has(name)) {
					// Record if var is being read from / assigned to.
					// If is const being assigned to, replace with code to throw error.
					let isReadFrom = false,
						isAssignedTo = false;
					if (parentPath.isAssignmentExpression() && path.key === 'left') {
						// Assignment - `=`, `+=`, `&&=`
						const {operator} = parentPath.node;
						if (constVarNames.has(name)) {
							if (operator === '=') {
								// `c = x` -> `x, throw()`
								parentPath.replaceWith(createConstViolationThrowNode(
									parentPath.node.right, name, constInStrictVarNames, currentIsStrict
								));
							} else if (['&&=', '||=', '??='].includes(operator)) {
								// `c &&= x` -> `c && (x, throw())`
								parentPath.replaceWith(
									t.logicalExpression(
										operator.slice(0, -1),
										idNode,
										createConstViolationThrowNode(
											parentPath.node.right, name, constInStrictVarNames, currentIsStrict
										)
									)
								);
								isReadFrom = true;
							} else {
								// Other assignment operator e.g. `+=`, `-=`, `>>>=`
								// `c += x` -> `c + x, throw()`
								parentPath.replaceWith(createConstViolationThrowNode(
									t.binaryExpression(
										operator.slice(0, -1),
										idNode,
										parentPath.node.right
									),
									name, constInStrictVarNames, currentIsStrict
								));
								isReadFrom = true;
							}
						} else {
							isReadFrom = operator !== '=';
							isAssignedTo = true;
						}
					} else if (parentPath.isUpdateExpression()) {
						// `v++` / `++v` / `v--` / `--v`
						isReadFrom = true;
						if (constVarNames.has(name)) {
							// `c++` -> `+c, throw()`
							parentPath.replaceWith(createConstViolationThrowNode(
								t.unaryExpression('+', idNode), name, constInStrictVarNames, currentIsStrict
							));
						} else {
							isAssignedTo = true;
						}
					} else if (parentPath.isForXStatement() && path.key === 'left') {
						// `for (v in {x: 1}) {}` / `for (v of [1, 2, 3]) {}`
						if (constVarNames.has(name)) {
							// `for (c in {x: 1}) { foo(); }`
							// -> `for ({ set a(v) { const c = 0; c = 0; } }.a in {x: 1}) { foo(); }`
							path.replaceWith(
								createConstViolationThrowAssignNode(name, constInStrictVarNames, currentIsStrict)
							);
						} else {
							isAssignedTo = true;
						}
					} else if (
						parentPath.isArrayPattern()
						|| parentPath.isRestElement()
						|| (
							parentPath.isObjectProperty()
							&& path.key === 'value'
							&& parentPath.parentPath.isObjectPattern()
						)
					) {
						// `[v] = []` / `{v} = {}` / `[...v] = []` / `{...v} = {}`
						if (constVarNames.has(name)) {
							// `[c] = [1]` -> `[{set a(v) { const c = 0; c = 0; }}.a] = [1]`
							// `{x: c} = {}` -> `{x: {set a(v) { const c = 0; c = 0; }}.a} = {}`
							// `[...c] = []` -> `[...{set a(v) { const c = 0; c = 0; }}.a] = []`
							path.replaceWith(
								createConstViolationThrowAssignNode(name, constInStrictVarNames, currentIsStrict)
							);
						} else {
							isAssignedTo = true;
						}
					} else {
						isReadFrom = true;
					}

					if (isReadFrom) readFromVarNames.add(name);
					if (isAssignedTo) assignedToVarNames.add(name);
					if (isReadFrom || isAssignedTo) addToVars(name, idNode, externalVars);
				} else {
					// TODO `eval` can also be an external var in sloppy mode
					if (
						name === 'eval' && parentPath.isCallExpression() && path.key === 'callee'
						&& parentPath.node.arguments.length !== 0
					) {
						// Flag all external vars not shadowed within function as read from and assigned to
						for (const varName of externalVarNames) {
							if (!parentPath.scope.getBinding(varName)) {
								readFromVarNames.add(varName);
								if (!constVarNames.has(varName)) assignedToVarNames.add(varName);
							}
						}
					}

					globalVarNames.add(name);
				}
			}
		},

		ThisExpression(path) {
			if (fullFunctionDepth === 0) {
				// Add to external vars - `this` refers to `this` from a higher function.
				// If 'this' is not listed in external vars this must be a top-level function
				// where `this` is global.
				if (externalVarNames.has('this')) {
					path.replaceWith(t.identifier('this'));
					addToVars('this', path.node, externalVars);
					readFromVarNames.add('this');
				}
			} else if (fullFunctionDepth === 1) {
				if (thisReplacementNode) {
					// Replace `this` with `this$0` in class constructor
					path.replaceWith(thisReplacementNode);
				} else {
					// Store reference to path in case needs to be replaced by `this$0` later
					thisPaths.push(path);
				}
			}
		},

		Super(path) {
			// Skip if `super` in nested function
			if (fullFunctionDepth > ((isMethod || isClass) ? 1 : 0)) return;

			// Determine if `super()` call or `super.prop` / `super[prop]`.
			const expressionPath = path.parentPath,
				expressionNode = expressionPath.node,
				{parentPath} = expressionPath;
			const isSuperCall = expressionPath.isCallExpression() && path.key === 'callee';

			// Create `super` var node
			const superVarNode = t.identifier('super');

			// Create `Reflect` + `Object` nodes and declare as globals
			const reflectNode = internalIdentifier('Reflect'),
				objectNode = internalIdentifier('Object');
			globalVarNames.add('Reflect');
			globalVarNames.add('Object');

			if (!isSuperCall) {
				// `super.prop` / `super[prop]` / `super.prop(...)` / `super[prop](...)` /
				// `super.prop = ...` / `super[prop] = ...`
				let propNode = expressionNode.property;
				if (!expressionNode.computed) propNode = t.stringLiteral(propNode.name);

				// `Reflect.get(Object.getPrototypeOf(Klass.prototype), 'prop', this)`
				let replacementNode = t.callExpression(
					t.memberExpression(reflectNode, t.identifier('get')),
					[
						t.callExpression(
							t.memberExpression(objectNode, t.identifier('getPrototypeOf')),
							[
								superIsProto
									? t.memberExpression(superVarNode, t.identifier('prototype'))
									: superVarNode
							]
						),
						propNode,
						t.thisExpression()
					]
				);

				// Convert `super.prop = ...`
				// to `Reflect.set(Object.getPrototypeOf(Klass.prototype), 'prop', value, this)`
				if (parentPath.isAssignmentExpression() && expressionPath.key === 'left') {
					// Convert `Reflect.get(...)` to `Reflect.set(...)`
					replacementNode.callee.property.name = 'set';

					const valueNode = parentPath.node.right;
					if (parentPath.parentPath.isExpressionStatement()) {
						// Standalone expression - add value to `Reflect.set()` arguments
						replacementNode.arguments.splice(2, 0, valueNode);
					} else {
						// Not standalone expression - wrap to return value.
						// `x = super.foo = y();` =>
						// `x = ((temp, temp$0) => (Reflect.set(..., temp, temp$0, this), temp$0))('foo', y());`

						// Create temp vars.
						// NB Prop name expression is injected as temp var as it could be a complex expression
						// referencing many vars. Evaluating it outside the temp closure ensures no var name clashes.
						const propTempNode = t.identifier('temp'),
							valTempNode = t.identifier('temp$0');
						replacementNode.arguments[1] = propTempNode;
						replacementNode.arguments.splice(2, 0, valTempNode);
						replacementNode = t.callExpression(
							// Flag function as internal to prevent being mangled by function visitor
							flagAsInternal(t.arrowFunctionExpression(
								[propTempNode, valTempNode],
								t.sequenceExpression([replacementNode, valTempNode])
							)),
							[propNode, valueNode]
						);
					}

					parentPath.replaceWith(replacementNode);
					return;
				}

				// Convert `super.prop(...)` to `.call(this, ...)`
				if (parentPath.isCallExpression()) {
					replacementNode = t.memberExpression(replacementNode, t.identifier('call'));
					parentPath.unshiftContainer('arguments', t.thisExpression());
				}

				expressionPath.replaceWith(replacementNode);
				return;
			}

			// `super()`

			// Transpile to `Reflect.construct(Object.getPrototypeOf(Klass), [...], Klass)`.
			const argumentsNodes = expressionNode.arguments;
			const transpiledSuperNode = t.callExpression(
				t.memberExpression(reflectNode, t.identifier('construct')),
				[
					t.callExpression(
						t.memberExpression(objectNode, t.identifier('getPrototypeOf')),
						[superVarNode]
					),
					argumentsNodes.length === 1 && t.isSpreadElement(argumentsNodes[0])
						? argumentsNodes[0].argument
						: t.arrayExpression(argumentsNodes),
					superVarNode
				]
			);

			// If is `return super()`, just substitute transpiled super
			if (parentPath.isReturnStatement()) {
				expressionPath.replaceWith(transpiledSuperNode);
				return;
			}

			if (!thisReplacementNode) {
				// First time `super()` encountered in this function.
				// Determine if `super()` is top-level statement in function (i.e. not in a nested block).
				const bodyPath = topFunctionPath.get('body');
				const superIsTopLevel = parentPath.isExpressionStatement()
					&& parentPath.parentPath === bodyPath;

				// If `super()` is last statement in function body, replace with `return <transpiled super>`
				if (superIsTopLevel && last(bodyPath.node.body) === parentPath.node) {
					parentPath.replaceWith(t.returnStatement(transpiledSuperNode));
					return;
				}

				// Create var for `this$0`.
				// It will be renamed from `this` to `this$0` in `processBlock()`.
				// Set as internal var manually as recognising binding in `Identifier` visitor doesn't work.
				thisReplacementNode = t.identifier('this');
				internalVars[thisReplacementNode.name] = [thisReplacementNode];

				// Replace instances of `this` already parsed.
				// Can happen in cases where parse order is different from execution order
				// e.g. `const fn = () => this; super(); this.a = fn();`
				// e.g. `const {a = this} = super();`
				thisPaths.forEach(thisPath => thisPath.replaceWith(thisReplacementNode));

				if (superIsTopLevel) {
					// `super()` is top-level statement - replace with `const this$0 = <transpiled super>`
					parentPath.replaceWith(t.variableDeclaration('const', [
						t.variableDeclarator(thisReplacementNode, transpiledSuperNode)
					]));
				} else {
					// Not top-level statement - result of `super()` will be stored in `this$0`.
					// Insert `let this$0;` at start of block.
					bodyPath.unshiftContainer(
						'body', t.variableDeclaration('let', [t.variableDeclarator(thisReplacementNode)])
					);
				}

				// Insert `return this$0;` at end of block
				bodyPath.pushContainer('body', t.returnStatement(thisReplacementNode));

				if (superIsTopLevel) return;
			}

			// Replace with `this$0 = <transpiled super>`
			expressionPath.replaceWith(
				t.assignmentExpression('=', thisReplacementNode, transpiledSuperNode)
			);
		},

		Import() {
			throw new Error(`Cannot serialize function containing \`import\` (${fn.name ? `function '${fn.name}'` : 'anonymous function'} in '${filename}')`);
		}
	});

	// Wrap methods in objects, and set name
	const isArrow = t.isArrowFunctionExpression(node);
	let name;
	if (isArrow) {
		name = '';
	} else {
		name = (Object.getOwnPropertyDescriptor(fn, 'name') || {}).value;
		if (!isString(name)) name = '';
	}

	if (isMethod) {
		// Class/object method - wrap in object.
		// NB Must be defined as method, to avoid it having prototype.
		let keyNode, accessComputed;
		if (!name) {
			name = 'a';
			keyNode = t.identifier(name);
			accessComputed = false;
		} else if (isJsIdentifier(name)) {
			keyNode = t.identifier(name);
			accessComputed = false;
		} else {
			keyNode = isNumberKey(name) ? t.numericLiteral(name * 1) : t.stringLiteral(name);
			accessComputed = true;
		}

		node.key = keyNode;
		node = t.memberExpression(t.objectExpression([node]), keyNode, accessComputed);
	} else if (!isArrow) {
		// Set function name
		if (containsFunctionNameReferenceWithEval && !externalVars[name]) {
			// Function expression containing `eval()` and reference to function's name
			// (which may be a potential reference in the `eval()`).
			// Name must be preserved so assignment to function name in `eval()`
			// maintains const violation error behavior (error in strict mode, silent failure in sloppy mode).
			name = node.id.name;
		} else if (name && (
			(!isJsIdentifier(name) || isReservedVarName(name) || globalVarNames.has(name))
			|| containsFunctionNameReferenceWithEval
		)) {
			// Name cannot be used as is illegal, or would block access to an external var / global var
			name = '';
		}

		if (!name) {
			node.id = null;
		} else {
			node.id = t.identifier(name);
			functionNames.add(name);
		}
	}

	// Determine what value of `fn.length` will be
	let numParams = 0;
	for (const paramNode of params) {
		if (t.isRestElement(paramNode) || t.isAssignmentPattern(paramNode)) break;
		numParams++;
	}

	// Return AST for function + external + internal vars objects + function names set
	return {
		node,
		externalVars,
		internalVars,
		globalVarNames,
		functionNames,
		readFromVarNames,
		assignedToVarNames,
		name,
		numParams,
		isClass,
		isAsync,
		isGenerator,
		isArrow,
		isMethod,
		// Classes have indeterminate strict/sloppy status - never require conforming to strict/sloppy
		// as they're automatically strict.
		// Runtime functions are also treated as indeterminate (can be strict or sloppy)
		// unless explicitly strict.
		isStrict: isClass ? null
			: isStrict ? true
				: isRuntimePath(filename) ? null : false,
		containsEval
	};
};

/**
 * Add variable identifier to var names map (either `internalVars` or `externalVars`).
 * @param {string} name - Var name
 * @param {Object} node - Identifier Babel AST node
 * @param {Object} vars - Variables map object, keyed by var name
 * @returns {undefined}
 */
function addToVars(name, node, vars) {
	const nodes = vars[name];
	if (nodes) {
		nodes.push(node);
	} else {
		vars[name] = [node];
	}
}

/**
 * Create expression node which throws 'Assignment to constant variable' TypeError.
 * @param {Object} node - AST node to wrap
 * @param {string} name - Var name
 * @param {Set} constInStrictVarNames - Set of var names which are only const violations in strict mode
 * @param {boolean} isStrict - `true` if this expression is evaluated in strict mode
 * @returns {Object} - AST Node object
 */
function createConstViolationThrowNode(node, name, constInStrictVarNames, isStrict) {
	// If only throws error in strict mode, and this is not in strict mode, return node unchanged
	if (!isConstViolationError(name, constInStrictVarNames, isStrict)) return node;

	// Wrap node in expression which throws a const violation error
	// `(x, (() => { const c = 0; c = 0; })())`
	return t.sequenceExpression([
		node,
		t.callExpression(
			flagAsInternal(t.arrowFunctionExpression([], createConstViolationThrowBlockNode(name))),
			[]
		)
	]);
}

/**
 * Create expression node which throws when assigned to.
 * @param {string} name - Var name
 * @param {Set} constInStrictVarNames - Set of var names which are only const violations in strict mode
 * @param {boolean} isStrict - `true` if this expression is evaluated in strict mode
 * @returns {Object} - AST Node object
 */
function createConstViolationThrowAssignNode(name, constInStrictVarNames, isStrict) {
	// If only throws error in strict mode, and this is not in strict mode,
	// return node for no-op assignment
	if (!isConstViolationError(name, constInStrictVarNames, isStrict)) {
		// `{}.a`
		return t.memberExpression(t.objectExpression([]), t.identifier('a'));
	}

	// `{ set a(v) { const c = 0; c = 0; } }.a`
	return t.memberExpression(
		t.objectExpression([
			flagAsInternal(t.objectMethod(
				'set',
				t.identifier('a'),
				[t.identifier('v')],
				createConstViolationThrowBlockNode(name)
			))
		]),
		t.identifier('a')
	);
}

function createConstViolationThrowBlockNode(name) {
	// `{ const c = 0; c = 0; }`
	return t.blockStatement([
		t.variableDeclaration('const', [t.variableDeclarator(t.identifier(name), t.numericLiteral(0))]),
		t.expressionStatement(t.assignmentExpression('=', t.identifier(name), t.numericLiteral(0)))
	]);
}

function isConstViolationError(name, constInStrictVarNames, isStrict) {
	return isStrict || !constInStrictVarNames.has(name);
}

/**
 * Get AST for function using its `getAST()` function which Babel plugin inserted into code.
 * A function which has other functions nested within it will have left those nodes defined as `null`
 * in JSON-serialized AST. Get those child functions' ASTs from their own `getAst()` functions
 * and insert them into the parent AST.
 * @param {Function} getAst - Function AST getter function
 * @param {string} [filename] - File path to be added to nodes (only needed if source maps enabled)
 * @param {Object} [sourceFiles] - Source files object (only needed if source maps enabled)
 * @returns {Object} - Babel AST for function
 */
function resolveAst(getAst, filename, sourceFiles) {
	// Call `getAst()` function to get function info and parse its payload
	const [json, getChildAsts, getSources] = getAst();
	const {ast: node, childFns: childFnTrails} = JSON.parse(json);

	// Insert child functions' ASTs into this AST
	childFnTrails.forEach((trail, index) => {
		setProp(node, trail, resolveAst(getChildAsts[index], filename, undefined));
	});

	// Set `loc.filename` for all nodes
	if (filename) {
		traverseAll(node, ({loc}) => {
			if (loc && !loc.filename) loc.filename = filename;
		});
	}

	if (sourceFiles) Object.assign(sourceFiles, JSON.parse(getSources()));

	return node;
}

/**
 * Set deep property of object, specified by key trail.
 * Simplified version of `lodash.set()` (https://lodash.com/docs/4.17.15#set).
 * e.g. `setProp({x: [{y: 1}]}, ['x', 0, 'y'], 2)` mutates object to `{x: [{y: 2}]}`
 * @param {Object} obj - Object
 * @param {Array<string|number>} trail - Array of trail segements
 * @param {*} value - Value to set
 * @returns {undefined}
 */
function setProp(obj, trail, value) {
	const lastPathIndex = trail.length - 1;
	for (let i = 0; i < lastPathIndex; i++) {
		obj = obj[trail[i]];
	}
	obj[trail[lastPathIndex]] = value;
}

/**
 * Traverse Babel AST, calling callback `fn()` with every node.
 * Unlike Babel's `traverse()`, also traverses over comment nodes.
 * @param {Object} node - Babel AST node
 * @param {Function} fn - Callback function - called `fn(node)` with each node.
 * @returns {undefined}
 */
function traverseAll(node, fn) {
	if (isArray(node)) {
		for (const childNode of node) {
			traverseAll(childNode, fn);
		}
	} else if (isObject(node) && isString(node.type)) {
		fn(node);

		for (const key in node) {
			const childNode = node[key];
			traverseAll(childNode, fn);
		}
	}
}
