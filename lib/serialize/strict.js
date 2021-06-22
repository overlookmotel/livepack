/* --------------------
 * livepack module
 * Utility functions for strict mode
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Exports

module.exports = {
	addStrictDirectiveToFunction,
	addStrictDirectiveToFunctionMaybeWrapped,
	addStrictDirectiveToBlock
};

/**
 * Add 'use strict' directive to function or object-wrapped method.
 * i.e. `() => {}`, `function() {}`, or `{x() {}}.x`.
 * Must not be wrapped in `Object.assign()` etc.
 *
 * Try to add 'use strict' directive inside function body. but if this is not possible due to
 * function having non-simple params, wrap in an IIFE to make strict.
 * NB 'use strict' in function with non-simple params is syntax error.
 *
 * Return the wrapped node (or input node if 'use strict' could be added inside function).
 *
 * @param {Object} node - Function/object-wrapped method Babel node
 * @returns {Object} - Wrapped node, or input node if 'use strict' directive inserted into fn body
 */
function addStrictDirectiveToFunction(node) {
	const directiveHasBeenAdded = addStrictDirectiveToFunctionBody(node);
	return directiveHasBeenAdded ? node : wrapInStrictIIFE(node);
}

/**
 * Add 'use strict' directive to function or object-wrapped method.
 * Same as `addStrictDirectiveToFunction()` above, but also handles input already wrapped in
 * `Object.defineProperties(fn, {...})` / `Object.assign(fn, {...})` etc.
 *
 * If input is wrapped in e.g. `Object.assign()`, IIFE is inserted *inside* the wrappers so any other
 * functions in the wrapper are not made strict.
 * e.g. `Object.assign( (n = 1) => n, { x: function other() {} } )`
 * -> `Object.assign( (() => { 'use strict'; return (n = 1) => n })(), { x: function other() {} } )`
 * Note that `function other() {}` is not made strict.
 *
 * @param {Object} node - Function/object-wrapped method Babel node
 * @returns {Object} node - Wrapped node, or input node if 'use strict' directive inserted into fn body
 */
function addStrictDirectiveToFunctionMaybeWrapped(node) {
	// Traverse past `Object.assign()` etc wrappers
	let fnNode = node,
		parentNode;
	while (t.isCallExpression(fnNode)) {
		parentNode = fnNode.arguments;
		fnNode = parentNode[0];
	}

	// Attempt to add directive within function body
	const directiveHasBeenAdded = addStrictDirectiveToFunctionBody(fnNode);
	if (directiveHasBeenAdded) return node;

	// Could not add directive inside body - wrap in strict IIFE instead
	// If was not wrapped in `Object.assign()` etc, return IIFE
	if (!parentNode) return wrapInStrictIIFE(fnNode);

	// Was wrapped - insert IIFE inside wrapper and return input node
	parentNode[0] = wrapInStrictIIFE(fnNode);
	return node;
}

/**
 * Add 'use strict' directive to function / object-wrapped method.
 * Returns `true` if succeeds, `false` if cannot because function has non-simple params.
 * @param {Object} node - Babel node for function or object-wrapped method
 * @returns {boolean} - `true` if possible to add 'use strict' to function body
 */
function addStrictDirectiveToFunctionBody(node) {
	if (t.isMemberExpression(node)) {
		// Method (`{x() {}}.x`)
		node = node.object.properties[0];
		if (!functionHasSimpleParams(node)) return false;
	} else if (!functionHasSimpleParams(node)) {
		return false;
	} else if (t.isArrowFunctionExpression(node) && !t.isBlockStatement(node.body)) {
		// `() => x` => `() => { return x; }`
		node.body = t.blockStatement([t.returnStatement(node.body)]);
	}

	addStrictDirectiveToBlock(node.body);
	return true;
}

/**
 * Add 'use strict' directive to statement block.
 * @param {Object} blockNode - Statement block Babel node
 * @returns {Object} - Block node
 */
function addStrictDirectiveToBlock(blockNode) {
	blockNode.directives.unshift(t.directive(t.directiveLiteral('use strict')));
	return blockNode;
}

/**
 * Wrap node in strict mode IIFE.
 * @param {Object} node - Babel node
 * @returns {Object} - Wrapped node
 */
function wrapInStrictIIFE(node) {
	// `(() => {'use strict'; return ...})()`
	return t.callExpression(
		t.arrowFunctionExpression(
			[],
			addStrictDirectiveToBlock(t.blockStatement([
				t.returnStatement(node)
			]))
		),
		[]
	);
}

/**
 * Determine if a function/method node has only simple params.
 * `(x, y, z) => {}` -> true
 * `() => {}` -> true
 * `({x}) => {}` -> false
 * `([x]) => {}` -> false
 * `(x = 1) => {}` -> false
 * `(...x) => {}` -> false
 *
 * @param {Object} fnNode - Babel node for function or object/class method
 * @returns {boolean} - `true` if all params are simple
 */
function functionHasSimpleParams(fnNode) {
	return !fnNode.params.some(paramNode => !t.isIdentifier(paramNode));
}
