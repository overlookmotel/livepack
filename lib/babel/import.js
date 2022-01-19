/* --------------------
 * livepack module
 * Babel plugin import visitor
 * ------------------*/

'use strict';

// Exports

/**
 * Visitor to flag functions containing `import()`.
 * @param {Object} state - State object
 * @returns {undefined}
 */
module.exports = function importVisitor(state) {
	let fn = state.currentFunction;
	while (fn && !fn.containsImport) {
		fn.containsImport = true;
		fn = fn.parent;
	}
};
