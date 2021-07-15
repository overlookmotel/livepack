/* --------------------
 * livepack
 * Tests support function to reset split points
 * ------------------*/

'use strict';

// Imports
const internalSplitPoints = require('../../lib/shared/internal.js').splitPoints;

// Exports

/**
 * Clear set of splits.
 * Intended to be called with `afterEach()` to keep each test isolated.
 * Splits are stored globally.
 * Tests should still pass without this, but they run slower.
 * @returns {undefined}
 */
module.exports = function resetSplitPoints() {
	internalSplitPoints.clear();
};
