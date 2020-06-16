/* eslint-disable no-console, camelcase */

'use strict';

function createScope1(a) {
	return [function createScope2(b) {
		function inner() {
			console.log(`a = ${a}, b = ${b}`);
			a++;
			b += 100;
		}
		return [inner];
	}];
}

const scope101 = createScope1(2),
	createScope101_2 = scope101[0],
	scope102 = createScope101_2(1),
	scope103 = createScope101_2(101),
	a = scope102[0],
	b = scope103[0],
	c = {inner1: a, inner2: b};
module.exports = c;

// Compacts down to:
// const createScope2 = createScope1(2)[0];
// module.exports = {inner1: createScope2(1)[0], inner2: createScope2(101)[0]};

const topBlocks = [ // eslint-disable-line no-unused-vars
	{
		id: 1,
		children: [
			{
				id: 2,
				children: [],
				functions: [
					{
						id: 3,
						node: {
							type: 'FunctionExpression',
							id: {/* Node */},
							params: [],
							body: {/* Node */}
						},
						instances: [
							{val: {/* inner fn instance 1 */}, scope: {id: 102}},
							{val: {/* inner fn instance 2 */}, scope: {id: 103}}
						]
					}
				],
				scopes: [
					{id: 102, values: {b: {/* Node */}}, parentScope: {id: 101}},
					{id: 103, values: {b: {/* Node */}}, parentScope: {id: 101}}
				],
				params: ['b'],
				argNames: undefined
			}
		],
		functions: [],
		scopes: [
			{id: 101, values: {a: {/* Node */}}, parentScope: null}
		],
		params: ['a'],
		argNames: undefined
	}
];
