/* --------------------
 * livepack module
 * Babel plugin visitor
 * ------------------*/

'use strict';

// Modules
const pathJoin = require('path').join,
	{ensureStatementsHoisted} = require('@babel/helper-module-transforms'),
	t = require('@babel/types');

// Imports
const {
		recordVarUse, createTrackerComment, enterBlock, createBlockId, getParentBlockPath,
		tagTempVarWithType, createParentVarBindingBlockPath, assertWithLocation
	} = require('./utils.js'),
	{
		checkInternalVarNameClash,
		createTrackerVarNode, createGetScopeIdVarNode, createTempVarNode,
		createEvalVarNode, createPrevalVarNode, createGetEvalVarNode, getEvalVarName,
		addToInternalVars, renameInternalVars
	} = require('./internalVars.js'),
	{
		SCOPE_ID_VAR_NODE, TEMP_VAR_NODES, FUNCTION_PROPS, HAS_CONSTRUCTOR, PARENT_IS_STRICT,
		PARENT_FUNCTION_PATH, PARENT_FULL_FUNCTION_PATH, SUPER_VARS
	} = require('./symbols.js'),
	{
		identifierIsVariable, internalIdentifier, isInternalNode,
		replaceWith, isInternalPath, addComments, isReservedWord
	} = require('../shared/functions.js'),
	{COMMON_JS_LOCAL_VAR_NAMES, TRANSFORMED_COMMENT, EVAL_COMMENT} = require('../shared/constants.js');

// Constants
const INIT_PATH = pathJoin(__dirname, '../init/index.js'),
	EVAL_PATH = pathJoin(__dirname, '../init/eval.js'),
	TOP_BLOCK_ID = 1,
	COMMON_JS_VARS = new Set(COMMON_JS_LOCAL_VAR_NAMES);

// Exports

/**
 * Visitor to add tracking to program.
 * Traverses entire AST tree.
 * @param {Object} programPath - Babel path object for program
 * @param {Object} [babelState] - Babel state object for file (not provided if code is from inside eval)
 * @param {Object} [evalState] - Livepack state object (only provided if code is from inside eval)
 * @returns {Object} - Livepack state object
 */
module.exports = function(programPath, babelState, evalState) {
	// Avoid adding tracking code to livepack's own codebase
	let filename;
	if (babelState) {
		filename = babelState.file.opts.filename;
		if (filename && isInternalPath(filename)) return undefined;
	}

	// Prepare for traversal
	const state = programEnterVisitor(programPath, babelState, evalState, filename);

	// Traverse AST tree
	programPath.traverse({
		Class: {
			enter: path => classEnterVisitor(path, state),
			exit: path => classExitVisitor(path, state)
		},
		Function: {
			enter: path => functionEnterVisitor(path, state),
			exit: path => functionExitVisitor(path, state)
		},
		ObjectExpression: path => objectExpressionVisitor(path, state),
		For: forOrWhileVisitor,
		While: forOrWhileVisitor,
		BlockStatement: {
			enter: path => blockStatementEnterVisitor(path, state),
			exit: path => blockStatementExitVisitor(path, state)
		},
		Identifier: path => identifierVisitor(path, state),
		ThisExpression: path => thisExpressionVisitor(path, state),
		Super: path => superVisitor(path, state)
	});

	// Insert tracker + init statements at top of file
	programExitVisitor(programPath, state, !!evalState);

	// Pass updated state back to `codeToAst()` if processing code from inside eval
	return state;
};

/**
 * Visitor to determine var names for tracker and scopeId vars in this file.
 * @param {Object} path - Babel path object for program
 * @param {Object} babelState - Babel state object for file
 * @param {Object} [evalState] - Livepack state object
 * @param {string} filename - Filename
 * @returns {Object} - Livepack state object
 */
function programEnterVisitor(path, babelState, evalState, filename) {
	// Init state
	const state = {
		filename,
		blockId: TOP_BLOCK_ID,
		parentVars: Object.create(null),
		isEvalCode: !!evalState,
		isCommonJs: !!babelState && babelState.file.opts.sourceType === 'script',
		isStrict: false,
		topLevelIsStrict: false,
		trackerVarNode: undefined,
		getScopeIdVarNode: undefined,
		programPath: path,
		parentFunctionPath: null,
		parentFullFunctionPath: null,
		internalVarsPrefixNum: 0,
		internalVarNodes: [],
		topLevelVarNames: new Set(),
		evalIsUsed: false
	};

	// Inherit state if processing code from inside eval
	if (evalState) Object.assign(state, evalState);

	// Determine if file is strict mode
	if (path.node.directives.some(directiveNode => directiveNode.value.value === 'use strict')) {
		state.isStrict = true;
	}
	state.topLevelIsStrict = state.isStrict;

	// Create nodes for tracker + getScopeId vars
	state.trackerVarNode = createTrackerVarNode(state);
	state.getScopeIdVarNode = createGetScopeIdVarNode(state);

	// Set block ID for program path
	enterBlock(path, state);

	// Return state object
	return state;
}

/**
 * Visitor to insert tracker + init statements at top of file.
 * @param {Object} path - Babel path object for program
 * @param {Object} state - State object
 * @param {boolean} isEval - `true` if is code produced by `eval()`
 * @returns {undefined}
 */
function programExitVisitor(path, state, isEval) {
	// Insert `const livepack_scopeId_1 = livepack_tracker();` at top of file if file scope referenced
	blockStatementExitVisitor(path, state);

	// Insert `init` + `eval` import statements at top of file
	if (!isEval) insertImportStatements(path, state);

	// Rename internal vars so they don't clash with existing vars
	renameInternalVars(state);
}

function insertImportStatements(path, state) {
	// Insert init import statement at top of file (above `scopeId` definition)
	// eslint-disable-next-line max-len
	// `const [livepack_tracker, livepack_getScopeId] = require('/path/to/app/node_modules/livepack/lib/init/index.js')(__filename, module, require);`
	const statementNodes = [
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					t.arrayPattern([state.trackerVarNode, state.getScopeIdVarNode]),
					t.callExpression(
						t.callExpression(internalIdentifier('require'), [t.stringLiteral(INIT_PATH)]),
						[t.identifier('__filename'), t.identifier('module'), t.identifier('require')]
					)
				)
			]
		)
	];

	// Insert eval import statement at top of file
	if (state.evalIsUsed) {
		statementNodes.push(
			t.variableDeclaration(
				'const', [
					t.variableDeclarator(
						t.arrayPattern([
							createEvalVarNode(state),
							createPrevalVarNode(state),
							createGetEvalVarNode(state)
						]),
						t.callExpression(
							t.callExpression(internalIdentifier('require'), [t.stringLiteral(EVAL_PATH)]),
							[
								t.identifier('__filename'),
								t.numericLiteral(state.blockId),
								t.numericLiteral(state.internalVarsPrefixNum)
							]
						)
					)
				]
			)
		);
	}

	// Insert `/*livepack_babel_transformed*/` comment at top of file
	addComments(path.node, false, false, {
		type: 'CommentBlock',
		value: TRANSFORMED_COMMENT
	});

	// Ensure these headers remain above headers added by @babel/plugin-transform-modules-commonjs
	ensureStatementsHoisted(statementNodes);

	path.unshiftContainer('body', statementNodes);
}

/**
 * Visitor to init scope and state for class.
 * @param {Object} classPath - Babel path object for class
 * @param {Object} state - State object
 * @returns {undefined}
 */
function classEnterVisitor(classPath, state) {
	// Init `HAS_CONSTRUCTOR` flag
	classPath[HAS_CONSTRUCTOR] = false;

	// Classes are always strict mode
	classPath[PARENT_IS_STRICT] = state.isStrict;
	state.isStrict = true;

	// Init block on class (may be used for class name)
	enterBlock(classPath, state);
}

/**
 * Visitor to amend classes with no constructor.
 * If is subclass, create blank constructor. Otherwise, add tracker comment.
 * Blank constructor for subclasses is required to track super.
 * @param {Object} classPath - Babel path object for class
 * @param {Object} state - State object
 * @returns {undefined}
 */
function classExitVisitor(classPath, state) {
	// Revert `isStrict` back to as was before entering class
	state.isStrict = classPath[PARENT_IS_STRICT];

	// If class has constructor, exit - `functionExitVisitor()` has already inserted tracker comment
	if (classPath[HAS_CONSTRUCTOR]) return;

	const classNode = classPath.node;
	if (classNode.superClass) {
		// Class extends a super class and has no constructor - create one.
		// NB `functionExitVisitor()` will insert tracker comment after `extends`.
		classPath.get('body').pushContainer('body', t.classMethod(
			'constructor',
			t.identifier('constructor'),
			[t.restElement(t.identifier('args'))],
			t.blockStatement([
				t.expressionStatement(t.callExpression(t.super(), [t.spreadElement(t.identifier('args'))]))
			])
		));
	} else {
		// No constructor - make tracker comment indicating no scope vars to capture
		addComments(
			classNode.body, true, false,
			createTrackerComment(createBlockId(state), [], true, false, false, undefined, state)
		);
	}
}

/**
 * Visitor to init scope + state for function.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function functionEnterVisitor(fnPath, state) {
	// If arrow function with no body statement block, convert into block.
	// This is necessary so there's a block to put tracking code into.
	// `x => x` -> `(x) => { return x; }`
	let bodyPath = fnPath.get('body');
	if (!bodyPath.isBlockStatement()) {
		bodyPath.replaceWith(
			t.blockStatement([
				t.returnStatement(bodyPath.node)
			])
		);
		bodyPath = fnPath.get('body');
	}

	// Record if parent is strict.
	// NB Whether this function itself is strict node will be recorded on entering the body block
	// to avoid affecting any functions in dynamic method key if this is a method.
	// NB Don't need to worry about functions defined within this function's params, as that would
	// require deconstruction or param defaults. Neither of these is possible as it's a syntax error
	// to have a 'use strict' directive in a function with non-simple params.
	const {isStrict} = state;
	fnPath[PARENT_IS_STRICT] = isStrict;

	// Init block on function body
	const blockId = enterBlock(bodyPath, state);

	// Init functions props
	fnPath[FUNCTION_PROPS] = {
		id: blockId,
		scopes: new Map(),
		isStrict,
		superVarNode: undefined,
		superIsProto: false,
		argNames: undefined
	};

	// Update parent functions
	fnPath[PARENT_FUNCTION_PATH] = state.parentFunctionPath;
	fnPath[PARENT_FULL_FUNCTION_PATH] = state.parentFullFunctionPath;
	state.parentFunctionPath = fnPath;
	if (!fnPath.isArrowFunctionExpression()) state.parentFullFunctionPath = fnPath;
}

/**
 * Exit visitor to add tracking comment + code to functions.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function functionExitVisitor(fnPath, state) {
	// Get function info
	const props = fnPath[FUNCTION_PROPS];
	const scopes = [...props.scopes.values()]
		.sort((a, b) => (a.blockId > b.blockId ? 1 : -1)); // Sort by block ID in ascending order

	// Determine where to insert tracker comment:
	// - Class constructors where class extends another class: Before super class expression
	//   (i.e. after `extends`, in case `extends` clause contains another class / function)
	// - Class constructors where class does not extend another class: At start of class body
	// - Methods with computed key: Before key
	//   (in case key contains another function, so outer function's tracker comment comes first)
	// - All other cases: Inside `livepack_tracker()` call
	const fnNode = fnPath.node;
	let isMethod = false,
		commentHolderNode,
		isInner = false;
	if (fnNode.kind === 'constructor') { // Class constructor
		const classBodyPath = fnPath.parentPath,
			classPath = classBodyPath.parentPath,
			extendsNode = classPath.node.superClass;
		if (extendsNode) {
			commentHolderNode = extendsNode;
		} else {
			commentHolderNode = classBodyPath.node;
			isInner = true;
		}

		classPath[HAS_CONSTRUCTOR] = true;
	} else if (fnPath.isMethod()) {
		isMethod = true;
		if (fnNode.computed) commentHolderNode = fnNode.key;
	}

	// Insert tracker code in function params
	// `livepack_tracker(() => [[scopeId_1, x, y]])`
	const trackerFnNode = t.arrowFunctionExpression([], t.arrayExpression(
		scopes.map(({scopeIdVarNode, varNames}) => t.arrayExpression([
			scopeIdVarNode,
			...[...varNames].map(name => (name === 'super' ? props.superVarNode : internalIdentifier(name)))
		]))
	));
	const trackerNode = t.callExpression(state.trackerVarNode, [trackerFnNode]);
	insertTrackerNode(fnPath, trackerNode, state);

	// Insert tracker comment
	addComments(
		commentHolderNode || trackerFnNode, isInner, false,
		createTrackerComment(
			props.id, scopes, props.isStrict, isMethod, props.superIsProto, props.argNames, state
		)
	);

	// Revert function vars back to as was before entering function
	state.parentFunctionPath = fnPath[PARENT_FUNCTION_PATH];
	state.parentFullFunctionPath = fnPath[PARENT_FULL_FUNCTION_PATH];
	state.isStrict = fnPath[PARENT_IS_STRICT];
}

/**
 * Insert tracker into function.
 * Intent is to place tracker as close to start of code as possible to ensure:
 * 1. No code is evaluated prior to tracker being executed.
 * 2. If parameters reference external vars, tracker is outside function body and so can access them.
 *
 * Tracker is added to first modifiable parameter.
 * If no modifiable parameters, falls back to placing in function body.
 * Tracker is placed so that it does not alter normal operation of function, and does not
 * alter function signature (`.length` property).
 *
 * Parameters of the following kinds cannot be modified:
 * 1. Simple params e.g. `x` (converting to `x = livepack_tracker()` would alter function's `.length`)
 * 2. Rest element with simple argument e.g. `...x` (no valid way to insert a default)
 * 3. Object/Array destructuring with first element being rest with simple argument
 *    e.g. `{...x}`, `[...x]`
 *    (converting to `{...x} = livepack_tracker()` would alter `.length` and no way to insert a default)
 * 4. Object/Array destructuring repeated e.g. `{...{...x}}` `[...{...x}]` (same reason as previous)
 *
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} trackerNode - AST node for `livepack_tracker()` call
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertTrackerNode(fnPath, trackerNode, state) {
	const fnNode = fnPath.node;
	const trackerIsAddedToParams = fnNode.params.some((_, paramIndex) => {
		let path = fnPath.get(`params.${paramIndex}`);
		if (path.isRestElement()) path = path.get('argument');

		let canAddDefault = false;
		while (true) { // eslint-disable-line no-constant-condition
			let {node} = path;
			const {type} = node;
			if (type === 'AssignmentPattern') {
				// `x = 1` => `x = livepack_tracker() || 1`
				node.right = t.logicalExpression('||', trackerNode, node.right);
				return true;
			}

			assertWithLocation(
				type === 'Identifier' || type === 'ArrayPattern' || type === 'ObjectPattern', path, state,
				`Unexpected function param type ${type}`
			);

			if (canAddDefault) {
				// `x` => `x = livepack_tracker()` / `{a: 1} => `{a: 1} = livepack_tracker()`
				replaceWith(path, t.assignmentPattern(node, trackerNode));
				return true;
			}

			if (type === 'Identifier') return false;

			path = path.get(type === 'ArrayPattern' ? 'elements.0' : 'properties.0');
			if (!path) return false;
			if (path.isRestElement()) {
				canAddDefault = false;
				path = path.get('argument');
			} else {
				if (type === 'ObjectPattern') {
					node = path.node;
					let keyNode = node.key;
					if (!node.computed) {
						if (t.isIdentifier(keyNode)) keyNode = t.stringLiteral(keyNode.name);
						node.computed = true;
						node.shorthand = false;
					}
					node.key = t.logicalExpression('||', trackerNode, keyNode);
					return true;
				}
				canAddDefault = true;
			}
		}
	});

	if (!trackerIsAddedToParams) {
		// Insert tracker at start of function body
		fnNode.body.body.unshift(t.expressionStatement(trackerNode));
	}
}

/**
 * Visitor to init block for object expression.
 * Block may be used if object contains method including `super`.
 * @param {Object} objPath - Babel path object for object expression
 * @param {Object} state - State object
 * @returns {undefined}
 */
function objectExpressionVisitor(objPath, state) {
	enterBlock(objPath, state);
}

/**
 * Visitor to convert `for` and `while` / `do while` with single statement to statement block.
 * This is in case:
 *
 * `for`: variables defined in the init node are referenced in functions created in the body,
 * in which case a scope var statement will need to be inserted.
 * `for (const x of [1, 2, 3]) fns.push(() => x);` -> `for (const x of [1, 2, 3]) { fns.push(() => x); }`
 *
 * `while` / `do while`: object or class with method using `super` defined in loop
 * and requires temp var scoped to inside loop.
 * e.g. `while (x) fn(class extends C {m() { super.m() }})`
 * `do fn(class extends C {m() { super.m() }}); while (x)`
 *
 * @param {Object} forOrWhilePath - Babel path object for `for` / `while` statement
 * @returns {undefined}
 */
function forOrWhileVisitor(forOrWhilePath) {
	const bodyPath = forOrWhilePath.get('body');
	if (!bodyPath.isBlockStatement()) bodyPath.replaceWith(t.blockStatement([bodyPath.node]));
}

/**
 * Visitor to set a block ID on every block.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {Object} state - State object
 * @returns {undefined}
 */
function blockStatementEnterVisitor(blockPath, state) {
	const {parentPath} = blockPath;
	if (!parentPath.isFunction()) {
		// Only create block ID if not function body - `functionVisitor` will have created block ID already
		enterBlock(blockPath, state);
	} else if (
		!state.isStrict
		&& blockPath.node.directives.some(directiveNode => directiveNode.value.value === 'use strict')
	) {
		// Entering strict mode function
		state.isStrict = true;
		parentPath[FUNCTION_PROPS].isStrict = true;
	}
}

/**
 * Visitor to add `const scopeId_3 = livepack_getScopeId();` at start of block if block is a scope.
 * Also adds any temp var declarations to start of block.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {Object} state - State object
 * @returns {undefined}
 */
function blockStatementExitVisitor(blockPath, state) {
	const scopeIdVarNode = blockPath[SCOPE_ID_VAR_NODE];
	if (!scopeIdVarNode) return;

	// Insert `const scopeId_3 = livepack_getScopeId();` statement at top of block
	const insertNodes = [
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					scopeIdVarNode,
					t.callExpression(state.getScopeIdVarNode, [])
				)
			]
		)
	];

	// Insert temp vars declaration at top of block
	const tempVarNodes = blockPath[TEMP_VAR_NODES];
	if (tempVarNodes) {
		insertNodes.push(
			t.variableDeclaration('let', tempVarNodes.map(node => t.variableDeclarator(node)))
		);
	}

	blockPath.unshiftContainer('body', insertNodes);
}

/**
 * Visitor to track a variable used which is in an upper scope.
 * @param {Object} identifierPath - Babel path object for identifer
 * @param {Object} state - State object
 * @returns {undefined}
 */
function identifierVisitor(identifierPath, state) {
	// Skip internally-created identifiers
	const {node, parentPath} = identifierPath;
	if (isInternalNode(node)) return;

	// Skip identifiers not used as vars e.g. `{a: 1}`
	if (!identifierIsVariable(identifierPath)) return;

	// If var name could clash with internal var names, record this
	const {name} = node;
	checkInternalVarNameClash(name, state);

	// Find enclosing function
	let functionPath = state.parentFunctionPath;
	if (functionPath) {
		// If is method key (e.g. `{ [x]() {} }`), treat as used in parent function
		if (functionPath.isMethod() && functionPath.node.computed) {
			const methodKeyPath = functionPath.get('key');
			if (
				identifierPath === methodKeyPath
				|| identifierPath.findParent(
					path => path === methodKeyPath || path === functionPath
				) === methodKeyPath
			) {
				functionPath = functionPath[PARENT_FUNCTION_PATH];
			}
		}
	} else if (
		parentPath.isVariableDeclarator() && identifierPath.key === 'id'
		&& parentPath.parentPath.parentPath.isProgram()
	) {
		// Top-level var declaration - record it.
		// This is a hack to work around Babel not seeing vars created by
		// `@babel/plugin-transform-modules-commonjs` when binding is searched for later.
		// `.scope.getBinding()` returns undefined. So catalog them here and use the list
		// to identify their scope when they're encountered later.
		// https://github.com/babel/babel/issues/13665
		// TODO Find a better way to do this.
		state.topLevelVarNames.add(name);
		return;
	}

	// Handle top-level vars and `eval`
	if (!functionPath) {
		// Shim `eval` in top level scope
		if (name === 'eval' && !identifierPath.scope.getBinding('eval')) processEval(identifierPath, state);
		return;
	}

	// Skip function's own name
	if (parentPath === functionPath && identifierPath.key === 'id') return;

	// Skip class's own name in constructor
	if (functionPath.node.kind === 'constructor') {
		const classPath = functionPath.parentPath.parentPath;
		assertWithLocation(
			classPath.isClass(), functionPath, state,
			`Unexpected class type from constructor '${classPath.node.type}'`
		);
		const classIdNode = classPath.node.id;
		if (classIdNode && classIdNode.name === identifierPath.node.name) return;
	}

	// Handle `arguments` where refers to implicit `arguments` var created by function.
	// NB In sloppy mode, `arguments` could also refer to an external user-defined var.
	const binding = identifierPath.scope.getBinding(name);
	if (name === 'arguments') {
		const fullFunctionPath = state.parentFullFunctionPath;
		if (!binding || (fullFunctionPath && !binding.path.findParent(path => path === fullFunctionPath))) {
			processArguments(state);
			return;
		}
	}

	// Find scope where var is defined (i.e. `const`, `let`, `var`, `function` statement).
	// Skip if is global (no binding found).
	let bindingBlockPath, isConst;
	if (!binding) {
		if (state.topLevelVarNames.has(name)) {
			// Identify top-level vars
			bindingBlockPath = state.programPath;
			isConst = true;
		} else {
			// Global var
			const parentVar = state.parentVars[name];
			if (parentVar) {
				// This is `eval`ed code and var is from scope outside `eval`.
				// Create synthetic binding block to be passed to `recordVarUse()`.
				bindingBlockPath = createParentVarBindingBlockPath(parentVar);
				isConst = parentVar.isConst;
			} else if (COMMON_JS_VARS.has(name)) {
				// Treat `exports` etc as external vars, not globals
				bindingBlockPath = state.programPath;
				isConst = false;
			} else {
				if (name === 'eval') processEval(identifierPath, state);
				return;
			}
		}
	} else {
		// Skip if var not defined outside function where it's used.
		// Function declarations' names are bound externally to the function, unlike function expressions.
		const bindingPath = binding.path;
		if (bindingPath === functionPath) {
			if (!functionPath.isFunctionDeclaration()) return;
		} else if (bindingPath.findParent(path => path === functionPath)) {
			return;
		}

		// Locate statement block containing var declaration
		({path: bindingBlockPath, isConst} = getBindingLocation(bindingPath, identifierPath, name, state));

		assertWithLocation(
			bindingBlockPath.isBlockStatement() || bindingBlockPath.isProgram() || bindingBlockPath.isClass(),
			bindingBlockPath, state,
			`Unexpected variable binding block type '${bindingBlockPath.node.type}' for var '${name}'`
		);
	}

	// Record variable use
	recordVarUse(name, functionPath, bindingBlockPath, isConst, state);
}

function getBindingLocation(bindingPath, identifierPath, name, state) {
	// Function declarations are bound to parent statement block except function declarations
	// in sloppy-mode environment which are scoped to enclosing function body.
	// NB Strict/sloppy mode of the function iself is not relevant - it's whether it is *within*
	// sloppy context which affects behavior.
	// This behavior only applies to function declarations, not class declarations.
	// TODO Implentation below isn't quite correct.
	// In sloppy mode, depends on whether var with this name is already defined in scope
	// function would have binding hoisted to.
	// See: https://github.com/overlookmotel/livepack/issues/224#issuecomment-937257207
	// TODO Needs tests for this.
	if (bindingPath.isFunctionDeclaration()) {
		const bindingFnPath = bindingPath.findParent(path => path.isFunction());
		const parentIsStrict = bindingFnPath
			? bindingFnPath[FUNCTION_PROPS].isStrict
			: state.topLevelIsStrict;
		return {
			path: parentIsStrict
				? bindingPath.parentPath
				: bindingFnPath ? bindingFnPath.get('body') : state.programPath,
			isConst: false
		};
	}

	// Function expressions are scoped to function body
	if (bindingPath.isFunctionExpression()) return {path: bindingPath.get('body'), isConst: true};

	// Class declarations are bound to parent statement block if accessed from outside class.
	// Class declarations/expressions accessed from inside class (including in `extends` clause)
	// are bound to class itself.
	if (bindingPath.isClass()) {
		return bindingPath.isClassDeclaration() && !identifierPath.findParent(path => path === bindingPath)
			? {path: bindingPath.parentPath, isConst: false} // Accessed from outside
			: {path: bindingPath, isConst: true}; // Accessed from inside
	}

	if (bindingPath.isCatchClause()) return {path: bindingPath.get('body'), isConst: false};

	const bindingParentPath = bindingPath.findParent(
		path => path.isVariableDeclaration() || path.isFunction()
	);
	if (bindingParentPath.isFunction()) {
		// Function parameter - scoped to function body
		assertWithLocation(
			bindingPath.isIdentifier() || bindingPath.isObjectPattern() || bindingPath.isArrayPattern()
				|| bindingPath.isAssignmentPattern() || bindingPath.isRestElement(),
			bindingPath, state,
			`Unexpected variable binding type '${bindingPath.node.type}' for var '${name}'`
		);

		return {path: bindingParentPath.get('body'), isConst: false};
	}

	// `var`, `const` or `let` statement
	assertWithLocation(
		bindingParentPath.isVariableDeclaration(),
		bindingParentPath, state,
		`Unexpected variable binding type '${bindingParentPath.node.type}' for var '${name}'`
	);

	// `var` statements are scoped to parent function
	const {kind} = bindingParentPath.node;
	if (kind === 'var') {
		const bindingFnPath = bindingParentPath.findParent(path => path.isFunction());
		return {path: bindingFnPath ? bindingFnPath.get('body') : state.programPath, isConst: false};
	}

	// `const` or `let` statement - scoped to block
	let varParentPath = bindingParentPath.parentPath;
	if (varParentPath.isFor()) {
		// `for (const x = ...) {}` - var scoped to `for` body block
		varParentPath = varParentPath.get('body');
	}

	return {path: varParentPath, isConst: kind === 'const'};
}

/**
 * Visitor to track use of `this` which refers to an upper scope.
 * Record the var same as for identifiers.
 * (only applies inside arrow functions)
 * @param {Object} thisPath - Babel path object for `this`
 * @param {Object} state - State object
 * @returns {undefined}
 */
function thisExpressionVisitor(thisPath, state) {
	processThisOrArguments('this', state);
}

/**
 * Visitor to track use of `super` in methods.
 * @param {Object} superPath - Babel path object for `super`
 * @param {Object} state - State object
 * @returns {undefined}
 */
function superVisitor(superPath, state) {
	// Find method `super` is in
	const {parentFunctionPath: fnPath, parentFullFunctionPath: methodPath} = state;
	assertWithLocation(methodPath.isMethod(), methodPath, state);

	// Skip if another incidence of `super` in this function already encountered
	if (fnPath[FUNCTION_PROPS].superVarNode) return;

	// Get var nodes for enclosing class/object
	const isClass = methodPath.isClassMethod(),
		encloserPath = isClass ? methodPath.parentPath.parentPath : methodPath.parentPath,
		encloserNode = encloserPath.node,
		superVars = encloserNode[SUPER_VARS]
			|| (encloserNode[SUPER_VARS] = getSuperVars(encloserPath, isClass, state));

	// Get var node which is accessible from function
	let superVar = superVars[0];
	if (superVar.bindingPath) {
		// No temp var created yet - find existing var which is accessible from tracker function
		const functionBodyPath = fnPath.get('body');
		superVar = superVars.find(superVar => ( // eslint-disable-line no-shadow
			functionBodyPath.scope.getBinding(superVar.node.name).path === superVar.bindingPath
		));

		// If no existing var accessible, create temp var
		if (!superVar) {
			superVar = createTempSuperVar(encloserPath, isClass, state);
			encloserNode[SUPER_VARS] = [superVar];
		}
	}

	// Record var use
	const fns = recordVarUse('super', fnPath, encloserPath, true, state);

	// Record super var on functions
	const superVarNode = superVar.node,
		superIsProto = isClass && !methodPath.node.static;
	for (const fnProps of fns) {
		fnProps.superVarNode = superVarNode;
		if (superIsProto) fnProps.superIsProto = true;
	}
}

/**
 * Get vars which can be used as target for `super`.
 * Returns array with items each of form `{node, bindingPath}`.
 *   - `node` = var node
 *   - `bindingPath` = Babel path object for where var is bound (`undefined` for temp vars)
 *
 * Vars which can be used:
 *   1. Class name in class declaration or class expression - `class X {}`
 *   2. Const class/object is assigned to - `const X = class {};`, `const x = { ... };`
 *   3. Temp var - `let x = {};` => `let x = livepack_temp1 = {};`
 * Temp var is only created if neither of other options exist.
 *
 * @param {Object} encloserPath - Babel path for class/object which is subject of `super`
 * @param {boolean} isClass - `true` if encloser is class
 * @param {Object} state - State object
 * @returns {Array<Object>} - Array of vars, each item of form `{node, bindingPath}`
 */
function getSuperVars(encloserPath, isClass, state) {
	const superVarNodes = [];

	// If class, use class name
	const {parentPath} = encloserPath;
	if (isClass) {
		assertWithLocation(encloserPath.isClass(), encloserPath, state);
		const idNode = encloserPath.node.id;
		if (idNode) superVarNodes.push({node: idNode, bindingPath: encloserPath});
	}

	// If defined with `const x = ...`, use var name (`const` only, so value cannot change)
	if (parentPath.isVariableDeclarator() && parentPath.parentPath.node.kind === 'const') {
		const idNode = parentPath.node.id;
		if (t.isIdentifier(idNode)) superVarNodes.push({node: idNode, bindingPath: parentPath});
	}

	// If neither of the above exist, create temp node
	if (superVarNodes.length === 0) superVarNodes[0] = createTempSuperVar(encloserPath, isClass, state);

	return superVarNodes;
}

/**
 * Create temp var for `super`.
 * `{ ... }` -> `temp_0 = { ... }`
 *
 * Class declarations are converted to var declaration
 * `class X { foo() { const X = 1; super.foo() } }`
 * -> `let X = temp_0 = class X { foo() { const X = 1; super.foo() } };`
 *
 * If is an unnamed class, preserve implicit name.
 * `let X = class {};` -> `let X = temp_0 = {X: class {}}.X;`
 *
 * @param {Object} encloserPath - Babel path for class/object which is target of `super`
 * @param {boolean} isClass - `true` if encloser is class
 * @param {Object} state - State object
 * @returns {Object} - Object of form `{node, bindingPath}` where `node` is AST node for temp var
 *   and `bindingPath` is undefined
 */
function createTempSuperVar(encloserPath, isClass, state) {
	const superVarNode = createTempVarNode(state),
		tempVarNodes = [superVarNode],
		encloserNode = encloserPath.node;

	let replacementNode = encloserNode,
		isClassDeclaration,
		tempType = 'assign';
	if (isClass) {
		isClassDeclaration = encloserPath.isClassDeclaration();
		if (isClassDeclaration) {
			encloserNode.type = 'ClassExpression';
		} else if (!encloserNode.id) {
			// Ensure class name is preserved if gained implicitly from assignment
			const {parentPath} = encloserPath;
			let idNode,
				keyIsComputed = false,
				accessIsComputed = false;
			if (parentPath.isAssignmentExpression()) {
				if (encloserPath.key === 'right') {
					const parentNode = parentPath.node;
					if (['=', '&&=', '||=', '??='].includes(parentNode.operator)) {
						const leftNode = parentNode.left;
						if (t.isIdentifier(leftNode)) idNode = leftNode;
					}
				}
			} else if (parentPath.isVariableDeclarator()) {
				if (encloserPath.key === 'init') {
					const assignedToNode = parentPath.node.id;
					if (t.isIdentifier(assignedToNode)) idNode = assignedToNode;
				}
			} else if (parentPath.isProperty()) {
				if (encloserPath.key === 'value') {
					const keyPath = parentPath.get('key'),
						keyNode = keyPath.node;
					keyIsComputed = parentPath.node.computed;

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
						// Needs to be `{[temp_2 = fn(), typeof temp_2 === 'symbol' || temp_2 += '', temp2]: ...}`.
						idNode = createTempVarNode(state);
						tagTempVarWithType(idNode, 'key');

						tempVarNodes.push(idNode);
						accessIsComputed = true;
						keyPath.replaceWith(
							t.assignmentExpression(
								'=',
								idNode,
								t.binaryExpression('+', keyNode, t.stringLiteral(''))
							)
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
					t.objectExpression([t.objectProperty(idNode, encloserNode, keyIsComputed)]),
					idNode,
					accessIsComputed
				);
				tempType = 'object';
			} else {
				// Class will remain anonymous.
				// `class {}` -> `temp_3 = (0, class {})`
				replacementNode = t.sequenceExpression([t.numericLiteral(0), encloserNode]);
				tempType = 'anon';
			}
		}
	} else {
		isClassDeclaration = false;
	}

	replacementNode = t.assignmentExpression('=', superVarNode, replacementNode);

	// If class declaration, replace with `let ... = ...`.
	// `class X {}` -> `let X = temp_3 = class X {}`
	if (isClassDeclaration) {
		replacementNode = t.variableDeclaration(
			'let', [t.variableDeclarator(encloserNode.id, replacementNode)]
		);
		tempType = `let,${tempType}`;
	}

	// Not using Babel's `.replaceWith()` to avoid remaking `path`s
	// which would then lose internal properties set on them
	replaceWith(encloserPath, replacementNode);

	// Create temp vars at start of block (will be inserted in `blockStatementExitVisitor()`)
	tagTempVarWithType(superVarNode, tempType);
	const blockPath = getParentBlockPath(encloserPath, state);
	(blockPath[TEMP_VAR_NODES] || (blockPath[TEMP_VAR_NODES] = [])).push(...tempVarNodes);

	return {node: superVarNode, bindingPath: undefined};
}

/**
 * Visitor to track use of `arguments` which refers to an upper scope.
 * Record the var same as for identifiers, and also record an array of
 * argument names in call to `tracker()`.
 * (only applies inside arrow functions)
 * @param {Object} state - State object
 * @returns {undefined}
 */
function processArguments(state) {
	const res = processThisOrArguments('arguments', state);
	if (!res) return;

	const {fns, bindingFunctionPath} = res;
	if (fns.length === 0) return;

	// Add arguments names to function props objects
	let argNames;
	if (bindingFunctionPath) {
		// When all params are simple vars (i.e. `function(a, b, c) {}`), values of `a` and `arguments[0]`
		// are linked. Setting `a` results in `arguments[0]` also being set to same value + vice versa.
		// If params use default values, destructuring or spreading, they are not linked.
		// So only record `argNames` if all params are simple vars.
		// TODO `arguments` is also not linked to param vars in strict mode functions.
		// TODO Strict mode is automatic in ESM modules - detect this.
		argNames = [];
		for (const paramNode of bindingFunctionPath.node.params) {
			if (!t.isIdentifier(paramNode)) {
				argNames.length = 0;
				break;
			}
			argNames.push(paramNode.name);
		}
	} else {
		argNames = state.parentVars.arguments.argNames;
		if (!argNames) return;
	}

	for (const fnProps of fns) {
		fnProps.argNames = argNames;
	}
}

/**
 * Find what function a use of `this`/`arguments` derives from.
 * (only applies to arrow functions, where `this` in the arrow function
 * refers to `this` in enclosing function)
 * @param {string} name - Var name (i.e 'this' or 'arguments')
 * @param {Object} state - State object
 * @returns {Object|undefined} - Object with props:
 *   {Array<Object>} .fns - Array of function props objects
 *   {Object} .bindingFunctionPath - Babel path for function where `this` / `arguments derives from
 */
function processThisOrArguments(name, state) {
	// Determine if this/arguments is a const.
	// NB Do not need to handle where `arguments` is a const (which it is in strict mode)
	// because an assignment to `arguments` will have caused a syntax error during parsing.
	// Therefore we can always know that either `arguments` is not a const, or there are
	// no assignments to it. So it doesn't matter if it's not correctly identified as a const here,
	// as only purpose for identification of consts is to prevent const violations.
	const isConst = name === 'this';

	// Find nearest non-arrow function above
	const bindingFunctionPath = state.parentFullFunctionPath,
		functionPath = state.parentFunctionPath;
	if (!bindingFunctionPath) {
		// If this is code generated in `eval` and `this` / `arguments` is from
		// scope outside `eval`, record var usage
		if (functionPath) {
			const parentVar = state.parentVars[name];
			if (parentVar) {
				const fns = recordVarUse(
					name, functionPath, createParentVarBindingBlockPath(parentVar), isConst, state
				);
				return {fns, bindingFunctionPath: undefined};
			}
		}

		return; // eslint-disable-line consistent-return
	}

	// Skip if enclosing function is not arrow function (i.e. `this`/`arguments` is local)
	if (functionPath === bindingFunctionPath) return; // eslint-disable-line consistent-return

	// Get function's statement block
	const bindingBlockPath = bindingFunctionPath.get('body');
	assertWithLocation(
		bindingBlockPath.isBlockStatement(), bindingBlockPath, state,
		`Unexpected variable binding block type '${bindingBlockPath.node.type}' for var '${name}'`
	);

	// Record variable use
	const fns = recordVarUse(name, functionPath, bindingBlockPath, isConst, state);

	// Return function props objects + bindingFunctionPath (used in `processArguments()`)
	return {fns, bindingFunctionPath};
}

/**
 * Process `eval`.
 * If it's used standalone (e.g. `(0, eval)()` or `const e = eval`), substitute `livepack_eval`.
 * If it's used as a direct call `eval(x)`, wrap code in `livepack_preval()`, with object containing
 * scope info about all vars in scope.
 * It's impossible to say which vars will be used until the code runs, so need to assume all vars
 * in scope need to be available.
 * @param {Object} evalPath - Babel path object for `eval`
 * @param {Object} state - State object
 * @returns {undefined}
 */
function processEval(evalPath, state) {
	// If standalone use of `eval`, substitute `livepack_eval`
	const {parentPath} = evalPath;
	if (!parentPath.isCallExpression() || evalPath.key !== 'callee') {
		const {node} = evalPath;
		node.name = getEvalVarName();
		addComments(node, false, true, {
			type: 'CommentBlock',
			value: EVAL_COMMENT
		});

		addToInternalVars(node, state);
		state.evalIsUsed = true;
		return;
	}

	// `eval()` call
	// If no arguments, leave as is
	if (parentPath.node.arguments.length === 0) return;

	// Capture all vars accessible to code in `eval()` expression.
	// Works by treating `eval` as if it was an arrow function
	// and acting as if all vars are encountered within it.
	const scopes = new Map(),
		fnProps = {scopes, argNames: undefined};
	evalPath[FUNCTION_PROPS] = fnProps;
	const {parentFunctionPath: functionPath, isStrict} = state;
	state.parentFunctionPath = evalPath;

	const idNode = {name: undefined},
		idPath = {
			node: idNode,
			parentPath: evalPath,
			scope: evalPath.scope,
			findParent: fn => evalPath.findParent(fn)
		};
	function includeVar(varName) {
		// If `eval()` is in strict mode, skip vars which are reserved words in strict mode
		// as they cannot be referenced within the eval - would be a syntax error
		if (isStrict && isReservedWord(varName)) return;
		idNode.name = varName;
		identifierVisitor(idPath, state);
	}

	// Capture all vars in scopes above
	let currentPath = parentPath;
	do {
		for (const varName of Object.keys(currentPath.scope.bindings)) {
			includeVar(varName);
		}
		currentPath = currentPath.parentPath;
	} while (currentPath);

	// Capture `this` + `arguments`
	processThisOrArguments('this', state);
	includeVar('arguments');

	// Capture all vars from parent scopes
	for (const varName of Object.keys(state.parentVars)) {
		includeVar(varName);
	}

	// Capture `module` + `exports`
	if (state.isCommonJs) {
		includeVar('module');
		includeVar('exports');
	}

	// TODO Capture `super`

	state.parentFunctionPath = functionPath; // Reset back to previous value

	// Replace `eval(x)` with `eval(livepack_preval(x, [...], true))`
	const firstArgPath = parentPath.get('arguments.0');
	firstArgPath.replaceWith(t.callExpression(
		createPrevalVarNode(state),
		[
			firstArgPath.node,
			t.arrayExpression(
				[...scopes.values()].map(scope => t.arrayExpression([
					t.numericLiteral(scope.blockId),
					scope.scopeIdVarNode,
					scope.blockName ? t.stringLiteral(scope.blockName) : null,
					t.arrayExpression(
						[...scope.varNames].map(varName => t.stringLiteral(varName))
					),
					t.arrayExpression(
						[...scope.constNames].map(varName => t.stringLiteral(varName))
					)
				]))
			),
			t.booleanLiteral(state.isStrict),
			...(
				fnProps.argNames
					? [t.arrayExpression(fnProps.argNames.map(varName => t.stringLiteral(varName)))]
					: []
			)
		]
	));

	state.evalIsUsed = true;
}
