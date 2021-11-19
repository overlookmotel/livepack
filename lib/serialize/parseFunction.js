/* --------------------
 * livepack module
 * Parse function code
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, isAbsolute: pathIsAbsolute} = require('path'),
	{parse} = require('@babel/parser'),
	traverse = require('@babel/traverse').default,
	sourceMapFromComment = require('convert-source-map').fromComment,
	{SourceMapConsumer} = require('source-map'),
	{isString, isObject, isArray} = require('is-it-type'),
	last = require('lodash/last'),
	t = require('@babel/types'),
	assert = require('simple-invariant');

// Imports
const {identifierIsVariable, replaceWith, addComments} = require('../shared/functions.js'),
	{
		INTERNAL_VAR_NAMES_PREFIX, GET_SCOPE_ID_VAR_NAME_BODY, SCOPE_ID_VAR_NAME_BODY, TEMP_COMMENT_PREFIX,
		EVAL_VAR_NAME_BODY, EVAL_COMMENT
	} = require('../shared/constants.js'),
	{createUnmangledVarNameTransform} = require('./varNames.js'),
	{isJsIdentifier, isNumberKey} = require('./utils.js'),
	{transpiledFiles} = require('../shared/internal.js'),
	{
		internalIdentifier, flagAsInternal, isInternalNode, isReservedVarName, isRuntimePath
	} = require('../shared/functions.js'),
	assertBug = require('../shared/assertBug.js');

// Constants
const TEMP_COMMENT_PREFIX_LEN = TEMP_COMMENT_PREFIX.length,
	GET_SCOPE_ID_VAR_REGEX = new RegExp(
		`^${INTERNAL_VAR_NAMES_PREFIX}\\d*_${GET_SCOPE_ID_VAR_NAME_BODY}$`
	),
	SCOPE_ID_VAR_REGEX = new RegExp(`^${INTERNAL_VAR_NAMES_PREFIX}\\d*_${SCOPE_ID_VAR_NAME_BODY}_\\d+$`),
	EVAL_VAR_REGEX = new RegExp(`^${INTERNAL_VAR_NAMES_PREFIX}\\d*_${EVAL_VAR_NAME_BODY}$`);

// Exports

/**
 * Parse function code to AST and identify nodes referring to external variables.
 * @param {Function} fn - Function
 * @param {string} js - Javascript code for function
 * @param {string} filename - File path
 * @param {Set<string>} externalVarNames - Names of external vars
 * @param {Set<string>} constVarNames - Names of const external vars
 * @param {boolean} isStrict - `true` if is strict mode
 * @param {boolean} isMethod - `true` if is a method
 * @param {boolean} isProtoMethod - `true` if is a class prototype method
 * @param {boolean} isEval - `true` if function created in `eval()`
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
 *   {boolean} .isGenerator - `true` if is generator
 *   {boolean} .isArrow - `true` if is arrow function
 *   {boolean} .isAsync - `true` if is async function
 *   {boolean} .isMethod - `true` if is a method
 *   {boolean|null} .isStrict - `true` if is strict mode, `false` if sloppy, `null` if indeterminate
 *     (classes and runtime functions are indeterminate)
 *   {boolean} .containsEval - `true` if contains direct `eval()`
 *   {Array<Object|Array|undefined>} .callArguments - Array of arguments to call function with
 *     to trigger tracker
 */
module.exports = function parseFunction(
	fn, js, filename, externalVarNames, constVarNames, isStrict,
	isMethod, isProtoMethod, isEval, sourceMapsEnabled
) {
	// Prep wrapper for parsing code.
	// Either parse as function expression, or class method.
	// eslint-disable-next-line prefer-const
	let [wrapperStart, wrapperEnd] = isMethod ? ['(class{', '})'] : ['(', ')'];

	// Locate function in transpiled code + add padding to wrapper so it's positioned
	// on same line and column in code to be parsed
	let transpiledFile, endLine, endColumn;
	if (sourceMapsEnabled && !isEval) {
		transpiledFile = transpiledFiles[filename];
		const {code} = transpiledFile,
			lines = code.slice(0, code.indexOf(js)).split('\n'),
			lineNum = lines.length - 1;
		let charNum = lines[lineNum].length;
		if (lineNum === 0) charNum -= wrapperStart.length;

		// Determine end line + column of function body
		const jsLines = js.split('\n');
		const numJsLines = jsLines.length;
		endLine = lineNum + numJsLines;
		endColumn = jsLines[numJsLines - 1].length - 1;
		if (numJsLines === 1 && lineNum === 0) endColumn += charNum + wrapperStart.length;

		wrapperStart += `${'\n'.repeat(lineNum)}${' '.repeat(charNum)}`;
	}

	// Parse
	const ast = parse(`${wrapperStart}${js}${wrapperEnd}`);

	// Extract function node from AST
	let node = ast.program.body[0].expression,
		isClass, wrapperClassNode, params, computedKey;
	if (isMethod) {
		wrapperClassNode = node;
		node = node.body.body[0];
		assertBug(node.type === 'ClassMethod', `Unexpected class method node type '${node.type}'`);

		// Remove computed key i.e. `[a]() {}` -> `x() {}`
		computedKey = node.computed;
		if (computedKey) {
			node.key = t.identifier('x');
			node.computed = false;
		}

		isClass = false;
		params = node.params;
	} else {
		isClass = t.isClass(node);
		if (isClass) {
			// Remove all methods except constructor
			const ctorNode = node.body.body.find(methodNode => methodNode.kind === 'constructor');
			node.body.body = ctorNode ? [ctorNode] : [];

			// Remove `extends`
			node.superClass = null;

			params = ctorNode ? ctorNode.params : [];
		} else {
			params = node.params;
		}
		computedKey = false;
	}

	// Remove tracker code + get nodes for vars
	const externalVars = Object.create(null),
		internalVars = Object.create(null),
		globalVarNames = new Set(),
		functionNames = new Set(),
		readFromVarNames = new Set(),
		assignedToVarNames = new Set(),
		tempVars = Object.create(null),
		thisPaths = [],
		functionNameNodes = [],
		callArguments = [],
		strictStack = []; // Strict mode flag pushed on entering function, popped when exiting
	let isTopFunction = true,
		topFunctionPath = null, // Will be set to path of top level function
		fullFunctionDepth = 0,
		thisReplacementNode = null,
		containsEval = false,
		currentIsStrict = isStrict; // Whether current function in traversal is strict mode

	traverse(ast, {
		Class: {
			enter(path) {
				// Skip wrapper class
				if (wrapperClassNode && path.node === wrapperClassNode) return;

				// Remove tracker comment
				const classNode = path.node,
					extendsNode = classNode.superClass;
				if (extendsNode) {
					extendsNode.leadingComments.shift();
				} else {
					const bodyNode = classNode.body,
						{innerComments} = bodyNode;
					if (innerComments) {
						innerComments.shift();
					} else {
						const bodyNodes = bodyNode.body;
						if (bodyNodes.length > 0) {
							const {leadingComments} = bodyNodes[0];
							if (leadingComments) leadingComments.shift();
						}
					}
				}

				// Enter strict mode
				strictStack.push(currentIsStrict);
				currentIsStrict = true;
			},
			exit(path) {
				if (wrapperClassNode && path.node === wrapperClassNode) return;

				// Revert to parent strict mode status
				currentIsStrict = strictStack.pop();
			}
		},

		Function: {
			enter(path) {
				// Skip temp functions created by livepack (in transpiling `super.foo = ...`)
				const fnNode = path.node;
				if (isInternalNode(fnNode)) return;

				// Remove tracker comment
				if (!isTopFunction && fnNode.computed) fnNode.key.leadingComments.shift();

				// Remove `livepack_tracker()`
				const trackerIsRemovedFromParams = fnNode.params.some((_, paramIndex) => {
					let paramPath = path.get(`params.${paramIndex}`);

					const paramType = paramPath.node.type;
					if (paramType === 'RestElement') {
						paramPath = paramPath.get('argument');
					} else if (isTopFunction) {
						const callArg = paramType === 'ArrayPattern' ? []
							: paramType === 'ObjectPattern' ? {} : null;
						if (callArg) {
							for (let index = callArguments.length; index < paramIndex; index++) {
								callArguments[index] = undefined;
							}
							callArguments[paramIndex] = callArg;
						}
					}

					while (true) { // eslint-disable-line no-constant-condition
						const {type} = paramPath.node;
						if (type === 'Identifier') return false;

						if (type === 'AssignmentPattern') {
							// `x = livepack_tracker() || 1` => `x = 1`
							const rightPath = paramPath.get('right');
							if (rightPath.isLogicalExpression()) {
								// `x = livepack_tracker() || 1` => `x = 1`
								rightPath.replaceWith(rightPath.node.right);
							} else {
								// `x = livepack_tracker()` => `x`
								paramPath.replaceWith(paramPath.node.left);
							}
							return true;
						}

						assert(
							type === 'ArrayPattern' || type === 'ObjectPattern',
							`Unexpected function param type ${type}`
						);

						paramPath = paramPath.get(type === 'ArrayPattern' ? 'elements.0' : 'properties.0');
						if (!paramPath) return false;
						if (paramPath.isRestElement()) {
							paramPath = paramPath.get('argument');
						} else if (type === 'ObjectPattern') {
							// `{[livepack_tracker() || 'x']: x}` -> `{x}`
							// `{[livepack_tracker() || 'a']: x}` -> `{a: x}`
							// `{[livepack_tracker() || 1]: x}` -> `{1: x}`
							// `{[livepack_tracker() || fn()]: x}` -> `{[fn()]: x}`
							const keyPath = paramPath.get('key'),
								originalKeyNode = keyPath.node.right;
							if (t.isNumericLiteral(originalKeyNode)) {
								paramPath.replaceWith(t.objectProperty(originalKeyNode, paramPath.node.value));
							} else if (t.isStringLiteral(originalKeyNode) && isJsIdentifier(originalKeyNode.value)) {
								paramPath.replaceWith(t.objectProperty(
									t.identifier(originalKeyNode.value),
									paramPath.node.value,
									false, // computed
									true // shorthand
								));
							} else {
								keyPath.replaceWith(originalKeyNode);
							}
							return true;
						}
					}
				});

				const bodyPath = path.get('body');
				if (!trackerIsRemovedFromParams) {
					// Remove tracker from function body
					removeStatementFromBlock(bodyPath.get('body.0'), bodyPath);
				}

				// Remove `const scopeId_100 = getScopeId();` statement
				removeScopeIdVar(bodyPath);

				// Remove temp vars + save details to `tempVars`
				removeTempVars(bodyPath, tempVars);

				// If is class constructor in class which is nested within function being serialized,
				// and constructor is useless, delete it
				if (fnNode.kind === 'constructor' && !isTopFunction && isUselessConstructor(fnNode)) {
					path.remove();
					return;
				}

				// Determine if strict mode, and remove 'use strict' directive if unnecessary.
				// NB `currentIsStrict` will be true for top function if top function is strict,
				// so will always remove 'use strict' directive from top function. It will be
				// added again if required when creating scopes.
				// `currentIsStrict` is not updated here. Is updated when entering body block, to avoid
				// getting wrong strict status for a function within dynamic method key (if this is a method).
				strictStack.push(currentIsStrict);

				const bodyNode = bodyPath.node;
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

				// Convert `x => { return x; }` to `x => x`
				if (path.isArrowFunctionExpression()) {
					const bodyStatementNodes = bodyNode.body;
					if (bodyStatementNodes.length === 1 && bodyNode.directives.length === 0) {
						const firstStatementNode = bodyStatementNodes[0];
						if (t.isReturnStatement(firstStatementNode)) {
							const {argument} = firstStatementNode;
							if (argument !== null) bodyPath.replaceWith(argument);
						}
					}
				} else {
					fullFunctionDepth++;
				}

				if (isTopFunction) {
					isTopFunction = false;
					topFunctionPath = path;
				}

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
			// NB No need to remove vars for functions - already done in Function visitor
			if (!path.parentPath.isFunction()) {
				// Remove `const scopeId_100 = getScopeId();` statement
				removeScopeIdVar(path);

				// Remove temp vars + save details to `tempVars`
				removeTempVars(path, tempVars);
			} else if (path.node.directives.some(directive => directive.value.value === 'use strict')) {
				// This is function body containing 'use strict' directive - set strict mode flag
				currentIsStrict = true;
			}
		},

		Identifier(path) {
			// Skip `this` and internal var nodes
			const idNode = path.node;
			let {name} = idNode;
			if (name === 'this' || isInternalNode(idNode)) return;

			// If is temp var, remove
			let tempVarType = tempVars[name];
			if (tempVarType) {
				let {parentPath} = path;
				if (tempVarType === 'key') {
					const valuePath = parentPath.parentPath.get('value');
					replaceWith(valuePath, valuePath.node.right.object.properties[0].value);
					replaceWith(parentPath, parentPath.node.right.left);
					return;
				}

				const isLet = tempVarType.startsWith('let,');
				if (isLet) tempVarType = tempVarType.slice(4);

				const replacementNode = tempVarType === 'assign'
					? parentPath.node.right
					: tempVarType === 'anon'
						? parentPath.node.right.expressions[1]
						: parentPath.node.right.object.properties[0].value; // object

				if (isLet) {
					parentPath = parentPath.parentPath.parentPath;
					replacementNode.type = 'ClassDeclaration';
				}

				// NB Don't use Babel's `.replaceWith()` as leads to out-of-order visits
				replaceWith(parentPath, replacementNode);

				return;
			}

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

				if (!externalVarNames.has(name)) {
					functionNameNodes.push(idNode);
					return;
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
								parentPath.replaceWith(t.sequenceExpression([
									parentPath.node.right,
									createConstViolationThrowNode(name)
								]));
							} else if (['&&=', '||=', '??='].includes(operator)) {
								// `c &&= x` -> `c && (x, throw())`
								parentPath.replaceWith(
									t.logicalExpression(
										operator.slice(0, -1),
										idNode,
										t.sequenceExpression([parentPath.node.right, createConstViolationThrowNode(name)])
									)
								);
								isReadFrom = true;
							} else {
								// Other assignment operator e.g. `+=`, `-=`, `>>>=`
								// `c += x` -> `c + x, throw()`
								parentPath.replaceWith(
									t.sequenceExpression([
										t.binaryExpression(
											operator.slice(0, -1),
											idNode,
											parentPath.node.right
										),
										createConstViolationThrowNode(name)
									])
								);
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
							parentPath.replaceWith(
								t.sequenceExpression([
									t.unaryExpression('+', idNode),
									createConstViolationThrowNode(name)
								])
							);
						} else {
							isAssignedTo = true;
						}
					} else if (parentPath.isForXStatement() && path.key === 'left') {
						// `for (v in {x: 1}) {}` / `for (v of [1, 2, 3]) {}`
						if (constVarNames.has(name)) {
							// `for (c in {x: 1}) { foo(); }`
							// -> `for ({ set a(v) { const c = 0; c = 0; } }.a in {x: 1}) { foo(); }`
							path.replaceWith(createConstViolationThrowAssignNode(name));
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
							path.replaceWith(createConstViolationThrowAssignNode(name));
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
					if (name === 'eval') {
						if (parentPath.isCallExpression() && path.key === 'callee') {
							const argumentNodes = parentPath.node.arguments;
							if (argumentNodes.length !== 0) {
								// Remove `livepack_preval()` added in Babel plugin
								parentPath.get('arguments.0').replaceWith(argumentNodes[0].arguments[0]);
								containsEval = true;

								// Flag all external vars not shadowed within function as read from and assigned to
								for (const varName of externalVarNames) {
									if (!parentPath.scope.getBinding(varName)) {
										readFromVarNames.add(varName);
										if (!constVarNames.has(varName)) assignedToVarNames.add(varName);
									}
								}
							}
						}
					} else if (EVAL_VAR_REGEX.test(name)) {
						// `livepack_eval` - convert back to `eval` if identifying comment found
						const {leadingComments} = idNode;
						if (leadingComments) {
							const index = leadingComments.findIndex(
								comment => comment.type === 'CommentBlock' && comment.value === EVAL_COMMENT
							);
							if (index !== -1) {
								leadingComments.splice(index, 1);
								name = 'eval';
								idNode.name = 'eval';
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
			// Skip if `super` not in method being serialized
			if ((!isMethod && !isClass) || fullFunctionDepth !== 1) return;

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
								isProtoMethod
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
						const transform = createUnmangledVarNameTransform();
						const propTempNode = t.identifier(transform('temp'));
						const valTempNode = t.identifier(transform('temp'));

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

	// Map locations to source files (if source maps enabled)
	if (sourceMapsEnabled) {
		mapLocationsToSource(
			node, filename, transpiledFile, endLine, endColumn, this.sourceFiles, this.options.debug
		);
	}

	// Wrap methods in objects, and set name
	const isArrow = t.isArrowFunctionExpression(node),
		isGenerator = !!node.generator,
		isAsync = !!node.async;
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

		node = t.memberExpression(
			t.objectExpression([
				t.objectMethod('method', keyNode, params, node.body, false, isGenerator, isAsync)
			]),
			keyNode,
			accessComputed
		);
	} else if (!isArrow) {
		// Set function name
		const functionNameReferredTo = functionNameNodes.length !== 0 || (containsEval && node.id);
		let treatNameAsInternalVar = false;
		if (functionNameReferredTo) {
			const originalName = node.id.name;
			if (name !== originalName) {
				if (
					name && isJsIdentifier(name) && !isReservedVarName(name) && !containsEval
					&& !globalVarNames.has(name) && !functionNames.has(name)
				) {
					// Rename all references to name
					for (const nameNode of functionNameNodes) {
						nameNode.name = name;
					}
				} else {
					// Name will have to be defined later - treat as internal var so temp name gets shortened
					name = originalName;
					if (!containsEval) {
						treatNameAsInternalVar = true;
						addToVars(name, node.id, internalVars);
						internalVars[name].push(...functionNameNodes);
					}
				}
			}
		} else if (name && (!isJsIdentifier(name) || isReservedVarName(name) || globalVarNames.has(name))) {
			name = '';
		}

		if (!name) {
			node.id = null;
		} else if (!treatNameAsInternalVar) {
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
		isGenerator,
		isArrow,
		isAsync,
		isMethod,
		// Classes have indeterminate strict/sloppy status - never require conforming to strict/sloppy
		// as they're automatically strict.
		// Runtime functions are also treated as indeterminate (can be strict or sloppy)
		// unless explicitly strict.
		isStrict: isClass ? null
			: isStrict ? true
				: isRuntimePath(filename) ? null : false,
		containsEval,
		callArguments
	};
};

/**
 * Map all locations in AST to original source files, by reference to source map.
 * If function was generated in `eval()`, all locations are removed.
 * @param {Object} node - Babel node for function
 * @param {string} filename - Transpiled file path
 * @param {Object|undefined} transpiledFile - Object describing file,
 *   created by `parseSourceMapFromCode()` (undefined if is `eval`-ed code)
 * @param {number} endLine - End line num of function
 * @param {number} endColumn - End column num of function
 * @param {Object} sourceFiles - Source files dictionary.
 *   Source for file function was defined in will be added.
 * @param {boolean} [debug] - If `true`, prints debug info to stderr for source mapping failures
 * @returns {undefined}
 */
function mapLocationsToSource(node, filename, transpiledFile, endLine, endColumn, sourceFiles, debug) {
	// If function was generated in `eval()`, remove location from all nodes.
	// No source map for `eval` code.
	if (!transpiledFile) {
		traverseAll(node, (childNode) => {
			if (childNode.loc) delete childNode.loc;
		});
		return;
	}

	// Parse source map comment
	let {consumer: sourceMapConsumer, map: sourceMap} = transpiledFile;
	if (!sourceMapConsumer) {
		sourceMap = sourceMapFromComment(transpiledFile.sourceMapComment).toObject();
		sourceMapConsumer = new SourceMapConsumer(sourceMap);
		transpiledFile.map = sourceMap;
		transpiledFile.consumer = sourceMapConsumer;
	}

	// Amend locations to match sources.
	// Has to be done in two passes so locs are updated after all new locs have been calculated
	// or it results in errors for files with existing source maps (don't understand why).
	const amendLocs = [];
	traverseAll(node, (childNode) => {
		const {loc} = childNode;
		if (!loc) return;

		// Remove location for comments - can fail to map in some cases, and pointless anyway
		// as they should never create errors, so mapping will not be used
		if (childNode.type === 'CommentBlock' || childNode.type === 'CommentLine') {
			delete childNode.loc;
			return;
		}

		const {start, end} = loc;
		const newStart = sourceMapConsumer.originalPositionFor({line: start.line, column: start.column}),
			sourcePath = newStart.source;
		if (!sourcePath) {
			if (debug) {
				console.warn( // eslint-disable-line no-console
					// eslint-disable-next-line prefer-template
					'WARNING: Failed to create source map for code fragment.\n'
						+ 'This is likely a bug in Livepack.\n'
						+ 'Please raise an issue at https://github.com/overlookmotel/livepack/issues including the following details:\n'
						+ `Transpiled file path: ${filename}\n`
						+ `Transpiled file start: ${start.line}:${start.column}\n`
						+ `Transpiled file end: ${end.line}:${end.column}\n`
						+ `Mapped to source start: ${sourcePath}:${newStart.line}:${newStart.column}\n`
						+ 'Transpiled fragment:\n'
						+ getCodeFragment(transpiledFile.code, start, end) + '\n'
						+ `AST node type: ${childNode.type}\n`
				);
			}

			delete childNode.loc;
			return;
		}

		// Where position exceeds end of code, adjust to actual end
		let {line: locEndLine, column: locEndColumn} = end; // eslint-disable-line prefer-const
		if (locEndLine === endLine && locEndColumn > endColumn) locEndColumn = endColumn;
		const newEnd = sourceMapConsumer.originalPositionFor({line: locEndLine, column: locEndColumn});

		if (newEnd.source !== sourcePath) {
			if (debug) {
				console.warn( // eslint-disable-line no-console
					// eslint-disable-next-line prefer-template
					'WARNING: Failed to create source map for code fragment.\n'
						+ 'This is likely a bug in Livepack.\n'
						+ 'Please raise an issue at https://github.com/overlookmotel/livepack/issues including the following details:\n'
						+ `Transpiled file path: ${filename}\n`
						+ `Transpiled file start: ${start.line}:${start.column}\n`
						+ `Transpiled file end: ${end.line}:${end.column}\n`
						+ `Mapped to source start: ${sourcePath}:${newStart.line}:${newStart.column}\n`
						+ `Mapped to source end: ${newEnd.source}:${newEnd.line}:${newEnd.column}\n`
						+ 'Transpiled fragment:\n'
						+ getCodeFragment(transpiledFile.code, start, end) + '\n'
						+ `AST node type: ${childNode.type}\n`
				);
			}

			delete childNode.loc;
			return;
		}

		amendLocs.push({loc, newStart, newEnd, sourcePath});
	});

	const pathMapping = Object.create(null);
	for (const {loc, newStart, newEnd, sourcePath} of amendLocs) {
		let path = pathMapping[sourcePath];
		if (!path) {
			path = pathIsAbsolute(sourcePath) ? sourcePath : pathJoin(filename, '..', sourcePath);
			pathMapping[sourcePath] = path;
			if (sourceFiles[path] === undefined) {
				const {sourceRoot} = sourceMap;
				const searchPath = sourceRoot ? sourcePath.slice(sourceRoot.length) : sourcePath;
				sourceFiles[path] = sourceMap.sourcesContent[sourceMap.sources.indexOf(searchPath)];
			}
		}
		loc.filename = path;

		const {name} = newStart;
		if (name) loc.identifierName = name;
		const {start, end} = loc;
		start.line = newStart.line;
		start.column = newStart.column;
		end.line = newEnd.line;
		end.column = newEnd.column;
	}
}

function getCodeFragment(code, start, end) {
	const lines = code.split('\n').slice(start.line - 1, end.line);
	lines[0] = lines[0].slice(start.column);
	lines[lines.length - 1] = lines[lines.length - 1].slice(0, end.column);
	return lines.join('\n');
}

function isUselessConstructor(node) {
	// Class constructor in class which is nested within function being serialized.
	// If constructor is useless, delete it.
	// Looking for `constructor(...args) { super(...args) }`.
	const paramNodes = node.params;
	if (paramNodes.length !== 1) return false;

	const firstParamNode = paramNodes[0];
	if (!t.isRestElement(firstParamNode)) return false;
	const argumentNode = firstParamNode.argument;
	if (!t.isIdentifier(argumentNode)) return false;

	const bodyNodes = node.body.body;
	if (bodyNodes.length !== 1) return false;
	const bodyNode = bodyNodes[0];
	if (!t.isExpressionStatement(bodyNode)) return false;
	const expressionNode = bodyNode.expression;
	if (!t.isCallExpression(expressionNode)) return false;
	if (!t.isSuper(expressionNode.callee)) return false;

	const argumentNodes = expressionNode.arguments;
	if (argumentNodes.length !== 1) return false;
	const spreadNode = argumentNodes[0];
	if (!t.isSpreadElement(spreadNode)) return false;
	const superArgumentNode = spreadNode.argument;
	return t.isIdentifier(superArgumentNode) && superArgumentNode.name === argumentNode.name;
}

/**
 * Remove scope ID var node (`const livepack_scopeId_1 = livepack_getScopeId()`) if present.
 * @param {Object} blockPath - Babel path object for statement block
 * @returns {undefined}
 */
function removeScopeIdVar(blockPath) {
	// TODO It's theoretically possible (but very unlikely)
	// this could mis-identify user code and remove it.
	// Could remove this possibility by recording file's prefix num
	// and using it for a definitive check here.
	const firstStatementPath = blockPath.get('body.0');
	if (!firstStatementPath || !firstStatementPath.isVariableDeclaration()) return;
	const declarationsPath = firstStatementPath.get('declarations');
	if (declarationsPath.length !== 1) return;
	const declarationPath = declarationsPath[0];
	if (!declarationPath || !declarationPath.isVariableDeclarator()) return;
	const identifierPath = declarationPath.get('id');
	if (!identifierPath.isIdentifier()) return;
	if (!SCOPE_ID_VAR_REGEX.test(identifierPath.node.name)) return;
	const initPath = declarationPath.get('init');
	if (!initPath || !initPath.isCallExpression()) return;
	const calleePath = initPath.get('callee');
	if (!calleePath || !calleePath.isIdentifier()) return;
	if (!GET_SCOPE_ID_VAR_REGEX.test(calleePath.node.name)) return;

	removeStatementFromBlock(firstStatementPath, blockPath);
}

/**
 * Remove temp var declaration statement.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {Object} tempVars - Temp vars dictionary
 * @returns {undefined}
 */
function removeTempVars(blockPath, tempVars) {
	// Remove temp vars + save details to `tempVars`
	const firstStatementPath = blockPath.get('body.0');
	if (!firstStatementPath || !firstStatementPath.isVariableDeclaration()) return;
	const declarationNodes = firstStatementPath.node.declarations;
	const comments = declarationNodes[0].leadingComments;
	if (!comments || comments.length !== 1) return;
	const comment = comments[0];
	if (comment.type !== 'CommentBlock' || !comment.value.startsWith(TEMP_COMMENT_PREFIX)) return;

	for (const declarationNode of declarationNodes) {
		tempVars[declarationNode.id.name] = declarationNode.leadingComments[0].value
			.slice(TEMP_COMMENT_PREFIX_LEN);
	}

	removeStatementFromBlock(firstStatementPath, blockPath);
}

/**
 * Remove statement from statement block, and ensure comments are preserved.
 * @param {Object} statementPath - Babel path object for statement to remove
 * @param {Object} blockPath - Babel path object for statement block
 * @returns {undefined}
 */
function removeStatementFromBlock(statementPath, blockPath) {
	// If block will be left empty, preserve comments
	const {node} = blockPath,
		statements = node.body;
	if (statements.length === 1) {
		const {leadingComments} = statementPath.node;
		if (leadingComments && leadingComments.length > 0) {
			addComments(node, true, true, ...leadingComments);
		}
	}

	// Remove statement
	statementPath.remove();
}

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
 * @param {string} name - Var name
 * @returns {Object} - AST Node object
 */
function createConstViolationThrowNode(name) {
	// `(() => { const c = 0; c = 0; })()`
	return t.callExpression(
		flagAsInternal(t.arrowFunctionExpression([], createConstViolationThrowBlockNode(name))),
		[]
	);
}

/**
 * Create expression node which throws when assigned to.
 * @param {string} name - Var name
 * @returns {Object} - AST Node object
 */
function createConstViolationThrowAssignNode(name) {
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
	return t.blockStatement([
		t.variableDeclaration('const', [t.variableDeclarator(t.identifier(name), t.numericLiteral(0))]),
		t.expressionStatement(t.assignmentExpression('=', t.identifier(name), t.numericLiteral(0)))
	]);
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
