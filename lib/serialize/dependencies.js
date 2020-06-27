/* --------------------
 * livepack module
 * Functions to create dependencies
 * ------------------*/

'use strict';

// Exports

module.exports = {
	createDependency,
	createAssignment
};

/**
 * Create dependency relationship between two values.
 * @param {Object} srcRecord - Record for value which depends on the other
 * @param {Object} dependencyRecord - Record for the value which is the dependency
 * @param {Object} node - Parent of AST node where the usage of dependency is
 * @param {string|number} key - Property of `node` where usage of dependency is
 * @returns {undefined}
 */
function createDependency(srcRecord, dependencyRecord, node, key) {
	// Skip primitives
	if (!dependencyRecord.varNode) return;

	// Register dependency
	srcRecord.dependencies.push({record: dependencyRecord});
	dependencyRecord.dependents.push({record: srcRecord, node, key});
}

/**
 * Record assignment.
 * @param {Object} record - Record for value which is being assigned to
 * @param {Object} node - AST for assignment expression
 * @returns {Object} - Assignment object
 */
function createAssignment(record, node) {
	const assignment = {node, dependencies: []};

	const {assignments} = record;
	if (assignments) {
		assignments.push(assignment);
	} else {
		record.assignments = [assignment];
	}

	return assignment;
}
