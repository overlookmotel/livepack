/* --------------------
 * livepack module
 * `unwrapScopeWrapper()` runtime function
 * ------------------*/

/* eslint-disable strict */

const {defineProperty} = Object;

/**
 * Throw error with specified constructor and remove livepack from stack trace.
 * @param {Function} ErrorClass - Error class
 * @param {string} message - Error message
 * @param {Function} thrower - Function to remove from stack trace
 * @throws {Error}
 */
const throwError = (0, (ErrorClass, message, thrower) => {
	const err = new ErrorClass(message);
	Error.captureStackTrace(err, thrower);
	throw err;
});

/**
 * Throw error when non-existent global var accessed.
 * @param {string} varName - Var name
 * @param {Function} thrower - Function to remove from stack trace
 * @throws {ReferenceError}
 */
const throwReferenceError = (0, (varName, thrower) => throwError(
	ReferenceError, `${varName} is not defined`, thrower
));

/**
 * Add property getter/setter which delegates to global.
 * i.e. Create property which hides a variable in scope.
 * @param {Object} withObj - Object
 * @param {string} varName - Var name
 * @returns {undefined}
 */
const createGlobalProxyProp = (0, (withObj, varName) => {
	const get = () => ((varName in global) ? global[varName] : throwReferenceError(varName, get)),
		// eslint-disable-next-line no-return-assign
		set = value => ((varName in global) ? global[varName] = value : throwReferenceError(varName, set));
	defineProperty(withObj, varName, {
		get,
		set,
		configurable: true // So can be overwritten if CommonJS property is used
	});
});

// TODO Deal with case where module namespace object and named export are both referenced
// and need to be kept in sync.

/**
 * Unwrap scope wrapper function and return a `createScope` function which behaves as usual.
 * Specified var names can be re-referenced with different var names.
 * @param {Function} wrapperFn - Scope wrapper function
 * @param {Array<string>} varNames - Var names which can be re-referenced
 * @return {Function} - `createScope` function
 */
module.exports = (wrapperFn, ...varNames) => (
	// Return `createScope()` function which behaves as usual
	(...values) => {
		// Substitute first value for `with(...) {}` object creation function
		const firstValue = values[0],
			getters = [];
		values[0] = (...newNames) => {
			const withObj = Object.create(null);

			// Hide CommonJS vars
			['module', 'exports', 'require', '__filename', '__dirname'].forEach(
				varName => createGlobalProxyProp(withObj, varName)
			);

			// Reference new name to old name
			newNames.forEach((newName, varIndex) => {
				if (newName) {
					// Hide original var
					createGlobalProxyProp(withObj, varNames[varIndex]);

					// Create getter/setter for new var name.
					// Setter throws because this var is a module
					defineProperty(withObj, newName, {
						get: () => getters[varIndex](),
						set: function throwConstError() {
							throwError(TypeError, 'Assignment to constant variable.', throwConstError);
						}
					});
				}
			});

			return withObj;
		};

		// Capture getters from array of functions returned
		const fns = wrapperFn(...values),
			numVars = varNames.length,
			numFns = fns.length - numVars - 1;
		for (let varIndex = 0, fnIndex = numFns + 1; varIndex < numVars; varIndex++) {
			getters[varIndex] = fns[fnIndex++];
		}

		// Set first value back to original value
		// TODO Reuse existing setter for first value if provided in original function array
		fns[numFns](firstValue);

		// Remove getters/setters from functions array and return
		fns.length = numFns;
		return fns;
	}
);
