'use strict';

const a = 1;

// let set;
function outer() {
	let b = 2;

	return function inner(x) {
		b += x;
		console.log(`${a},${b}`); // eslint-disable-line no-console
	};
}

const inner = outer();
inner(10);

module.exports = inner;
