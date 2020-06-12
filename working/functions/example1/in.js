'use strict';

let a = 1;
function outer() {
	let b = a;

	return function inner() {
		console.log(`a = ${a}, b = ${b}`); // eslint-disable-line no-console
		a++;
		b += 100;
	};
}

const inner1 = outer();
const inner2 = outer();
inner2();

module.exports = {inner1, inner2};
