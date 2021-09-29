/* --------------------
 * livepack module
 * `evalInScope()` runtime function
 * ------------------*/

/* eslint-disable strict, no-new-func, prefer-template */

// Imports
const constViolation = require('./constViolation.js');

// Exports

module.exports = (code, localEval, isStrict, thisIsStrict, ...varMappings) => {
	// Get unused var name
	const safeVarName = '_' + varMappings.reduce(
		(longestName, [, externalName]) => (
			externalName.length > longestName.length ? externalName : longestName
		),
		''
	);

	// Create object to use in `with() {}` to redirect access to external vars
	const withObj = Object.create(null);
	let thisValue, argumentsValue;
	for (const [varName, externalName, isConst] of varMappings) {
		const get = () => localEval(externalName);
		if (varName === 'this') {
			thisValue = get();
		} else if (thisIsStrict && varName === 'arguments') {
			argumentsValue = get();
		} else {
			const set = isConst
				? constViolation
				: localEval(`(function(${safeVarName}){${externalName}=${safeVarName}})`);
			Object.defineProperty(withObj, varName, {get, set});
		}
	}

	// Execute code in global scope, with access to local vars via `with () {}` object getters/setters
	if (isStrict) code = `'"use strict";'+${code}`;
	code = `return eval(${code})`;

	const firstVarName = varMappings[0][0];
	const makeFunction = withBodyCode => (
		new Function(firstVarName, `with(${firstVarName}){${withBodyCode}}`)
	);

	if (thisIsStrict) {
		// TODO `arguments` inside eval is not connected to external arguments object.
		// TODO Also need to add any additional props
		return makeFunction(
			`return function() {"use strict";${code}}`
		)(withObj).apply(thisValue, argumentsValue);
	}

	return makeFunction(code).call(thisValue, withObj);
};
