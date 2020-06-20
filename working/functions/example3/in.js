/* eslint-disable no-constant-condition */

'use strict';

// Block 1, scope 101
let a = 1;

function outer() { // Block 2, scope 102, 104
	let b = a;
	a++;

	let dep;
	if (true) { // Block 3, scope 103, 105
		const c = b;
		dep = function() { // Block 4
			b += 10;
			return `b = ${b}, c = ${c}`;
		};
	}

	function inner() { // Block 5
		return `a = ${a}, ${dep()}`;
	}

	return inner;
}

const inner1 = outer(); // From scope 102
const inner2 = outer(); // From scope 104

module.exports = {inner1, inner2};
