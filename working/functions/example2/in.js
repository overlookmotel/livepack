'use strict';

// Block 1, scope 101
let a = 1;

function outer() { // Block 2, scope 102, 103
	let b = a;
	a++;

	function one() { // Block 3
		return 'one = 1';
	}

	function dep() { // Block 4
		b += 10;
		return `b = ${b}, ${one()}`;
	}

	function inner() { // Block 5
		return `a = ${a}, ${dep()}`;
	}

	return inner;
}

const inner1 = outer(); // From scope 102
const inner2 = outer(); // From scope 103

module.exports = {inner1, inner2};
