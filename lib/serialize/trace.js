/* --------------------
 * livepack module
 * Tracing for debug messages about untracked functions.
 * ------------------*/

'use strict';

// Exports

module.exports = {
	initTrace() {
		this.traceStack = [];
	},

	withTrace(fn, trace) {
		const {traceStack} = this;
		traceStack.push(trace);
		const res = fn();
		traceStack.pop();
		return res;
	},

	getTraceStack() {
		return `  ${this.traceStack.join('\n  ')}`;
	}
};
