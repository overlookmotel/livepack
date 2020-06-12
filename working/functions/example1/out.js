/* eslint-disable no-console, no-shadow, no-var */

'use strict';

var scope0 = createScope0(2),
	createScope1 = scope0[0],
	scope1 = createScope1(1),
	scope2 = createScope1(101),
	a = scope1[0],
	b = scope2[0],
	c = {inner1: a, inner2: b};
module.exports = c;

// Compacts down to:
// var createScope1 = createScope0[0];
// module.exports = {inner1: createScope1(1)[0], inner2: createScope1(2)[0]};

function createScope0(a) {
	function createScope1(b) {
		var c = function inner() {
			console.log(`a = ${a}, b = ${b}`);
			a++;
			b += 100;
		};
		return [c];
	}

	return [createScope1];
}
