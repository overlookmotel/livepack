'use strict';

const circularObj = {iAmCircularObj: true};
const circularObj2 = {iAmCircularObj2: true, circularObj};
circularObj.circularObj2 = circularObj2;

const circularArray = [];
circularArray[0] = circularArray;

const setters = [];
function outer() {
	let b = circularObj;
	const c = circularArray;

	setters.push(x => b = x); // eslint-disable-line no-return-assign

	function foo(b) { // eslint-disable-line no-shadow
		return b * 2;
	}

	if (b) {
		const d = 1;
		return function inner() {
			// eslint-disable-next-line no-console
			console.log(`circularObj = ${circularObj}, b = ${b}, c = ${c}, d = ${d}, foo = ${!!foo}`);
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
