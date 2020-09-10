/* --------------------
 * livepack module
 * External functions
 * These functions are used within output.
 * ------------------*/

'use strict';

// Exports

const createArguments = (0, function() { return arguments; }); // eslint-disable-line prefer-rest-params

const createBinding = (0, () => {
	let bound;
	return [
		(...vars) => bound(...vars),
		_bound => bound = _bound // eslint-disable-line no-return-assign
	];
});

const getCallSite = (0, () => {
	const obj = {};
	const {prepareStackTrace} = Error;
	Error.prepareStackTrace = (_, stack) => stack;
	Error.captureStackTrace(obj);
	const CallSite = obj.stack[0].constructor;
	Error.prepareStackTrace = prepareStackTrace;
	return CallSite;
});

module.exports = {
	createArguments,
	createBinding,
	getCallSite
};
