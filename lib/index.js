/* --------------------
 * livepack module
 * Entry point
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	{isFunction} = require('is-it-type');

// Imports
const tracker = require('./tracker.js'),
	{fns} = tracker;

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

	// Get function's AST
	const ast = fns[fnId]; // eslint-disable-line no-unused-vars

	// TODO
	console.log('functionId:', fnId); // eslint-disable-line no-console
	console.log('parent scope:', parent); // eslint-disable-line no-console
	return 'FUNCTION';
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
