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

const scope1 = createScope1(2),
	createScope1_2 = scope1[0],
	scope2 = createScope1_2(1),
	scope3 = createScope1_2(101),
	a = scope2[0],
	b = scope3[0],
	c = {inner1: a, inner2: b};
module.exports = c;

// Compacts down to:
// const createScope2 = createScope1(2)[0];
// module.exports = {inner1: createScope2(1)[0], inner2: createScope2(101)[0]};
