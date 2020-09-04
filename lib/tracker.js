/* --------------------
 * livepack module
 * Tracker
 * ------------------*/

/* eslint-disable spaced-comment, max-len */

'use strict';

// Exports

module.exports = tracker;

let nextScopeId = 1;
let callback;

function tracker(...scopeVars) {
	/*livepack_track:{"id":2,"scopes":[{"blockId":1,"varNames":["callback","nextScopeId"],"blockName":"tracker"}],"filename":"tracker.js","untracked":"tracker"}*/
	if (callback) {
		if (scopeVars.length === 0) return null;

		const cb = callback;
		callback = undefined;

		cb(scopeVars);
		return null;
	}

	return nextScopeId++;
}

tracker.setCallback = (_callback) => {
	/*livepack_track:{"id":4,"scopes":[{"blockId":1,"varNames":["callback"],"blockName":"tracker"}],"filename":"tracker.js","untracked":"setCallback"}*/
	callback = _callback;
};
