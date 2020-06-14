/* --------------------
 * livepack module
 * Tracker
 * ------------------*/

'use strict';

// Exports

module.exports = tracker;

let nextScopeId = 1;

function tracker(fnId, scopeVars, argNames) {
	if (tracker.callback) {
		if (fnId === undefined) return null;
		return tracker.callback(fnId, scopeVars, argNames);
	}

	return nextScopeId++;
}

tracker.callback = undefined;
