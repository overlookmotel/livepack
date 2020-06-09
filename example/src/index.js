'use strict';

const a = 1;

// let set;
function outer() {
	let b = a;
	const c = a;

	return function inner(x) {
		console.log(`a = ${a}, b = ${b}, c = ${c}`); // eslint-disable-line no-console
		b += x;
	};
}

const inner1 = outer();
inner1(10);
inner1(10);
const inner2 = outer();
inner2(10);

module.exports = {inner1, inner2};
