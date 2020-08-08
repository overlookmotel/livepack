/* --------------------
 * livepack module
 * Parse function code
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	{parse} = require('@babel/parser'),
	traverse = require('@babel/traverse').default,
	{isString} = require('is-it-type'),
	{last} = require('lodash'),
	t = require('@babel/types');

// Imports
const {identifierIsVariable, replaceWith, TEMP_COMMENT_PREFIX} = require('../shared.js'),
	{isJsIdentifier, isNumberKey} = require('./utils.js');

// Constants
const TEMP_COMMENT_PREFIX_LEN = TEMP_COMMENT_PREFIX.length;

// Exports

module.exports = parseFunction;

/**
 * Parse function code to AST and identify nodes referring to external variables.
 * @param {Function} fn - Function
 * @param {string} js - Javascript code for function
 * @param {Set<string>} externalVarNames - Names of external vars
 * @param {boolean} isMethod - `true` if is a method
 * @param {boolean} isProtoMethod - `true` if is a class prototype method
 * @param {string|undefined} superVarName - Name of var to use for `super`
 * @returns {Object}
 * @returns {Object} .node - AST node for function
 * @returns {Object} .externalVars - Object keyed by var name, values are arrays of identifier nodes
 * @returns {Object} .internalVars - Object keyed by var name, values are arrays of identifier nodes
 * @returns {Set} .globalVarNames - Set of names of global vars used
 * @returns {Set} .functionNames - Set of function names used
 * @returns {string} .name - `.name` of created function
 * @returns {number} .numParams - `.length` of created function
 * @returns {boolean} .isClass - `true` if is class
 * @returns {boolean} .isGenerator - `true` if is generator
 * @returns {boolean} .isArrow - `true` if is arrow function
 * @returns {boolean} .isAsync - `true` if is async function
 */
function parseFunction(fn, js, externalVarNames, isMethod, isProtoMethod, superVarName) {
	// Parse - either as function expression, or class method
	// NB Cannot use `parseExpression()` as then `traverse()` errors on removing nodes
	const ast = parse(isMethod ? `(class {${js}});` : `(${js});`);

	// Extract function node from AST
	let node = ast.program.body[0].expression,
		isClass, wrapperClassNode, params;
	if (isMethod) {
		wrapperClassNode = node;
		node = node.body.body[0];
		assert(node.type === 'ClassMethod', `Unexpected class method node type '${node.type}'`);

		// Remove computed key i.e. `[a]() {}` -> `x() {}`
		if (node.computed) {
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
	}

	// Remove tracker code + get nodes for vars
	const externalVars = Object.create(null),
		internalVars = Object.create(null),
		globalVarNames = new Set(),
		functionNames = new Set(),
		tempVars = Object.create(null),
		thisPaths = [];
	let functionDepth = 0,
		topFunctionPath = null,
		thisReplacementNode = null;

	traverse(ast, {
		Class: {
			enter(path) {
				// Skip wrapper class
				if (wrapperClassNode && path.node === wrapperClassNode) return;

				// Remove tracker comment
				const bodyNode = path.node.body;
				const {innerComments} = bodyNode;
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
		},

		Function: {
			enter(path) {
				const bodyPath = path.get('body');

				// Remove tracker comment
				let firstStatementPath = bodyPath.get('body.0');
				if (path.node.kind !== 'constructor') firstStatementPath.node.leadingComments.shift();

				// Remove `const scopeId100 = tracker();` statement
				firstStatementPath.remove();

				// Remove `if (scopeId100 === null) return tracker(...);` statement
				firstStatementPath = bodyPath.get('body.0');

				const bodyNode = bodyPath.node,
					statements = bodyNode.body;
				if (statements.length === 1) {
					// Block will be left empty - preserve comments
					const {leadingComments} = firstStatementPath.node;
					if (leadingComments && leadingComments.length > 0) {
						const {innerComments} = bodyNode;
						if (innerComments) {
							innerComments.push(...leadingComments);
						} else {
							bodyNode.innerComments = leadingComments;
						}
					}
				}

				firstStatementPath.remove();

				// Convert `x => { return x; }` to `x => x`
				if (path.isArrowFunctionExpression()) {
					if (statements.length === 1) {
						firstStatementPath = bodyPath.get('body.0');
						if (firstStatementPath.isReturnStatement()) {
							const {argument} = firstStatementPath.node;
							if (argument !== null) bodyPath.replaceWith(argument);
						}
					}
				} else {
					functionDepth++;
					if (!topFunctionPath) topFunctionPath = path;
				}

				const idNode = path.node.id;
				if (idNode) functionNames.add(idNode.name);
			},
			exit(path) {
				if (!path.isArrowFunctionExpression()) functionDepth--;
			}
		},

		BlockStatement(path) {
			if (!path.parentPath.isFunction()) {
				// TODO It's theoretically possible (but very unlikely)
				// this could mis-identify user code and remove it.
				const firstStatementPath = path.get('body.0');
				if (!firstStatementPath || !firstStatementPath.isVariableDeclaration()) return;
				const declarationsPath = firstStatementPath.get('declarations');
				if (declarationsPath.length !== 1) return;
				const declarationPath = declarationsPath[0];
				if (!declarationPath || !declarationPath.isVariableDeclarator()) return;
				const identifierPath = declarationPath.get('id');
				if (!identifierPath.isIdentifier()) return;
				if (!identifierPath.node.name.match(/^scopeId\d*_\d+$/)) return;
				const initPath = declarationPath.get('init');
				if (!initPath || !initPath.isCallExpression()) return;
				const calleePath = initPath.get('callee');
				if (!calleePath || !calleePath.isIdentifier()) return;
				if (!calleePath.node.name.match(/^tracker\d*$/)) return;

				firstStatementPath.remove();
			}

			// Remove temp vars + save details to `tempVars`
			const nextStatementPath = path.get('body.0');
			if (!nextStatementPath || !nextStatementPath.isVariableDeclaration()) return;
			const declarationNodes = nextStatementPath.node.declarations;
			const comments = declarationNodes[0].leadingComments;
			if (!comments || comments.length !== 1) return;
			const comment = comments[0];
			if (comment.type !== 'CommentBlock' || !comment.value.startsWith(TEMP_COMMENT_PREFIX)) return;

			for (const declarationNode of declarationNodes) {
				tempVars[declarationNode.id.name] = declarationNode.leadingComments[0].value
					.slice(TEMP_COMMENT_PREFIX_LEN);
			}

			nextStatementPath.remove();
		},

		Identifier(path) {
			// Skip `this`
			const idNode = path.node,
				{name} = idNode;
			if (name === 'this') return;

			// If is temp var, remove
			let tempVarType = tempVars[name];
			if (tempVarType) {
				let {parentPath} = path;
				if (tempVarType === 'key') {
					const valuePath = parentPath.parentPath.get('value');
					replaceWith(valuePath, valuePath.node.right.object.properties[0].value);
					replaceWith(parentPath, parentPath.node.right.callee.object);
					return;
				}

				const isLet = tempVarType.startsWith('let,');
				if (isLet) tempVarType = tempVarType.slice(4);

				const replacementNode = tempVarType === 'assign' // eslint-disable-line no-nested-ternary
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
				if (!bindingPath.isFunction() && !bindingPath.isClass()) addToVars(name, idNode, internalVars);
			} else if (name !== 'arguments' || functionDepth === 0) {
				if (externalVarNames.has(name)) {
					addToVars(name, idNode, externalVars);
				} else {
					globalVarNames.add(name);
				}
			}
		},

		ThisExpression(path) {
			if (functionDepth === 0) {
				// Add to external vars - `this` refers to `this` from a higher function
				path.replaceWith(t.identifier('this'));
				addToVars('this', path.node, externalVars);
			} else if (functionDepth === 1) {
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
			// Skip if `super` not in function being serialized
			if (functionDepth !== 1) return;

			// Determine if `super()` call or `super.prop` / `super[prop]`.
			const expressionPath = path.parentPath,
				expressionNode = expressionPath.node,
				{parentPath} = expressionPath;
			const isSuperCall = expressionPath.isCallExpression() && path.key === 'callee';

			if (!superVarName) superVarName = 'super';
			const superVarNode = t.identifier(superVarName);

			if (!isSuperCall) {
				// `super.prop` / `super[prop]` / `super.prop(...)` / `super[prop](...)`

				// If `super.prop = ...`, convert to `this.prop = ...`
				if (parentPath.isAssignmentExpression() && expressionPath.key === 'left') {
					path.replaceWith(t.thisExpression());
					return;
				}

				let propNode = expressionNode.property;
				if (!expressionNode.computed) propNode = t.stringLiteral(propNode.name);

				// `Reflect.get(Object.getPrototypeOf(Klass.prototype), 'prop', this)`
				let replacementNode = t.callExpression(
					t.memberExpression(t.identifier('Reflect'), t.identifier('get')),
					[
						t.callExpression(
							t.memberExpression(t.identifier('Object'), t.identifier('getPrototypeOf')),
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

				// `super.prop(...)` - convert to `.call(this, ...)`
				if (parentPath.isCallExpression()) {
					replacementNode = t.memberExpression(replacementNode, t.identifier('call'));
					parentPath.unshiftContainer('arguments', t.thisExpression());
				}

				expressionPath.replaceWith(replacementNode);
				return;
			}

			// `super()`.
			// Transpile to `Reflect.construct(Object.getPrototypeOf(Klass), [...], Klass)`.
			const argumentsNodes = expressionNode.arguments;
			const transpiledSuperNode = t.callExpression(
				t.memberExpression(t.identifier('Reflect'), t.identifier('construct')),
				[
					t.callExpression(
						t.memberExpression(t.identifier('Object'), t.identifier('getPrototypeOf')),
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
		}
	});

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
				t.objectMethod('method', keyNode, params, node.body, false, isAsync, isGenerator)
			]),
			keyNode,
			accessComputed
		);
	} else if (!isArrow) {
		// Set function name
		if (name && !isJsIdentifier(name)) name = '';
		if (globalVarNames.has(name)) name = '';
		if (name) {
			node.id = t.identifier(name);
			functionNames.add(name);
		} else {
			node.id = null;
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
		name,
		numParams,
		isClass,
		isGenerator,
		isArrow,
		isAsync
	};
}

function addToVars(name, node, vars) {
	const nodes = vars[name];
	if (nodes) {
		nodes.push(node);
	} else {
		vars[name] = [node];
	}
}
