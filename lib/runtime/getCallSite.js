/* --------------------
 * livepack module
 * `getCallSite()` runtime function
 * ------------------*/

'use strict';

// Exports

module.exports = () => {
	const obj = {};
	const {prepareStackTrace} = Error;
	Error.prepareStackTrace = (_, stack) => stack;
	Error.captureStackTrace(obj);
	const CallSite = obj.stack[0].constructor;
	Error.prepareStackTrace = prepareStackTrace;
	return CallSite;
};
