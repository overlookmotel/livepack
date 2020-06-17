'use strict';

// Block 1, scope 101
let a = 1;

function outer() { // Block 2, scope 102, 103
	let b = a;

	return function inner() { // Block 3
		console.log(`a = ${a}, b = ${b}`); // eslint-disable-line no-console
		a++;
		b += 10;
	};
}

const inner1 = outer(); // From scope 102
const inner2 = outer(); // From scope 103
inner2();

module.exports = {inner1, inner2};
