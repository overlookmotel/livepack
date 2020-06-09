/* --------------------
 * livepack module
 * Entry point
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	{parse} = require('@babel/parser'),
	traverse = require('@babel/traverse').default,
	generate = require('@babel/generator').default,
	{isFunction} = require('is-it-type');

// Imports
const tracker = require('./tracker.js');

// Exports

module.exports = function serialize(val) {
	if (isFunction(val)) return serializeFunction(val);
	return 'NOT A FUNCTION';
};

function serializeFunction(fn) {
	// Call function to get values from enclosing scope
	let fnId, scope;
	tracker.track = (_fnId, _scope) => {
		fnId = _fnId;
		scope = _scope;
	};
	// TODO If returns generator object, call `.next()` on generator
	fn();
	tracker.track = undefined;

	assert(scope, 'Function was not tracked');

	// Assign parent values to parent scope
	assignValuesToParent(scope);

	// Add function to parent scope functions list
	const {parent} = scope;
	let scopeFns = parent.fns;
	if (!scopeFns) scopeFns = parent.fns = []; // eslint-disable-line no-multi-assign
	scopeFns.push(fn);

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
	let {values} = parent;
	if (!values) values = parent.values = {}; // eslint-disable-line no-multi-assign
	Object.assign(values, parentValues);

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
