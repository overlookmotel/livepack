/* --------------------
 * livepack module
 * Serialize functions
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	{parse} = require('@babel/parser'),
	traverse = require('@babel/traverse').default,
	generate = require('@babel/generator').default;

// Imports
const tracker = require('../tracker.js');

// Exports

module.exports = {
	serializeFunction(fn) {
		// Call function
		let fnId, scopeVars, argNames; // eslint-disable-line no-unused-vars
		tracker.callback = (_fnId, _scopeVars, _argNames) => {
			fnId = _fnId;
			scopeVars = _scopeVars;
			argNames = _argNames;
		};
		fn();
		tracker.callback = undefined;

		assert(fnId !== undefined, 'Function was not tracked');

		// Deal with results
		// TODO
		console.log('functionId:', fnId); // eslint-disable-line no-console
		console.log('scopeVars:', scopeVars); // eslint-disable-line no-console
		// console.log('argNames:', argNames); // eslint-disable-line no-console
		return serializeFunctionCode(fn);
	}
};

function serializeFunctionOld(fn) { // eslint-disable-line no-unused-vars
	// Call function to get values from enclosing scope
	let fnId, scope, argumentNames;
	tracker.track = (_fnId, _scope, _argumentNames) => {
		fnId = _fnId;
		scope = _scope;
		argumentNames = _argumentNames;
	};
	// TODO If returns generator object, call `.next()` on generator
	fn();
	tracker.track = undefined;

	assert(scope, 'Function was not tracked');

	// Assign parent values to parent scope
	assignValuesToParent(scope);

	// Add function to parent scope functions list
	const {parent} = scope;
	const scopeFns = parent.fns;
	if (scopeFns) {
		scopeFns.push(fn);
	} else {
		parent.fns = [fn];
	}

	// Add arg names to parent scope
	if (argumentNames) parent.argumentNames = argumentNames;

	// Serialize function
	const js = serializeFunctionCode(fn);

	// TODO
	console.log('functionId:', fnId); // eslint-disable-line no-console
	console.log('parent scope:', parent); // eslint-disable-line no-console
	return js;
}

function assignValuesToParent(scope) {
	const {parentValues} = scope;
	if (!parentValues) return;
	delete scope.parentValues;

	const {parent} = scope;
	const {values} = parent;
	if (values) {
		Object.assign(values, parentValues);
	} else {
		parent.values = parentValues;
	}

	if (parent) assignValuesToParent(parent);
}

const functionToString = Function.prototype.toString;

function serializeFunctionCode(fn) {
	// Get function code
	const fnJs = functionToString.call(fn).replace(/\r\n/gu, '\n');

	// Parse - either as function expression, or class method
	let isMethod = false,
		ast;
	try {
		ast = parse(`(${fnJs});`);
	} catch (err) {
		ast = parse(`(class {${fnJs}});`);
		isMethod = true;
	}

	// Remove tracker code
	traverse(ast, {
		Function(path) {
			const bodyPath = path.get('body');
			bodyPath.get('body.0').remove();
			bodyPath.get('body.0').remove();
		},
		BlockStatement(path) {
			// TODO It's theoretically possible (but very unlikely)
			// this could mis-identify user code and remove it. Fix!
			if (path.parentPath.isFunction()) return;
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
	});

	// Get node for function
	let node = ast.program.body[0].expression;
	if (isMethod) {
		node = node.body.body[0];
		assert(node.type === 'ClassMethod', `Unexpected class method node type '${node.type}'`);
	}

	// Compile to Javascript
	// (strip out comments + replace indentation spaces with tabs)
	return generate(node, {comments: false}).code
		.replace(/\n( {2})+/g, whole => `\n${'\t'.repeat((whole.length - 1) / 2)}`);
}

function logPath(name, path) { // eslint-disable-line no-unused-vars
	path = {...path};
	for (const key of [
		'parent', 'parentPath', 'scope', 'container', 'context', 'opts', 'contexts', 'hub', 'state'
	]) {
		delete path[key];
	}
	console.log(`${name}:`, path); // eslint-disable-line no-console
}
