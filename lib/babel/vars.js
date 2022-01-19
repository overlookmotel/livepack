/* --------------------
 * livepack module
 * Babel plugin function to record var use
 * ------------------*/

'use strict';

// Imports
const {initBlockScope} = require('./blocks.js');

// Exports

/**
 * Record use of var.
 * Record on current function, and all functions above, up until function where var originates.
 * @param {string} varName - Var name
 * @param {Object} block - Block props object
 * @param {boolean} isReadFrom - `true` if var is read from
 * @param {boolean} isAssignedTo - `true` if var is written to
 * @param {boolean} isFunction - `true` if var is reference to function name
 * @param {boolean} shouldRecordTrail - `true` if should record trail to var
 * @param {Object} state - State object
 * @returns {Array<Object>} - Array of function props objects
 */
module.exports = function recordVarUse(
	varName, block, isReadFrom, isAssignedTo, isFunction, shouldRecordTrail, state
) {
	// Init scope ID var on statement block which includes var definition
	initBlockScope(block, state);

	const blockId = block.id,
		fns = [];
	let fn = state.currentFunction,
		firstVarProps;
	while (true) { // eslint-disable-line no-constant-condition
		// Record var on this function's scopes
		const fnScopes = fn.scopes,
			scope = fnScopes.get(blockId);
		let vars;
		if (!scope) {
			vars = Object.create(null);
			fnScopes.set(blockId, {block, vars});
		} else {
			vars = scope.vars;

			// Stop if already recorded on this function (and therefore also on parents)
			const varProps = vars[varName];
			if (varProps) {
				if (!firstVarProps) firstVarProps = varProps;
				break;
			}
		}

		const varProps = {isReadFrom: false, isAssignedTo: false, isFunction, trails: []};
		vars[varName] = varProps;
		if (!firstVarProps) firstVarProps = varProps;

		// Add to array of functions
		fns.push(fn);

		// Step down to function above
		fn = fn.parent;
		if (!fn) break;

		// Stop if reached function where var originates
		if (fn.id <= blockId) break;
	}

	// Set read/written flags on first function scope only
	if (isReadFrom) firstVarProps.isReadFrom = true;
	if (isAssignedTo) firstVarProps.isAssignedTo = true;
	if (shouldRecordTrail) firstVarProps.trails.push([...state.trail]);

	// Return array of function props objects (used in `processArguments()` and `superVisitor()`)
	return fns;
};
