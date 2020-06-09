'use strict';

const a = 1;

const setters = [];
function outer() {
	let b = a;
	const c = a;

	setters.push(function set(x) { // eslint-disable-line prefer-arrow-callback
		b = x;
	});

	return function inner() {
		console.log(`a = ${a}, b = ${b}, c = ${c}`); // eslint-disable-line no-console
	};
}

const inner1 = outer();
const inner2 = outer();
const [set1, set2] = setters;
set1(10);
set2(20);

module.exports = {outer, inner1, inner2, set1, set2};
