'use strict';

const r = {iAmR: true};
const q = {iAmQ: true, r};

const setters = [];
function outer() {
	let b = q;
	const c = q;

	setters.push(x => b = x); // eslint-disable-line no-return-assign

	function foo(q) { // eslint-disable-line no-shadow
		return q * 2;
	}

	if (q) {
		const d = 1;
		return function inner() {
			// eslint-disable-next-line no-console
			console.log(`a = ${q}, b = ${b}, c = ${c}, d = ${d}, foo = ${!!foo}`);
		};
	}
	return () => {};
}

const inner1 = outer();
const inner2 = outer();
const [set1, set2] = setters;
set1(10);
set2(20);

module.exports = {inner1, inner2};
