/* --------------------
 * livepack module
 * Unit tests for code instrumentation
 * ------------------*/

'use strict';

// Modules
const {parse} = require('@babel/parser'),
	t = require('@babel/types'),
	{VISITOR_KEYS, FLOW_TYPES, JSX_TYPES, TYPESCRIPT_TYPES, traverseFast} = t;

// Imports
const {instrumentAst} = require('../../lib/instrument/index.js');

// Tests

const code1 = `
'use strict';
let a = [1, {x: 1}];
a = 'x' || /x/ || 10n || a\`\${a}\` && !a + 1 || true || null, 1 || void 0 || [...a] || {...a};
a = a.x || a['x'] || a?.y || a?.['x'];
a ? 1 : 2;
a();
a?.x();
let [b = 1, ...c] = a;
const {d, ...e} = a;
if (a) ;
function f(s = 1, [t, {u}, ...v], {w, p: x, y = 2} = {}, ...z) {
	return s;
}
(function() {});
() => a;
async () => await a;
function* g() {
	yield 1;
}
class A {
	aa = 1;
	static bb = 2;
	#cc = 3;
	static #dd = 4;
	ee() {}
	static ff() {}
	#gg() {}
	static #hh() {}
	static {
		this.x = 1;
	}
}
class B extends A {
	constructor() {
		super();
		super.x(this);
	}
	x() {}
}
(class C {});
(class D extends A {});
({x() {}})
new B();
debugger;
q: for (let h = 1; h < 2; h++) {
	continue q;
}
r: for (;;) break r;
for (a = 1; a < 2; a++) {}
for (const i of []) {}
for (a of []) {}
for (const j in {}) {}
for (a in {}) {}
while (false) ;
do {} while (false);
switch (a) {
	case 1: break
	default: a = 2
}
try {
	throw new Error('boom');
} catch (k) {
} finally {}
import {l} from 'x';
import m from 'x';
import * as n from 'x';
export const o = 1;
export function p() {}
export class q {}
export default function r() {}
let s;
export {s}
export {s as t}
export * from 'y';
export {s as u} from 'z';
export * as v from 'z';
(import('x'));
import.meta.url;
%DebugPrint(a);
`;

const code2 = `
const a = {x: 1};
with (a) x = 2;
with (a) {
	x = 3;
}
`;

const ignoredNodeTypes = new Set([
	// No need to visit
	'InterpreterDirective',
	// Not real node types
	'Noop',
	'Placeholder',
	// New AST node type introduced in Babel v7.23.0, but usage disabled by default
	// https://github.com/babel/babel/pull/15682
	'ImportExpression',
	// ECMA proposals not adopted yet
	'ArgumentPlaceholder',
	'BindExpression',
	'ClassAccessorProperty',
	'DecimalLiteral',
	'Decorator',
	'DoExpression',
	'ExportDefaultSpecifier',
	'ImportAttribute',
	'ModuleExpression',
	'PipelineBareFunction',
	'PipelinePrimaryTopicReference',
	'PipelineTopicExpression',
	'RecordExpression',
	'TopicReference',
	'TupleExpression',
	// Not Javascript
	...FLOW_TYPES,
	...JSX_TYPES,
	...TYPESCRIPT_TYPES
]);

describe('Code instrumentation', () => {
	it('covers all Babel AST node types', () => {
		const visitedNodeTypes = new Set();
		function testCode(code, sourceType) {
			const ast = parse(code, {sourceType, plugins: ['v8intrinsic']});
			ast.program.body.push(t.expressionStatement(t.parenthesizedExpression(t.numericLiteral(1))));

			traverseFast(ast, node => visitedNodeTypes.add(node.type));

			instrumentAst(ast, {filename: __filename, sourceType: 'script'});
		}

		testCode(code1, 'module');
		testCode(code2, 'script');

		const missedTypes = Object.keys(VISITOR_KEYS).filter(
			type => !visitedNodeTypes.has(type) && !ignoredNodeTypes.has(type)
		);
		expect(missedTypes).toHaveLength(0);
	});
});
