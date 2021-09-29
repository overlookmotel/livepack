/* --------------------
 * livepack module
 * `evalInScope()` runtime function
 * ------------------*/

/* eslint-disable strict */

// Imports
const constViolation = require('./constViolation.js');

// Exports

module.exports = (code, localEval, isStrict, thisIsStrict, ...varMappings) => {
	// Get unused var names
	let updateArgumentsVarName = '',
		safeExternalName = '';
	for (const [varName, externalName] of varMappings) {
		if (varName.length > updateArgumentsVarName.length) updateArgumentsVarName = varName;
		if (externalName.length > safeExternalName.length) safeExternalName = externalName;
	}
	updateArgumentsVarName += '_';
	safeExternalName += '_';

	// Create object to use in `with() {}` to redirect access to external vars
	const withObj = Object.create(null);
	let thisValue, argumentsValue;
	for (const [varName, externalName, isConst] of varMappings) {
		const get = () => localEval(externalName);
		if (varName === 'this') {
			thisValue = get();
		} else if (thisIsStrict && varName === 'arguments') {
			argumentsValue = get();

			// Create temp var inside `eval()` which deletes itself as soon as the function is called
			withObj[updateArgumentsVarName] = (argumentsLocal) => { // eslint-disable-line no-loop-func
				delete withObj[updateArgumentsVarName];

				// Delete initial keys on arguments object inside `eval()` if not present on external value
				for (const key of ['length', 'callee', Symbol.iterator]) {
					if (!Object.getOwnPropertyDescriptor(key)) delete argumentsLocal[key];
				}

				// Add getters/setters for all props to arguments object inside `eval()`
				// TODO Does not handle `delete arguments[0]` inside `eval()`
				// TODO Does not handle addition of new properties `arguments.x = 1` inside `eval()`
				const keys = Object.getOwnPropertyNames(argumentsValue)
					.concat(Object.getOwnPropertySymbols(argumentsValue));
				for (const key of keys) {
					if (key !== 'callee') {
						const descriptor = Object.getOwnPropertyDescriptor(argumentsValue, key);
						Object.defineProperty(argumentsLocal, key, {
							get: () => argumentsValue[key],
							set(v) { argumentsValue[key] = v; },
							enumerable: descriptor.enumerable,
							configurable: descriptor.configurable
						});
					}
				}

				// Set prototype and extensibility of `arguments` inside `eval()`
				Object.setPrototypeOf(argumentsLocal, Object.getPrototypeOf(argumentsValue));
				if (Object.isFrozen(argumentsValue)) {
					Object.freeze(argumentsLocal);
				} else if (Object.isSealed(argumentsValue)) {
					Object.seal(argumentsLocal);
				} else if (!Object.isExtensible(argumentsValue)) {
					Object.preventExtensions(argumentsLocal);
				}
			};
		} else {
			const set = isConst
				? constViolation
				: localEval(`(function(${safeExternalName}){${externalName}=${safeExternalName}})`);
			Object.defineProperty(withObj, varName, {get, set});
		}
	}

	// Execute code in global scope, with access to local vars via `with () {}` object getters/setters
	const firstVarName = varMappings[0][0];
	// eslint-disable-next-line no-new-func
	const makeFunction = () => new Function(firstVarName, `with(${firstVarName}){${code}}`);

	if (isStrict) code = `'"use strict";'+${code}`;
	code = `return eval(${code})`;

	if (!thisIsStrict) return makeFunction().call(thisValue, withObj);

	if (argumentsValue) code = `${updateArgumentsVarName}(arguments);${code}`;
	code = `return function(){"use strict";${code}}`;
	return makeFunction()(withObj).call(thisValue);
};
