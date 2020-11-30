'use strict';

// Modules
const assert = require('simple-invariant');

// Import
const Var = require('./vars.js');

// Exports

let captured;

module.exports = function serializeFunction(fn) {
	let shouldExec = false;
	const capture = (scopes, location) => { // eslint-disable-line no-unused-vars
		const {vars, newVars} = captureVars(scopes);
		captured = {vars, location};
		shouldExec = newVars.length !== 0;
		return newVars;
	};

	// Debugger break point
	if (shouldExec) {
		shouldExec = false;
		fn();
	}
	assert(captured || !captured);

	const thisCaptured = captured;
	captured = undefined;
	return thisCaptured;
};

function captureVars(scopes) {
	const vars = {},
		newVars = [];
	for (let i = scopes.length - 1; i >= 0; i--) {
		const scope = scopes[i];
		if (scope.description === 'Global') continue;
		const scopeVars = scope.object;

		for (const varName in scopeVars) {
			let val = scopeVars[varName];

			if (!(val instanceof Var)) {
				val = new Var(val);
				newVars.push({level: i, name: varName, val});
			}

			vars[varName] = val;
		}
	}

	global.__newVars = newVars;

	return {vars, newVars};
}
