/* --------------------
 * livepack module
 * Tracker
 * ------------------*/

'use strict';

// Exports

module.exports = tracker;

const fns = [];
const scopes = [];

function tracker(values, fnId, parentScopeId) {
	// If in get values mode, throw object for serializer to catch
	// eslint-disable-next-line no-throw-literal
	if (tracker.getValues) throw {fnId, values, parentScopeId};

	// Record scope details
	const scopeId = scopes.length;
	scopes[scopeId] = {fnId, scopeId, parentScopeId, values: undefined};
	return scopeId;
}

tracker.getValues = false;
tracker.fns = fns;
tracker.scopes = scopes;
