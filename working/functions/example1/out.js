/* eslint-disable no-console, camelcase */

'use strict';

function createScope1(a) {
	return [function createScope2(b) {
		function inner() {
			console.log(`a = ${a}, b = ${b}`);
			a++;
			b += 10;
		}
		return [inner];
	}];
}

const scope101 = createScope1(2),
	createScope101_2 = scope101[0],
	scope102 = createScope101_2(1),
	a = scope102[0],
	scope103 = createScope101_2(11),
	b = scope103[0],
	c = {inner1: a, inner2: b};
module.exports = c;

// Compacts down to:
// const createScope101_2 = createScope1(2)[0];
// module.exports = {inner1: createScope101_2(1)[0], inner2: createScope101_2(11)[0]};
