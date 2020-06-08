/* --------------------
 * livepack module
 * Tracker
 * ------------------*/

'use strict';

// Exports

module.exports = tracker;

const fns = [];
const invocations = [];

function tracker(values, fnId, parentInvocationId) {
	// If in get values mode, throw object for serializer to catch
	// eslint-disable-next-line no-throw-literal
	if (tracker.getValues) throw {fnId, vars: values, parentInvocationId};

	// Record invocation details
	const invocationId = invocations.length;
	invocations[invocationId] = {fnId, invocationId, parentInvocationId};
	return invocationId;
}

tracker.getValues = false;
tracker.fns = fns;
tracker.invocations = invocations;
