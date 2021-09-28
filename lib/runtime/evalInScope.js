/* --------------------
 * livepack module
 * `evalInScope()` runtime function
 * ------------------*/

/* eslint-disable strict, no-new-func, prefer-template */

// Imports
const constViolation = require('./constViolation.js');

// Exports

module.exports = (code, localEval, isStrict, ...varMappings) => {
	// Get unused var name
	const safeVarName = '_' + varMappings.reduce(
		(longestName, [, externalName]) => (
			externalName.length > longestName.length ? externalName : longestName
		),
		''
	);

	// Create object to use in `with() {}` to redirect access to external vars
	const withObj = Object.create(null);
	let thisValue;
	for (const [varName, externalName, isConst] of varMappings) {
		const get = () => localEval(externalName);
		if (varName === 'this') {
			thisValue = get();
		} else {
			const set = isConst
				? constViolation
				: localEval(`(function(${safeVarName}){${externalName}=${safeVarName}})`);
			Object.defineProperty(withObj, varName, {get, set});
		}
	}

	// Execute code in global scope, with access to local vars via `with () {}` object getters/setters
	if (isStrict) code = `'"use strict";'+${code}`;
	const firstVarName = varMappings[0][0];
	return new Function(
		firstVarName,
		`with (${firstVarName}) { return eval(${code}) }`
	).call(thisValue, withObj);
};
