/* --------------------
 * livepack module
 * Parse function code
 * ------------------*/

'use strict';

// Modules
const {isString, isArray, isObject} = require('is-it-type'),
	mapValues = require('lodash/mapValues'),
	t = require('@babel/types'),
	assert = require('simple-invariant');

// Imports
const {isJsIdentifier, isNumberKey} = require('./utils.js'),
	{isReservedVarName, createArrayOrPush, setAddFrom, isRuntimePath} = require('../shared/functions.js'),
	{
		SUPER_CALL, SUPER_EXPRESSION, CONST_VIOLATION_CONST, CONST_VIOLATION_FUNCTION_SILENT
	} = require('../shared/constants.js'),
	assertBug = require('../shared/assertBug.js');

// Exports

/**
 * Assemble AST for function code, identify Identifier nodes referring to internal/external variables,
 * replace const violations, transpile `super`, get other info about function.
 * Most of this information is pre-prepared by Babel plugin, just needs some late processing here.
 *
 * @this {Object} Serializer
 * @param {Function} fn - Function
 * @param {number} fnId - Function ID
 * @param {Function} getFunctionInfo - Function info getter function
 * @param {boolean} isClass - `true` if is a class
 * @param {boolean} isAsync - `true` if is an async function
 * @param {boolean} isGenerator - `true` if is a generator function
 * @param {string} filename - File path
 * @returns {Object} - Function definition object with props:
 *   {Object} .node - AST node for function
 *   {Map} .scopeDefs - Scope definitions map, keyed by block ID
 *   {Object} .externalVars - Object keyed by var name, values are arrays of identifier nodes
 *   {Object} .internalVars - Object keyed by var name, values are arrays of identifier nodes
 *   {Set<string>} .globalVarNames - Set of names of global vars used
 *   {Set<string>} .functionNames - Set of function names used
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
 *   {Array<string>|undefined} .argNames - Array of `arguments` var names
 */
module.exports = function parseFunction(
	fn, fnId, getFunctionInfo, isClass, isAsync, isGenerator, filename
) {
	// Get function info and AST from info getter function
	const [fnInfoJson, getChildFnInfos, getSources] = getFunctionInfo();
	const fnInfo = JSON.parse(fnInfoJson);

	// Throw error if function contains `import()`
	assert(
		!fnInfo.containsImport,
		`Cannot serialize function containing \`import\` (${fn.name ? `function '${fn.name}'` : 'anonymous function'} in '${filename}')`
	);

	// Assemble scope definitions
	const scopeDefs = new Map();
	for (const {blockId, blockName, vars} of fnInfo.scopes) {
		scopeDefs.set(blockId, {
			blockName,
			vars: mapValues(
				vars, varProps => ({isReadFrom: !!varProps.isReadFrom, isAssignedTo: !!varProps.isAssignedTo})
			)
		});
	}

	// Add child functions into AST, get external/internal var nodes, and get amendments to be made
	// (const violations / incidences of `super` to be transpiled)
	// If class, remove all child functions except those nested inside constructor.
	// Babel plugin has placed them as first children.
	if (isClass) fnInfo.childFns.length = fnInfo.numClassChildren;

	const externalVars = Object.create(null),
		internalVars = Object.create(null),
		globalVarNames = new Set(),
		functionNames = new Set(),
		amendments = [],
		isClassWithSuperClass = !!fnInfo.hasSuperClass;
	resolveFunctionInfo(
		fnInfo, getChildFnInfos, false, fnId, isClassWithSuperClass, scopeDefs,
		externalVars, internalVars, globalVarNames, functionNames, amendments
	);

	let node = fnInfo.ast;

	// If source maps enabled, add source files to `sourceFiles` map and set `loc.filename` for all nodes.
	// Create `copyLoc()` function to copy location info for AST nodes befing replaced.
	let copyLoc;
	if (this.options.sourceMaps) {
		const {filesHaveSourcesFor} = this;
		if (!filesHaveSourcesFor.has(filename)) {
			Object.assign(this.sourceFiles, JSON.parse(getSources()));
			filesHaveSourcesFor.add(filename);
		}

		traverseAll(node, ({loc}) => {
			if (loc && !loc.filename) loc.filename = filename;
		});

		copyLoc = (destNode, srcNode) => {
			destNode.start = srcNode.start;
			destNode.end = srcNode.end;
			destNode.loc = srcNode.loc;
			return destNode;
		};
	} else {
		copyLoc = destNode => destNode;
	}

	// Get whether strict mode and remove use strict directive
	let isStrict;
	if (!isClass) {
		isStrict = !!fnInfo.isStrict;
		if (isStrict) {
			const bodyNode = node.body;
			if (bodyNode.type === 'BlockStatement') {
				const directiveNodes = bodyNode.directives;
				if (directiveNodes.length !== 0) {
					const useStrictIndex = directiveNodes.findIndex(
						directiveNode => directiveNode.value.value === 'use strict'
					);
					if (useStrictIndex !== -1) directiveNodes.splice(useStrictIndex, 1);
				}
			}
		}

		// Runtime functions are treated as indeterminate strict/sloppy mode unless explicitly strict
		if (!isStrict && isRuntimePath(filename)) isStrict = null;
	}

	// Create `super` var node if required
	let superVarNode;
	if (externalVars.super) {
		superVarNode = t.identifier('super');
		externalVars.super[0] = superVarNode;
		globalVarNames.add('Reflect');
		globalVarNames.add('Object');
	}

	// Conform function/class, get function name
	let isMethod, name, thisVarNode, constructorStatementNodes, firstSuperStatementIndex,
		paramNodes = node.params;
	const {type} = node,
		isArrow = type === 'ArrowFunctionExpression',
		containsEval = !!fnInfo.containsEval;
	if (isArrow) {
		// Arrow function
		name = '';
		isMethod = false;

		// If contains `super`, needs `this` too
		if (externalVars.super) {
			thisVarNode = t.identifier('this');
			externalVars.this.push(thisVarNode);
		}
	} else {
		// Class, method or function declaration/expression.
		// Get function name.
		name = (Object.getOwnPropertyDescriptor(fn, 'name') || {}).value;
		if (!isString(name)) name = '';

		// Identify if method and convert class method to object method
		if (type === 'ClassMethod') {
			node.type = 'ObjectMethod';
			node.static = undefined;
			isMethod = true;
		} else if (type === 'ObjectMethod') {
			isMethod = true;
		}

		if (isMethod) {
			// Class/object method.
			// Convert getter/setter to plain method, and disable computed keys.
			node.kind = 'method';
			node.computed = false;

			// Wrap in object.
			// NB Must be defined as method, to avoid it having prototype.
			let keyNode, accessComputed;
			if (!name) {
				name = 'a';
				keyNode = t.identifier('a');
				accessComputed = false;
			} else if (isJsIdentifier(name)) {
				keyNode = t.identifier(name);
				accessComputed = false;
			} else {
				keyNode = isNumberKey(name) ? t.numericLiteral(name * 1) : t.stringLiteral(name);
				accessComputed = true;
			}

			node.key = copyLoc(keyNode, node.key || {});
			node = t.memberExpression(t.objectExpression([node]), keyNode, accessComputed);

			// `this` within method is actual `this`
			thisVarNode = t.thisExpression();
		} else {
			// Set function name
			const idNode = node.id;
			if (containsEval) {
				// Function contains `eval()`.
				// Cannot change name from original as would create a new var in scope of `eval()`.
				// If is a named function expression, name must be retained, to maintain const violation
				// error behavior (error in strict mode, silent failure in sloppy mode).
				// If is a named function declaration, name must be removed to allow read/write access
				// to external var holding function in upper scope.
				if (idNode) {
					name = idNode.name;
					if (externalVars[name]) name = '';
				} else {
					name = '';
				}
			} else if (
				name && (!isJsIdentifier(name) || isReservedVarName(name) || globalVarNames.has(name))
			) {
				// Name cannot be used as is illegal, or would block access to a global var
				name = '';
			}

			if (!name) {
				node.id = null;
			} else {
				if (!idNode || idNode.name !== name) {
					node.id = t.identifier(name);
					if (idNode) copyLoc(node.id, idNode);
				}
				functionNames.add(name);
			}

			if (isClass) {
				// Class
				if (type === 'ClassDeclaration') node.type = 'ClassExpression';

				// Classes have indeterminate strict/sloppy status - never require conforming to strict/sloppy
				// as they're automatically strict.
				isStrict = null;

				// Remove all methods except constructor
				const methodNodes = node.body.body,
					constructorNode = methodNodes.find(Boolean);
				if (constructorNode) {
					methodNodes[0] = constructorNode;
					methodNodes.length = 1;
					paramNodes = constructorNode.params;
				} else {
					methodNodes.length = 0;
					paramNodes = [];
				}

				if (isClassWithSuperClass) {
					// Remove `extends`
					node.superClass = null;

					// Add constructor if none present
					if (!constructorNode) {
						// `constructor(...args) {
						//   return Reflect.construct(Object.getPrototypeOf(super$0), args, super$0);
						// }`
						const argsVarNode = t.identifier('args');
						internalVars.args = [argsVarNode];
						methodNodes[0] = t.classMethod(
							'constructor',
							t.identifier('constructor'),
							[t.restElement(argsVarNode)],
							t.blockStatement([
								t.returnStatement(
									t.callExpression(
										t.memberExpression(t.identifier('Reflect'), t.identifier('construct')),
										[
											t.callExpression(
												t.memberExpression(t.identifier('Object'), t.identifier('getPrototypeOf')),
												[superVarNode]
											),
											argsVarNode,
											superVarNode
										]
									)
								)
							])
						);
					} else {
						// Class has constructor - prepare for transpiling `super()`
						const thisInternalVars = internalVars.this;
						if (thisInternalVars) {
							// Constructor contains `this` or `super` expression (e.g. `super.foo()`).
							// Var for `this$0` is going to be needed.
							thisVarNode = t.identifier('this');
							thisInternalVars.push(thisVarNode);
						}

						firstSuperStatementIndex = fnInfo.firstSuperStatementIndex;
						constructorStatementNodes = constructorNode.body.body;
					}
				} else {
					// Class which doesn't extend a super class. `this` within constructor is actual `this`.
					thisVarNode = t.thisExpression();
				}
			} else {
				// Function declaration/expression. `this` is actual `this`.
				if (type === 'FunctionDeclaration') node.type = 'FunctionExpression';
				thisVarNode = t.thisExpression();
			}
		}
	}

	// Replace const violations + `super`.
	// Amendments are in reverse order:
	// - Nested functions before their parent.
	// - Within a function, deeper nested expressions/statements before their parent.
	// - Within a function, later statements before earlier statements.
	// Reverse order ensures correct handling of nested amendments
	// e.g. 2 const violations `c = c2 = 1` or const violation + super `super.foo(c = 1)`.
	const superIsProto = isClass || fnInfo.superIsProto;
	for (const amendment of amendments) {
		const {type: amendmentType, trail, trailNodes} = amendment;
		if (amendmentType === SUPER_CALL) {
			replaceSuperCall(
				trail, trailNodes, superVarNode, thisVarNode, firstSuperStatementIndex, copyLoc
			);
		} else if (amendmentType === SUPER_EXPRESSION) {
			replaceSuperExpression(
				trail, trailNodes, superVarNode, thisVarNode, superIsProto, internalVars, copyLoc
			);
		} else if (amendmentType === CONST_VIOLATION_FUNCTION_SILENT) {
			replaceConstViolation(trail, trailNodes, true, internalVars, copyLoc);
		} else {
			// amendmentType === CONST_VIOLATION_CONST || amendmentType === CONST_VIOLATION_FUNCTION_THROWING
			replaceConstViolation(trail, trailNodes, false, internalVars, copyLoc);
		}
	}

	// If is class extending a super class, insert `let this$0;` and `return this$0;` statements
	// if required
	if (constructorStatementNodes && thisVarNode) {
		// Add `let this$0` at start of constructor
		if (firstSuperStatementIndex === undefined) {
			constructorStatementNodes.unshift(
				t.variableDeclaration('let', [t.variableDeclarator(thisVarNode, null)])
			);
		}

		// Add `return this$0` to end of constructor
		if (!fnInfo.returnsSuper) constructorStatementNodes.push(t.returnStatement(thisVarNode));
	}

	// Determine what value of `fn.length` will be
	let numParams = 0;
	for (const {type: paramNodeType} of paramNodes) {
		if (paramNodeType === 'RestElement' || paramNodeType === 'AssignmentPattern') break;
		numParams++;
	}

	// Return function definition object
	return {
		node,
		scopeDefs,
		externalVars,
		internalVars,
		globalVarNames,
		functionNames,
		name,
		numParams,
		isClass,
		isAsync,
		isGenerator,
		isArrow,
		isMethod,
		isStrict,
		containsEval,
		argNames: fnInfo.argNames
	};
};

/**
 * Replace const violation expression with expression which throws.
 * e.g. `c = f()` -> `f(), (() => {const c = 0; c = 0;})()`
 * If is silent violation (function expression name assigned to in sloppy mode),
 * just remove the assignment.
 * e.g. `c += f()` -> `c + f()`
 *
 * @param {Array<string|number>} trail - Keys trail
 * @param {Array<Object>} trailNodes - Trail nodes
 * @param {boolean} isSilent - `true` if is a silent violation (i.e. doesn't throw)
 * @param {Object} internalVars - Map of internal vars, keyed by var name
 * @param {Function} copyLoc - Function to copy location from old to new AST node
 * @returns {undefined}
 */
function replaceConstViolation(trail, trailNodes, isSilent, internalVars, copyLoc) {
	const trailLen = trail.length,
		node = trailNodes[trailLen],
		parentNode = trailNodes[trailLen - 1];
	function replaceParent(replacementNode) {
		trailNodes[trailLen - 2][trail[trailLen - 2]] = copyLoc(replacementNode, parentNode);
	}

	const {type} = parentNode;
	if (type === 'AssignmentExpression') {
		const {operator} = parentNode;
		if (operator === '=') {
			// `c = x` -> `x, throw()`
			replaceParent(
				createConstViolationThrowNode(parentNode.right, node.name, isSilent, internalVars)
			);
		} else if (['&&=', '||=', '??='].includes(operator)) {
			// `c &&= x` -> `c && (x, throw())`
			replaceParent(
				t.logicalExpression(
					operator.slice(0, -1),
					node,
					createConstViolationThrowNode(parentNode.right, node.name, isSilent, internalVars)
				)
			);
		} else {
			// Other assignment operator e.g. `+=`, `-=`, `>>>=`
			// `c += x` -> `c + x, throw()`
			replaceParent(
				createConstViolationThrowNode(
					t.binaryExpression(operator.slice(0, -1), node, parentNode.right),
					node.name, isSilent, internalVars
				)
			);
		}
	} else if (type === 'UpdateExpression') {
		// `c++` -> `+c, throw()`
		replaceParent(
			createConstViolationThrowNode(t.unaryExpression('+', node), node.name, isSilent, internalVars)
		);
	} else if (type === 'AssignmentPattern') {
		// `[c = x] = []`
		// -> `[(e => ({set a(v) {v === void 0 && e(); const c = 0; c = 0;}}))(() => x).a] = []`
		// `{c = x} = {}`
		// -> `{c: (e => ({set a(v) {v === void 0 && e(); const c = 0; c = 0;}}))(() => x).a} = {}`
		replaceParent(
			createConstViolationThrowPatternNode(node.name, parentNode.right, isSilent, internalVars)
		);
	} else {
		assertBug(
			type === 'ForOfStatement' || type === 'ForInStatement'
				|| type === 'ObjectProperty' || type === 'RestElement'
				|| trailNodes[trailLen - 2].type === 'ArrayPattern',
			`Unexpected const violation node type ${type}`
		);

		// `for (c of [1]) { foo(); }`
		// -> `for ({ set a(v) { const c = 0; c = 0; } }.a of [1]) { foo(); }`
		// `{x: c} = {}` -> `{x: {set a(v) { const c = 0; c = 0; }}.a} = {}`
		// `[...c] = []` -> `[...{set a(v) { const c = 0; c = 0; }}.a] = []`
		// `{...c} = {}` -> `{...{set a(v) { const c = 0; c = 0; }}.a} = {}`
		// `[c] = [1]` -> `[{set a(v) { const c = 0; c = 0; }}.a] = [1]`
		parentNode[trail[trailLen - 1]] = copyLoc(
			createConstViolationThrowAssignNode(node.name, isSilent, internalVars), node
		);
	}
}

/**
 * Create expression node which throws 'Assignment to constant variable' TypeError.
 * @param {Object} node - AST node to wrap
 * @param {string} name - Var name
 * @param {boolean} isSilent - `true` if violation does not throw
 * @param {Object} internalVars - Map of internal vars, keyed by var name
 * @returns {Object} - AST Node object
 */
function createConstViolationThrowNode(node, name, isSilent, internalVars) {
	// If silent failure, return node unchanged
	if (isSilent) return node;

	// `(x, (() => { const c = 0; c = 0; })())`
	return t.sequenceExpression([
		node,
		t.callExpression(
			t.arrowFunctionExpression([], createConstViolationThrowBlockNode(name, internalVars)), []
		)
	]);
}

/**
 * Create expression node which throws when assigned to.
 * @param {string} name - Var name
 * @param {boolean} isSilent - `true` if violation does not throw
 * @param {Object} internalVars - Map of internal vars, keyed by var name
 * @returns {Object} - AST Node object
 */
function createConstViolationThrowAssignNode(name, isSilent, internalVars) {
	// If silent failure, return expression which assignment to is a no-op
	if (isSilent) {
		// `{}.a`
		return t.memberExpression(t.objectExpression([]), t.identifier('a'));
	}

	// `{ set a(v) { const c = 0; c = 0; } }.a`
	return t.memberExpression(
		t.objectExpression([
			t.objectMethod(
				'set',
				t.identifier('a'),
				[createTempVarNode(name === 'v' ? '_v' : 'v', internalVars)],
				createConstViolationThrowBlockNode(name, internalVars)
			)
		]),
		t.identifier('a')
	);
}

/**
 * Create expression node to replace an assignment pattern which:
 * 1. Evaluates right hand side of pattern expression only if incoming assignment value is `undefined`
 * 2. Throws when assigned to
 *
 * @param {string} name - Var name
 * @param {Object} rightNode - AST Node for right-hand side of assignment pattern
 * @param {boolean} isSilent - `true` if violation does not throw
 * @param {Object} internalVars - Map of internal vars, keyed by var name
 * @returns {Object} - AST Node object
 */
function createConstViolationThrowPatternNode(name, rightNode, isSilent, internalVars) {
	const valueVarNode = createTempVarNode(name === 'v' ? '_v' : 'v', internalVars),
		rightGetterVarNode = createTempVarNode(name === 'e' ? '_e' : 'e', internalVars);

	// `v === void 0 && e()`
	const statementNodes = [t.expressionStatement(t.logicalExpression(
		'&&',
		t.binaryExpression('===', valueVarNode, t.unaryExpression('void', t.numericLiteral(0))),
		t.callExpression(rightGetterVarNode, [])
	))];

	if (!isSilent) statementNodes.push(...createConstViolationThrowStatementNodes(name, internalVars));

	// `(e => ({ set a(v) { v === void 0 && e(); const c = 0; c = 0; }}))(() => x).a`
	return t.memberExpression(
		t.callExpression(
			t.arrowFunctionExpression(
				[rightGetterVarNode],
				t.objectExpression([
					t.objectMethod('set', t.identifier('a'), [valueVarNode], t.blockStatement(statementNodes))
				])
			),
			[t.arrowFunctionExpression([], rightNode)]
		),
		t.identifier('a')
	);
}

/**
 * Create block statement which throws 'Assignment to constant variable' TypeError.
 * @param {string} name - Var name
 * @param {Object} internalVars - Map of internal vars, keyed by var name
 * @returns {Object} - AST Node object
 */
function createConstViolationThrowBlockNode(name, internalVars) {
	// `{ const c = 0; c = 0; }`
	return t.blockStatement(createConstViolationThrowStatementNodes(name, internalVars));
}

/**
 * Create statements which throw 'Assignment to constant variable' TypeError.
 * @param {string} name - Var name
 * @param {Object} internalVars - Map of internal vars, keyed by var name
 * @returns {Array<Object>} - Array of AST Node objects
 */
function createConstViolationThrowStatementNodes(name, internalVars) {
	// `const c = 0; c = 0;`
	const varNode = createTempVarNode(name, internalVars);
	return [
		t.variableDeclaration('const', [t.variableDeclarator(varNode, t.numericLiteral(0))]),
		t.expressionStatement(t.assignmentExpression('=', varNode, t.numericLiteral(0)))
	];
}

/**
 * Replace `super()` call with transpiled version.
 * @param {Array<string|number>} trail - Keys trail
 * @param {Array<Object>} trailNodes - Trail nodes
 * @param {Object} superVarNode - Var node for home object for `super`
 * @param {Object} [thisVarNode] - Var node for `this` (Identifier)
 * @param {number} [firstSuperStatementIndex] - Index of first top-level `super()` statement
 * @param {Function} copyLoc - Function to copy location from old to new AST node
 * @returns {undefined}
 */
function replaceSuperCall(
	trail, trailNodes, superVarNode, thisVarNode, firstSuperStatementIndex, copyLoc
) {
	const trailLen = trail.length,
		callNode = trailNodes[trailLen - 1];

	// Convert to `super(x, y)` -> `Reflect.construct(Object.getPrototypeOf(super$0), [x, y], super$0)`.
	// NB Cannot optimize `super(...x)` to `Reflect.construct(Object.getPrototypeOf(super$0), x, super$0)`
	// in case `x` is an iterator not an array.
	const argumentsNodes = callNode.arguments;
	callNode.callee = copyLoc(
		t.memberExpression(t.identifier('Reflect'), t.identifier('construct')),
		callNode.callee
	);
	callNode.arguments = [
		t.callExpression(
			t.memberExpression(t.identifier('Object'), t.identifier('getPrototypeOf')),
			[superVarNode]
		),
		t.arrayExpression(argumentsNodes),
		superVarNode
	];

	// If is `return super()`, just substitute transpiled super
	// `return super(x)` -> `return Reflect.construct(Object.getPrototypeOf(super$0), [x], super$0)`
	const grandParentNode = trailNodes[trailLen - 2],
		grandParentType = grandParentNode.type;
	if (grandParentType === 'ReturnStatement') {
		if (thisVarNode) {
			grandParentNode[trail[trailLen - 2]] = copyLoc(
				t.assignmentExpression('=', thisVarNode, callNode),
				callNode
			);
		}
		return;
	}

	// If is a top-level statement in constructor
	// (i.e. is statement which is purely `super()`, directly in constructor body block):
	// - Last statement: `return Reflect.construct(...)`
	//   or if `this` used in constructor: `return this$0 = Reflect.construct(...)`
	// - First statement: `const this$0 = Reflect.construct(...)`
	// - Any other statement: `this$0 = Reflect.construct(...)`
	if (grandParentType === 'ExpressionStatement') {
		const fnType = trailNodes[0].type;
		if ((fnType === 'ClassDeclaration' || fnType === 'ClassExpression') && trail.length === 8) {
			// Top-level statement in constructor
			const statementNodes = trailNodes[5],
				statementIndex = trail[5];
			if (statementIndex === statementNodes.length - 1) {
				// Last statement in constructor
				// `return Reflect.construct(...);` or `return this$0 = Reflect.construct(...);`
				statementNodes[statementIndex] = copyLoc(
					t.returnStatement(thisVarNode ? t.assignmentExpression('=', thisVarNode, callNode) : callNode),
					callNode
				);
				return;
			}

			if (statementIndex === firstSuperStatementIndex) {
				// First `super()` statement - replace with `const this$0 = Reflect.construct(...);`
				statementNodes[statementIndex] = copyLoc(
					t.variableDeclaration('const', [t.variableDeclarator(thisVarNode, callNode)]),
					grandParentNode
				);
				return;
			}
		}
	}

	// Replace with `this$0 = Reflect.construct(...)`
	grandParentNode[trail[trailLen - 2]] = copyLoc(
		t.assignmentExpression('=', thisVarNode, callNode), callNode
	);
}

/**
 * Replace `super` expression with transpiled version.
 * `super.prop` / `super[prop]` / `super.prop(...)` / `super[prop](...)` /
 * `super.prop = ...` / `super[prop] = ...`
 *
 * @param {Array<string|number>} trail - Keys trail
 * @param {Array<Object>} trailNodes - Trail nodes
 * @param {Object} superVarNode - Var node for home object for `super`
 * @param {Object} [thisVarNode] - Var node for `this` (may be Identifier or ThisExpression)
 * @param {boolean} superIsProto - `true` if `super` is within context of class prototype method
 * @param {Object} internalVars - Map of internal vars, keyed by var name
 * @param {Function} copyLoc - Function to copy location from old to new AST node
 * @returns {undefined}
 */
function replaceSuperExpression(
	trail, trailNodes, superVarNode, thisVarNode, superIsProto, internalVars, copyLoc
) {
	const trailLen = trail.length,
		expressionNode = trailNodes[trailLen - 1];

	// `super.prop` -> `Reflect.get(Object.getPrototypeOf(super$0.prototype), 'prop', this$0)`
	// or in static class method `Reflect.get(Object.getPrototypeOf(super$0), 'prop', this$0)`
	let propNode = expressionNode.property;
	if (!expressionNode.computed) propNode = copyLoc(t.stringLiteral(propNode.name), propNode);

	let replacementNode = t.callExpression(
		t.memberExpression(t.identifier('Reflect'), t.identifier('get')),
		[
			t.callExpression(
				t.memberExpression(t.identifier('Object'), t.identifier('getPrototypeOf')),
				[
					superIsProto
						? t.memberExpression(superVarNode, t.identifier('prototype'))
						: superVarNode
				]
			),
			propNode,
			thisVarNode
		]
	);

	// `super.prop = ...` -> `Reflect.set(Object.getPrototypeOf(super$0.prototype), 'prop', value, this$0)`
	const parentNode = trailNodes[trailLen - 2],
		parentKey = trail[trailLen - 2],
		parentType = parentNode.type;
	if (parentType === 'AssignmentExpression' && parentKey === 'left') {
		// Convert `Reflect.get(...)` to `Reflect.set(...)`
		replacementNode.callee.property.name = 'set';

		const valueNode = parentNode.right,
			grandParentNode = trailNodes[trailLen - 3];
		if (grandParentNode.type === 'ExpressionStatement') {
			// Standalone expression - add value to `Reflect.set()` arguments
			replacementNode.arguments.splice(2, 0, valueNode);
		} else {
			// Not standalone expression - wrap in function which return values.
			// This avoids evaluating the value expression twice.
			// `x = super.foo = y();` =>
			// `x = ((key, value) => (Reflect.set(..., key, value, this$0), value))('foo', y());`
			// NB Key is passed to function as argument too as it could be a complex expression
			// referencing many vars. Evaluating it outside the temp closure ensures no var name clashes.
			const keyVarNode = createTempVarNode('key', internalVars),
				valueVarNode = createTempVarNode('value', internalVars);
			replacementNode.arguments[1] = keyVarNode;
			replacementNode.arguments.splice(2, 0, valueVarNode);
			replacementNode = t.callExpression(
				t.arrowFunctionExpression(
					[keyVarNode, valueVarNode],
					t.sequenceExpression([replacementNode, valueVarNode])
				),
				[propNode, valueNode]
			);
		}

		grandParentNode[trail[trailLen - 3]] = copyLoc(replacementNode, parentNode);
		return;
	}

	// `super.prop(x, y)` -> `Reflect.get(...).call(this$0, x, y)`
	if (parentType === 'CallExpression') {
		replacementNode = t.memberExpression(replacementNode, t.identifier('call'));
		parentNode.arguments.unshift(thisVarNode);
	}
	copyLoc(replacementNode, expressionNode);

	parentNode[parentKey] = replacementNode;
}

/**
 * Create temp var node and add to internal vars.
 * @param {string} name - Var name
 * @param {Object} internalVars - Map of internal vars, keyed by var name
 * @returns {Object} - Identifier AST node
 */
function createTempVarNode(name, internalVars) {
	const node = t.identifier(name);
	createArrayOrPush(internalVars, name, node);
	return node;
}

/**
 * Add ASTs of nested functions to AST.
 * A function which has other functions nested within it will have left those nodes defined as `null`
 * in JSON-serialized AST. Get those child functions' ASTs from their own `getFnInfo()` functions
 * and insert them into the parent AST.
 * @param {Object} fnInfo - Function info object which was encoded as JSON to fn info getter function
 * @param {Array<Function>} getInfos - Function info getter functions for child functions
 * @param {boolean} isNestedFunction - `true` if is nested function
 * @param {number} fnBlockId - Block ID of function being serialized
 * @param {boolean} isInClassWithSuperClass - `true` if function being serialized
 *   is a class which extends a super class, and this function is either the class itself,
 *   or an arrow function within the class constructor
 * @param {Map} scopeDefs - Scope definitions map, keyed by block ID
 * @param {Object} externalVars - Map of var name to array of var nodes
 * @param {Object} internalVars - Map of var name to array of var nodes
 * @param {Set} globalVarNames - Set of global var names
 * @param {Set} functionNames - Set of function names
 * @param {Array<Object>} amendments - Array of amendments (const violations or `super`)
 * @returns {undefined}
 */
function resolveFunctionInfo(
	fnInfo, getInfos, isNestedFunction, fnBlockId, isInClassWithSuperClass,
	scopeDefs, externalVars, internalVars, globalVarNames, functionNames, amendments
) {
	// Process child functions.
	// Children are processed first as class's `extends` clause is treated as part of parent function,
	// but included in class's AST. So child AST needs to be inserted before `internalVars` etc
	// trails can be resolved to nodes. Same thing for computed method keys.
	const fnNode = fnInfo.ast;
	fnInfo.childFns.forEach((trail, index) => {
		const [childJson, childGetInfos] = getInfos[index]();
		const childInfo = JSON.parse(childJson),
			childNode = childInfo.ast,
			childInClassWithSuperClass = isInClassWithSuperClass
				&& childNode.type === 'ArrowFunctionExpression';
		resolveFunctionInfo(
			childInfo, childGetInfos, true, fnBlockId, childInClassWithSuperClass, scopeDefs,
			externalVars, internalVars, globalVarNames, functionNames, amendments
		);

		// Insert child function's AST into this function's AST
		setProp(fnNode, trail, childNode);
	});

	// Record function name
	if (isNestedFunction) {
		const idNode = fnNode.id;
		if (idNode) functionNames.add(idNode.name);
	}

	// Get external var nodes
	for (const scope of fnInfo.scopes) {
		const {blockId} = scope;
		if (blockId < fnBlockId) {
			// External var
			for (const [varName, {isReadFrom, isAssignedTo, trails}] of Object.entries(scope.vars)) {
				if (isNestedFunction) {
					const scopeDefVar = scopeDefs.get(blockId).vars[varName];
					if (isReadFrom) scopeDefVar.isReadFrom = true;
					if (isAssignedTo) scopeDefVar.isAssignedTo = true;
				}

				createArrayOrPush(externalVars, varName, ...(
					varName === 'this'
						? trailsToThisNodes(fnNode, trails) // Convert `this` to identifier node
						: trailsToNodes(fnNode, trails)
				));
			}
		} else {
			// Var which is external to current function, but internal to function being serialized
			for (const [varName, {isFunction, trails}] of Object.entries(scope.vars)) {
				if (isFunction || varName === 'super') continue;
				let varNodes;
				if (varName === 'this') {
					if (!isInClassWithSuperClass) continue;
					varNodes = trailsToThisNodes(fnNode, trails);
				} else if (varName === 'arguments' && fnInfo.argNames) {
					continue;
				} else {
					varNodes = trailsToNodes(fnNode, trails);
				}
				createArrayOrPush(internalVars, varName, ...varNodes);
			}
		}
	}

	// Get internal var nodes
	for (const [varName, trails] of Object.entries(fnInfo.internalVars)) {
		let varNodes;
		if (varName === 'this') {
			if (!isInClassWithSuperClass) continue;
			varNodes = trailsToThisNodes(fnNode, trails);
		} else {
			varNodes = trailsToNodes(fnNode, trails);
		}
		createArrayOrPush(internalVars, varName, ...varNodes);
	}

	// Get global var names
	const thisGlobalVarNames = fnInfo.globalVarNames;
	if (thisGlobalVarNames) setAddFrom(globalVarNames, thisGlobalVarNames);

	// Get amendments (const violations and `super`).
	// Ignore amendments which refer to internal vars.
	const thisAmendments = fnInfo.amendments;
	if (thisAmendments) {
		for (const [type, blockId, ...trail] of thisAmendments) {
			if (blockId < fnBlockId) {
				amendments.push({type, trail, trailNodes: getProps(fnNode, trail)});
			} else if (type === CONST_VIOLATION_CONST) {
				// Const violation where var is internal to function. Add to internal vars instead.
				// Ignore CONST_VIOLATION_FUNCTION_THROWING and CONST_VIOLATION_FUNCTION_SILENT violation types
				// because they refer to function names, which are not treated as internal vars.
				const node = getProp(fnNode, trail);
				createArrayOrPush(internalVars, node.name, node);
			}
		}
	}
}

/**
 * Get nodes for trails.
 * @param {Object} fnNode - AST node for function
 * @param {Array<Array>} trails - Trails
 * @returns {Array<Object>} - AST nodes specified by trails
 */
function trailsToNodes(fnNode, trails) {
	return trails.map(trail => getProp(fnNode, trail));
}

/**
 * Get nodes for trails for `this`.
 * Convert `ThisExpression`s to `Identifier`s.
 * @param {Object} fnNode - AST node for function
 * @param {Array<Array>} trails - Trails
 * @returns {Array<Object>} - AST nodes specified by trails
 */
function trailsToThisNodes(fnNode, trails) {
	return trails.map((trail) => {
		const thisNode = getProp(fnNode, trail);
		thisNode.type = 'Identifier';
		thisNode.name = 'this';
		return thisNode;
	});
}

/**
 * Get deep property of object, specified by key trail.
 * Simplified version of `lodash.get()` (https://lodash.com/docs/4.17.15#get).
 * e.g. `getProp({x: [{y: 1}]}, ['x', 0, 'y'])` returns `1`.
 * @param {Object} obj - Object
 * @param {Array<string|number>} trail - Array of trail segements
 * @returns {*} - Value
 */
function getProp(obj, trail) {
	trail.forEach((key) => {
		obj = obj[key];
	});
	return obj;
}

/**
 * Get deep properties of object, specified by key trail.
 * Returns all properties on trail, including the original object.
 * e.g. `getProps({x: {y: 1}}, ['x', 'y'])` returns `[{x: {y: 1}}, {y: 1}, 1]`.
 * @param {Object} obj - Object
 * @param {Array<string|number>} trail - Array of trail segements
 * @returns {*} - Value
 */
function getProps(obj, trail) {
	const trailObjs = [obj];
	trail.forEach((key) => {
		obj = obj[key];
		trailObjs.push(obj);
	});
	return trailObjs;
}

/**
 * Set deep property of object, specified by key trail.
 * Simplified version of `lodash.set()` (https://lodash.com/docs/4.17.15#set).
 * e.g. `setProp({x: [{y: 1}]}, ['x', 0, 'y'], 2)` mutates object to `{x: [{y: 2}]}`.
 * @param {Object} obj - Object
 * @param {Array<string|number>} trail - Array of trail segements
 * @param {*} value - Value to set
 * @returns {undefined}
 */
function setProp(obj, trail, value) {
	getProp(obj, trail.slice(0, -1))[trail[trail.length - 1]] = value;
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
	} else if (isObject(node)) {
		fn(node);

		for (const key in node) {
			if (key !== 'loc') traverseAll(node[key], fn);
		}
	}
}
