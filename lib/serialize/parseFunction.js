/* --------------------
 * livepack module
 * Parse function code
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, isAbsolute: pathIsAbsolute, relative: pathRelative} = require('path'),
	assert = require('assert'),
	{parse} = require('@babel/parser'),
	traverse = require('@babel/traverse').default,
	sourceMapFromComment = require('convert-source-map').fromComment,
	{SourceMapConsumer} = require('source-map'),
	{isString, isObject, isArray} = require('is-it-type'),
	{last} = require('lodash'),
	t = require('@babel/types');

// Imports
const {identifierIsVariable, replaceWith, TEMP_COMMENT_PREFIX} = require('../shared.js'),
	{createUnmangledVarNameTransform} = require('./varNames.js'),
	{isJsIdentifier, isNumberKey} = require('./utils.js'),
	{transpiledFiles} = require('../internal.js');

// Constants
const TEMP_COMMENT_PREFIX_LEN = TEMP_COMMENT_PREFIX.length,
	IS_INTERNAL = Symbol('livepack.IS_INTERNAL');

// Exports

/**
 * Parse function code to AST and identify nodes referring to external variables.
 * @param {Function} fn - Function
 * @param {string} js - Javascript code for function
 * @param {string} [filename] - Path to file (only provided if source maps enabled)
 * @param {Set<string>} externalVarNames - Names of external vars
 * @param {boolean} isMethod - `true` if is a method
 * @param {boolean} isProtoMethod - `true` if is a class prototype method
 * @param {boolean} isStaticMethod - `true` if is a class static method
 * @param {string|undefined} superVarName - Name of var to use for `super`
 * @param {boolean} isUntracked - `true` if is a function in livepack codebase which is not tracked
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
module.exports = function parseFunction(
	fn, js, filename, externalVarNames, isMethod, isProtoMethod, isStaticMethod, superVarName, isUntracked
) {
	// Prep wrapper for parsing code.
	// Either parse as function expression, or class method.
	// eslint-disable-next-line prefer-const
	let [wrapperStart, wrapperEnd] = isMethod // eslint-disable-line no-nested-ternary
		? isStaticMethod
			? ['(class{', '})']
			: ['({', '})']
		: ['(', ')'];

	// Locate function in transpiled code + add padding to wrapper so it's positioned
	// on same line and column in code to be parsed
	let transpiledFile, endLine, endColumn;
	if (filename && !isUntracked) {
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
	const ast = parse(
		`${wrapperStart}${js}${wrapperEnd}`,
		isUntracked ? {sourceFilename: filename} : undefined
	);

	// Extract function node from AST
	let node = ast.program.body[0].expression,
		isClass, wrapperClassNode, params;
	if (isMethod) {
		if (isStaticMethod) {
			wrapperClassNode = node;
			node = node.body.body[0];
			assert(node.type === 'ClassMethod', `Unexpected class method node type '${node.type}'`);
		} else {
			node = node.properties[0];
			assert(node.type === 'ObjectMethod', `Unexpected object method node type '${node.type}'`);
		}

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
		thisReplacementNode = null,
		classNameUsedAsSuper = false;
	// TODO Also need to flag if class name used elsewhere in constructor
	// e.g. `class X { constructor() { this.x = X; } }`

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
				// Skip temp functions created by livepack (in transpiling `super.foo = ...`)
				const fnNode = path.node;
				if (fnNode[IS_INTERNAL] || isUntracked) return;

				const bodyPath = path.get('body'),
					isConstructor = fnNode.kind === 'constructor';

				// Remove tracker comment
				let firstStatementPath = bodyPath.get('body.0');
				if (!isConstructor) firstStatementPath.node.leadingComments.shift();

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

				// Remove temp vars + save details to `tempVars`
				removeTempVars(bodyPath, tempVars);

				// If is class constructor in class which is nested within function being serialized,
				// and constructor is useless, delete it
				if (isConstructor && (!isClass || functionDepth > 0) && isUselessConstructor(fnNode)) {
					path.remove();
					return;
				}

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

				const idNode = fnNode.id;
				if (idNode) functionNames.add(idNode.name);
			},
			exit(path) {
				if (!path.isArrowFunctionExpression() && !path.node[IS_INTERNAL] && !isUntracked) {
					functionDepth--;
				}
			}
		},

		BlockStatement(path) {
			// Skip if function body - already done in Function visitor
			if (path.parentPath.isFunction()) return;

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

			// Remove temp vars + save details to `tempVars`
			removeTempVars(path, tempVars);
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
					replaceWith(parentPath, parentPath.node.right.left);
					// TODO Write tests that cover this. Include:
					// 1. expression only evaluted once
					// 2. expression's `.toString()` only called once
					// 3. handles `null` + `undefined` (which have no `.toString()` method)
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
			// Skip if `super` not in method being serialized
			if ((!isMethod && !isClass) || functionDepth !== 1) return;

			// Determine if `super()` call or `super.prop` / `super[prop]`.
			const expressionPath = path.parentPath,
				expressionNode = expressionPath.node,
				{parentPath} = expressionPath;
			const isSuperCall = expressionPath.isCallExpression() && path.key === 'callee';

			if (!superVarName) superVarName = 'super';
			const superVarNode = t.identifier(superVarName);

			if (!isSuperCall) {
				// `super.prop` / `super[prop]` / `super.prop(...)` / `super[prop](...)` /
				// `super.prop = ...` / `super[prop] = ...`
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

						// Create temp vars, ensuring no var name clash with super var.
						// NB Prop name expression is injected as temp var as it could be a complex expression
						// referencing many vars. Evaluating it outside the temp closure ensures no var name clashes.
						const transform = createUnmangledVarNameTransform(new Set([superVarName]));
						const propTempNode = t.identifier(transform('temp'));
						const valTempNode = t.identifier(transform('temp'));

						replacementNode.arguments[1] = propTempNode;
						replacementNode.arguments.splice(2, 0, valTempNode);
						replacementNode = t.callExpression(
							t.arrowFunctionExpression(
								[propTempNode, valTempNode],
								t.sequenceExpression([replacementNode, valTempNode])
							),
							[propNode, valueNode]
						);

						// Prevent this function being mangled by function visitor
						replacementNode.callee[IS_INTERNAL] = true;
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
			if (superVarName !== 'super') classNameUsedAsSuper = true;

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

	// Map locations to source files (if source maps enabled)
	if (filename && !isUntracked) {
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
		// or get errors for files with existing source maps (don't understand why).
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
			if (!sourcePath) return;

			// Where position exceeds end of code, adjust to actual end
			let {line: locEndLine, column: locEndColumn} = end; // eslint-disable-line prefer-const
			if (locEndLine === endLine && locEndColumn > endColumn) locEndColumn = endColumn;
			const newEnd = sourceMapConsumer.originalPositionFor({line: locEndLine, column: locEndColumn});
			assert(newEnd.source === sourcePath);

			amendLocs.push({loc, newStart, newEnd, sourcePath});
		});

		const {sourceFiles} = this,
			{outputDir} = this.options;
		const pathMapping = Object.create(null);
		for (const {loc, newStart, newEnd, sourcePath} of amendLocs) {
			let path = pathMapping[sourcePath];
			if (!path) {
				path = pathIsAbsolute(sourcePath) ? sourcePath : pathJoin(filename, '..', sourcePath);
				if (outputDir) path = pathRelative(outputDir, path);
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
		if (name && !isJsIdentifier(name)) name = '';
		if (globalVarNames.has(name)) name = '';

		// Classes with static methods have `name` prop after static methods.
		// Leave it nameless - name will be added later, but it won't have to be deleted first
		// to preserve property order.
		// If class is being referred to in transpiled super, do not remove name.
		if (
			name !== ''
			&& isClass
			&& !classNameUsedAsSuper
			&& Object.getOwnPropertyNames(fn)[2] !== 'name'
		) name = '';

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
};

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

function removeTempVars(path, tempVars) {
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
