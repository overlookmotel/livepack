/* --------------------
 * livepack module
 * `evalInScope()` runtime function
 * ------------------*/

/* eslint-disable strict */

// Imports
const constViolation = require('./constViolation.js'),
	getOwnPropertyNamesAndSymbols = require('./getOwnPropertyNamesAndSymbols.js');

// Exports

const {
	create: objectCreate, getOwnPropertyDescriptor, defineProperty,
	getPrototypeOf, setPrototypeOf: objectSetPrototypeOf,
	isFrozen, freeze, isSealed, seal, isExtensible, preventExtensions
} = Object;

const deleteKeys = ['length', 'callee'];
if (typeof Symbol === 'function' && Symbol.iterator) deleteKeys.push(Symbol.iterator);

// eslint-disable-next-line no-return-assign, no-proto
const setPrototypeOf = objectSetPrototypeOf || ((obj, proto) => obj.__proto__ = proto);

module.exports = (code, localEval, isStrict, thisIsStrict, ...varMappings) => {
	// Get unused var names
	const longestVarNames = ['', ''];
	varMappings.forEach((varMapping) => {
		longestVarNames.forEach((longestVarName, i) => {
			if (varMapping[i].length > longestVarName.length) longestVarNames[i] = varMapping[i];
		});
	});
	const updateArgumentsVarName = `_${longestVarNames[0]}`,
		safeExternalName = `_${longestVarNames[1]}`;

	// Create object to use in `with() {}` to redirect access to external vars
	const withObj = objectCreate(null);
	let thisValue, argumentsValue;
	varMappings.forEach(([varName, externalName, isConst]) => {
		const get = () => localEval(externalName);
		if (varName === 'this') {
			thisValue = get();
		} else if (thisIsStrict && varName === 'arguments') {
			argumentsValue = get();

			// Create temp var inside `eval()` which deletes itself as soon as the function is called
			withObj[updateArgumentsVarName] = (argumentsLocal) => {
				delete withObj[updateArgumentsVarName];

				// Delete initial keys on arguments object inside `eval()` if not present
				deleteKeys.forEach((key) => {
					if (!getOwnPropertyDescriptor(key)) delete argumentsLocal[key];
				});

				// Add getters/setters for all props to arguments object inside `eval()`
				// TODO Does not handle `delete arguments[0]` inside `eval()`
				// TODO Does not handle addition of new properties `arguments.x = 1` inside `eval()`
				getOwnPropertyNamesAndSymbols(argumentsValue).forEach((key) => {
					if (key !== 'callee') {
						const descriptor = getOwnPropertyDescriptor(argumentsValue, key);
						defineProperty(argumentsLocal, key, {
							get: () => argumentsValue[key],
							set(v) { argumentsValue[key] = v; },
							enumerable: descriptor.enumerable,
							configurable: descriptor.configurable
						});
					}
				});

				// Set prototype and extensibility of `arguments` inside `eval()`
				setPrototypeOf(argumentsLocal, getPrototypeOf(argumentsValue));
				if (isFrozen(argumentsValue)) {
					freeze(argumentsLocal);
				} else if (isSealed(argumentsValue)) {
					seal(argumentsLocal);
				} else if (!isExtensible(argumentsValue)) {
					preventExtensions(argumentsLocal);
				}
			};
		} else {
			const set = isConst
				? constViolation
				: localEval(`(function(${safeExternalName}){${externalName}=${safeExternalName}})`);
			defineProperty(withObj, varName, {get, set});
		}
	});

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
