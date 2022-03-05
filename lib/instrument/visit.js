/* --------------------
 * livepack module
 * Code instrumentation visit functions
 * ------------------*/

'use strict';

// Modules
const assert = require('simple-invariant');

// Exports

module.exports = {
	visitKey,
	visitKeyMaybe,
	visitKeyContainer,
	visitKeyContainerWithEmptyMembers,
	visitContainer,
	visitWith
};

/**
 * Visit a node's child.
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Key on node to visit
 * @param {Function} visit - Visitor function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitKey(parent, key, visit, state) {
	state.trail.push(key);
	visit(parent[key], state, parent, key);
	state.trail.pop();
}

/**
 * Visit a node's child if it isn't `null`.
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Key on node to visit
 * @param {Function} visit - Visitor function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitKeyMaybe(parent, key, visit, state) {
	const node = parent[key];
	if (node) {
		state.trail.push(key);
		visit(node, state, parent, key);
		state.trail.pop();
	}
}

/**
 * Visit a node's child which is a container (i.e. array of nodes).
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Key on node to visit
 * @param {Function} visit - Visitor function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitKeyContainer(parent, key, visit, state) {
	const container = parent[key];
	if (container.length === 0) return;

	const {trail} = state;
	trail.push(key);
	for (let index = 0; index < container.length; index++) {
		trail.push(index);
		visit(container[index], state, container, index);
		trail.pop();
	}
	trail.pop();
}

/**
 * Visit a node's child which is a container where some members may be `null`
 * e.g. `ArrayExpression` members.
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Key on node to visit
 * @param {Function} visit - Visitor function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitKeyContainerWithEmptyMembers(parent, key, visit, state) {
	const container = parent[key];
	if (container.length === 0) return;

	const {trail} = state;
	trail.push(key);
	for (let index = 0; index < container.length; index++) {
		const node = container[index];
		if (node) {
			trail.push(index);
			visit(node, state, container, index);
			trail.pop();
		}
	}
	trail.pop();
}

/**
 * Visit container members.
 * @param {Array} container - AST container (i.e. array of AST nodes)
 * @param {Function} visit - Visitor function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitContainer(container, visit, state) {
	const {trail} = state;
	for (let index = 0; index < container.length; index++) {
		trail.push(index);
		visit(container[index], index);
		trail.pop();
	}
}

/**
 * Visit AST node with visitor depending on node's type.
 * @param {Object} node - AST node
 * @param {Object} visitors - Map of AST node types to visitor functions
 * @param {string} name - Type
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Key on node to visit
 * @returns {undefined}
 */
function visitWith(node, visitors, name, state, parent, key) {
	const visit = visitors[node.type];
	// `!visit` guard to avoid evaluating template string unless error. This is a hot path.
	if (!visit) assert(false, `Unexpected ${name} type '${node.type}'`);
	visit(node, state, parent, key);
}
