/* --------------------
 * livepack module
 * Functions to handle `with` statements
 * ------------------*/

/* eslint-disable no-restricted-properties, no-extend-native */

'use strict';

// Modules
const assert = require('simple-invariant');

// Imports
const {withBypassIsEnabled} = require('../shared/with.js'),
	{INTERNAL_VAR_NAMES_PREFIX} = require('../shared/constants.js');

// Exports

module.exports = addWrapWithFunctionToTracker;

const nativeEval = eval; // eslint-disable-line no-eval

let withState;

/**
 * Add `wrapWith` function to tracker.
 *
 * `with` statements present 2 problems for instrumentation:
 *
 * 1. Tracker calls need to get the values of vars outside the `with ()`,
 *    but `with ()` could block access to them.
 * 2. `with ()` can block access to Livepack's internal vars (e.g. `livepack_tracker`),
 *    causing Livepack's internal mechanisms to malfunction.
 *
 * In both cases, it's necessary to "smuggle" the values of variables outside `with ()` to inside,
 * so that properties of the `with ()` object can't interfere with them.
 *
 * The only solution which works in all cases is to temporarily write values to a global,
 * and then retrieve them inside `with ()`.
 *
 * To avoid this being visible to user code, repurpose an existing global function
 * `Object.prototype.__defineSetter__`.
 * `__defineSetter__` is chosen because it's fairly obscure, but could use any method.
 *
 * `with (obj) x();` is instrumented as:
 *
 * ```
 * with (
 *   livepack_tracker.wrapWith(
 *     obj,
 *     (eval, livepack_temp_3) => eval(livepack_temp_3),
 *     () => eval
 *   )
 * ) with ( {}.__defineSetter__() ) x();
 * ```
 *
 * `wrapWith()` stores the 2 functions in `withState`, and `{}.__defineSetter__()` retrieves them again.
 * `__defineSetter__()` returns a Proxy which allows dynamically overriding the original `with ()`
 * by using the 2 functions `wrapWith()` was called with to access any var outside the `with ()`.
 * This Proxy is used as the value for a 2nd `with ()` which is inserted inside the original.
 *
 * @param {Function} tracker - Tracker function
 * @param {number} prefixNum - Internal vars prefix num
 * @returns {undefined}
 */
function addWrapWithFunctionToTracker(tracker, prefixNum) {
	tracker.wrapWith = (withValue, runEval, getEval) => {
		// Don't do anything if `null` or `undefined`, as it will error
		if (withValue == null) return withValue;

		// Throw an error if user has changed value of `Object.prototype.__defineSetter__`
		const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, '__defineSetter__');
		assert(
			// eslint-disable-next-line no-use-before-define
			descriptor?.value === shimmedDefineSetter,
			'Livepack shims `Object.prototype.__defineSetter__` to instrument `with` statements.'
			+ "It has been altered in user code, which prevents Livepack's correct functioning."
		);

		// Store state for shimmed `__defineSetter__` to retrieve
		withState = [prefixNum, runEval, getEval];

		// Return original `with` value
		return withValue;
	};
}

// Shim `Object.prototype.__defineSetter__`.
// NB: This code runs before globals are catalogued.
// Define replacement as a method, as original does not have a `prototype` property.
// 2 function params to maintain original's `.length` property.
const defineSetter = Object.prototype.__defineSetter__;
const shimmedDefineSetter = {
	__defineSetter__(_x, _y) { // eslint-disable-line no-unused-vars
		// If being used normally, defer to original
		// eslint-disable-next-line prefer-rest-params
		if (!withState) return defineSetter.apply(this, arguments);

		// Is being used to smuggle values into `with ()`.
		// Get state previously stored by `wrapWith()`.
		const [prefixNum, runEval, getEval] = withState;
		withState = undefined;

		const internalVarsPrefix = `${INTERNAL_VAR_NAMES_PREFIX}${prefixNum || ''}_`;

		// Return Proxy to be used as object in inner `with ()` statement.
		// Proxy is transparent unless either:
		// 1. Currently getting scope vars in tracker call.
		// 2. Var being accessed is one of Livepack's internal vars.
		// In these cases, intercept access which would otherwise hit the outer `with ()`,
		// and instead use the `runEval()` function to get/set the variable outside `with ()`.
		// If var being accessed is called `eval`, use `getEval()` instead.
		return new Proxy(Object.create(null), {
			has(target, key) {
				return withBypassIsEnabled() || key.startsWith(internalVarsPrefix);
			},
			get(target, key) {
				if (key === Symbol.unscopables) return undefined;
				if (key === 'eval') return getEval();
				return runEval(nativeEval, key);
			},
			set(target, key, value) {
				// Only used for setting internal temp vars, so no need to handle if key is `v` or `eval`
				const set = runEval(nativeEval, `v => ${key} = v`);
				set(value);
				return true;
			}
		});
	}
}.__defineSetter__;

Object.prototype.__defineSetter__ = shimmedDefineSetter;
