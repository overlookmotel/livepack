/* --------------------
 * livepack module
 * `with` bypass state
 * ------------------*/

'use strict';

// Exports

module.exports = {withBypassIsEnabled, enableWithBypass, disableWithBypass};

let isBypassEnabled = false;

/**
 * Get whether `with` bypass is currently enabled.
 * Used by `livepack_tracker.wrapWith()`.
 * @returns {boolean} - `true` if bypass is currently enabled
 */
function withBypassIsEnabled() {
	return isBypassEnabled;
}

/**
 * Enable `with` bypass.
 * @returns {undefined}
 */
function enableWithBypass() {
	isBypassEnabled = true;
}

/**
 * Disable `with` bypass.
 * @returns {undefined}
 */
function disableWithBypass() {
	isBypassEnabled = false;
}
