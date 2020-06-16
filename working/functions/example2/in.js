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

const inner102 = outer();
const inner103 = outer();

module.exports = {inner102, inner103};
