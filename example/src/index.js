'use strict';

let a = 1;
function outer() {
	let b = a;

	if (b) {
		const c = b;
		return function inner() {
			console.log(`a = ${a}, b = ${b}, c = ${c}`); // eslint-disable-line no-console
			a++;
			b += 100;
		};
	}
	return () => {};
}

const inner1 = outer();
const inner2 = outer();
inner1();
inner2();
inner2();

module.exports = {inner1, inner2, outer};
