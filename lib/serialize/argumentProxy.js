/* --------------------
 * livepack module
 * Proxy to use as arguments
 * ------------------*/

'use strict';

// Constants
const NUM_ARG_ITERATIONS = 1000;

// Exports

/**
 * Create proxy to use as arguments for calling functions.
 * Any function can be called with `fn(...argumentsProxy)`.
 * Should never cause an error in destructuring or cause default expressions to be evaluated.
 * TODO Make better version with no limit on number of iterations, or find a better way to do this.
 */
const argumentProxy = new Proxy({}, {
	get(target, key) {
		if (key === Symbol.iterator) {
			let count = 0;
			return () => ({
				next() {
					count++;
					if (count === NUM_ARG_ITERATIONS) return {value: undefined, done: true};
					return {value: argumentProxy, done: false};
				}
			});
		}

		return argumentProxy;
	}
});

module.exports = argumentProxy;
