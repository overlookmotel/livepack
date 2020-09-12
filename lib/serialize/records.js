/* --------------------
 * livepack module
 * Functions to create dependencies
 * ------------------*/

'use strict';

// Modules
const {upperFirst} = require('lodash'),
	t = require('@babel/types');

// Imports
const {deleteItem} = require('./utils.js');

// Exports

module.exports = {
	createRecord,
	createFile,
	createBlock,
	updateBlockParent,
	createScope,
	updateScopeParent,
	createDependency,
	createAssignment
};

/**
 * Create record.
 * @param {string} name - Name to use for var name
 * @param {*} [val] - Value record is for
 * @returns {Object} - Record object
 */
function createRecord(name, val) {
	return {
		val,
		varNode: t.identifier(name),
		node: undefined,
		dependencies: [],
		dependents: [],
		assignments: undefined,
		scope: undefined
	};
}

/**
 * Create file object.
 * @param {string} filename - File path
 * @param {Object} files - Files map object
 * @returns {Object} - File object
 */
function createFile(filename, files) {
	const file = {
		blocks: new Map(), // Keyed by block ID
		functions: new Map() // Keyed by function ID
	};
	files[filename] = file;
	return file;
}

/**
 * Create block object.
 * @param {number} [id] - Block ID
 * @param {string} name - Block name
 * @param {Object} parent - Parent block object
 * @param {Map} [blocks] - Map of blocks, keyed by block ID
 * @returns {Object} - Block object
 */
function createBlock(id, name, parent, blocks) {
	const block = {
		id,
		name,
		parent,
		children: [],
		functions: [],
		scopes: new Map(), // Keyed by scope ID
		paramNames: new Set(),
		frozenNames: new Set(),
		argNames: undefined
	};
	if (parent) parent.children.push(block);
	if (blocks) blocks.set(id, block);
	return block;
}

/**
 * Update parent for existing block.
 *
 * The new parent may be above or below current parent in hierarchy.
 * The parentage of previously-recorded block chain is interleaved with new parent's block chain.
 * e.g. If:
 *   - current block has ID 6 with ancestors 4 and 2,
 *   - new parent has ID 5 with with ancestors 3 and 1
 * then the chains are joined 5 -> 4 -> 3 -> 2 -> 1.
 *
 * The parent may be in a higher block than current scope.
 * Block 4, current parentage 2 -> 1, new parent 3 -> 1 => result 4 -> 3 -> 2 -> 1.
 *
 * NB Block IDs are always higher for more deeply nested blocks.
 * i.e. for `function x() { function y() {} }`, `y` will have higher block ID than `x`.
 *
 * @param {Object} block - Block object
 * @param {Object} parent - Block object for new parent
 * @returns {undefined}
 */
function updateBlockParent(block, parent) {
	while (true) { // eslint-disable-line no-constant-condition
		// Locate where to insert parent in scope chain
		let nextBlock = block.parent;
		while (true) { // eslint-disable-line no-constant-condition
			if (nextBlock === parent) return;
			if (nextBlock.id < parent.id) break;
			block = nextBlock;
			nextBlock = block.parent;
		}

		// Insert parent
		block.parent = parent;
		deleteItem(nextBlock.children, block);
		parent.children.push(block);

		// Step down block chain and repeat.
		// Swap `parent` and `block` if necessary to ensure `block` is nested inside `parent`.
		block = nextBlock;
		if (parent.id > block.id) [block, parent] = [parent, block];
	}
}

/**
 * Create scope object
 * @param {number} [id] - Scope ID
 * @param {Object} block - Block this scope is an instance of
 * @param {Object|null} parent - Parent scope object
 * @returns {Object} - Scope object
 */
function createScope(id, block, parent) {
	const scope = {
		values: Object.create(null),
		block,
		parent,
		record: createRecord(`scope${upperFirst(block.name)}`)
	};

	block.scopes.set(id || scope, scope); // `scope` used as unique key for virtual scopes

	return scope;
}

/**
 * Update parent for existing scope.
 * Same logic as `updateBlockParent()` above.
 * NB While block IDs are always higher for nested scopes, scope IDs are not necessarily.
 * Scope IDs are allocated in order functions are called, which may not correspond to
 * the relative nesting of the blocks they sit in.
 *
 * @param {Object} scope - Scope object
 * @param {Object} parent - Scope object for new parent
 * @returns {undefined}
 */
function updateScopeParent(scope, parent) {
	while (true) { // eslint-disable-line no-constant-condition
		// Locate where to insert parent in scope chain
		let nextScope = scope.parent;
		while (true) { // eslint-disable-line no-constant-condition
			if (nextScope === parent) return;
			if (nextScope.block.id < parent.block.id) break;
			scope = nextScope;
			nextScope = scope.parent;
		}

		// Insert parent
		scope.parent = parent;

		// Step down scope chain and repeat.
		// Swap `parent` and `scope` if necessary to ensure `scope` is nested inside `parent`.
		scope = nextScope;
		if (parent.block.id > scope.block.id) [scope, parent] = [parent, scope];
	}
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
	if (!dependencyRecord.dependents) return;

	// Register dependency
	srcRecord.dependencies.push({record: dependencyRecord});
	dependencyRecord.dependents.push({record: srcRecord, node, key});
}

/**
 * Record assignment.
 * @param {Object} record - Record for value which is being assigned to
 * @param {Object} node - AST for assignment expression
 * @param {Object} [parentNode] - Node where var for value being assigned to is used in assignment
 * @param {string|number} [key] - Property of `parentNode` where usage of dependency is
 * @param {boolean} [addAtStart=false] - If `true`, assignment made first assignment
 * @returns {Object} - Assignment object
 */
function createAssignment(record, node, parentNode, key, addAtStart) {
	const assignment = {node, dependencies: []};

	const {assignments} = record;
	if (assignments) {
		if (addAtStart) {
			assignments.unshift(assignment);
		} else {
			assignments.push(assignment);
		}
	} else {
		record.assignments = [assignment];
	}

	if (parentNode) createDependency(assignment, record, parentNode, key);

	return assignment;
}
