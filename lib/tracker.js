/* --------------------
 * livepack module
 * Tracker
 * ------------------*/

'use strict';

// Exports

module.exports = tracker;

let nextScopeId = 1;
let callback;

function tracker(...scopeVars) {
	if (callback) {
		if (scopeVars.length === 0) return null;

		callback(scopeVars);
		callback = undefined;
		return null;
	}

	return nextScopeId++;
}

tracker.setCallback = (_callback) => {
	callback = _callback;
};
