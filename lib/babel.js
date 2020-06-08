/* --------------------
 * livepack module
 * Babel plugin
 * ------------------*/

/* eslint-disable no-console */

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const tracker = require('./tracker.js');

// Constants
const TRACKER_VAR_NAME = Symbol('livepack.TRACKER_VAR_NAME');

// Exports

module.exports = function livepackBabelPlugin() {
	return {
		visitor: {
			Program(path, state) {
				programVisitor(path, state);
			},
			Function(path, state) {
				functionVisitor(path, state);
			}
		}
	};
};

// Insert `const tracker = require('livepack/tracker');` statement at top of file
function programVisitor(path, state) {
	const varName = getLivepackVarName(path);

	path.get('body.0').insertBefore(
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					t.identifier(varName),
					t.callExpression(t.identifier('require'), [t.stringLiteral('livepack/tracker')])
				)
			]
		)
	);

	state[TRACKER_VAR_NAME] = varName;
}

// Get unique var name for livepack import
function getLivepackVarName(path) {
	const usedNums = [];
	path.traverse({
		Identifier(identifierPath) {
			const match = identifierPath.node.name.match(/^tracker([1-9]\d*)?$/);
			if (match) usedNums.push(match[1] * 1 || 0);
		}
	});

	usedNums.sort();
	let lastNum = -1;
	for (const usedNum of usedNums) {
		if (usedNum > lastNum + 1) break;
		lastNum = usedNum;
	}

	return `${'tracker'}${(lastNum + 1) || ''}`;
}

function functionVisitor(path, state) {
	const {node} = path;
	const locStart = node.loc.start;
	const key = `${state.filename}.${locStart.line}.${locStart.column}`;

	// debugPath('path', path);

	// Identify vars
	// const vars = [];

	// Insert break statement
	path.get('body.body.0').insertBefore(
		t.ifStatement(
			t.memberExpression(
				t.identifier(state[TRACKER_VAR_NAME]),
				t.identifier('on')
			),
			t.returnStatement(t.objectExpression([
				t.objectProperty(t.identifier('key'), t.stringLiteral(key))
			]))
		)
	);

	// Record this function
	tracker.fns[key] = {async: node.async, generator: node.generator};
}

function debugPath(name, path) {
	path = {...path};
	for (const key of ['parent', 'parentPath', 'scope', 'container', 'context', 'opts', 'contexts']) {
		delete path[key];
	}
	console.log(`${name}:`, path);
}
