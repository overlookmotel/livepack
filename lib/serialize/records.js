/* --------------------
 * livepack module
 * Functions to create dependencies
 * ------------------*/

'use strict';

// Modules
const {upperFirst} = require('lodash'),
	t = require('@babel/types');

// Exports

module.exports = {
	createRecord,
	createBlock,
	createScope,
	createDependency,
	createAssignment
};

/**
 * Create record.
 * @param {string} name - Name to use for var name
 * @returns {Object} - Record object
 */
function createRecord(name) {
	return {
		varNode: t.identifier(name),
		node: undefined,
		dependencies: [],
		dependents: [],
		assignments: undefined,
		scope: undefined
	};
}

/**
 * Create block object.
 * @param {number} [id] - Block ID
 * @param {string} name - Block name
 * @param {Object} parentBlock - Parent block object
 * @param {Map} [blocks] - Map of blocks, keyed by block ID
 * @returns {Object} - Block object
 */
function createBlock(id, name, parentBlock, blocks) {
	const block = {
		id,
		name,
		children: [],
		functions: [],
		scopes: new Map(), // Keyed by scope ID
		paramNames: new Set(),
		argNames: undefined
	};
	if (parentBlock) parentBlock.children.push(block);
	if (blocks) blocks.set(id, block);
	return block;
}

/**
 * Create scope object
 * @param {number} [id] - Scope ID
 * @param {Object} block - Block this scope is an instance of
 * @param {Object|null} parentScope - Parent scope object
 * @returns {Object} - Scope object
 */
function createScope(id, block, parentScope) {
	const scope = {
		id,
		values: {},
		parentScope,
		record: createRecord(`scope${upperFirst(block.name)}`)
	};

	block.scopes.set(id || scope, scope); // `scope` used as unique key for virtual scopes

	return scope;
}

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