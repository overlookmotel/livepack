'use strict';

let a = 1;
function outer() {
	let b = a;

	return {
		inner() {
			return `a = ${a}, b = ${b}`;
		},
		setA(newA) {
			a = newA;
		},
		setB(newB) {
			b = newB;
		}
	};
}

const {inner: inner1, setA, setB: setB1} = outer();
setA(100);
const {inner: inner2, setB: setB2} = outer();
setB1(200);
setB2(300);

module.exports = {inner1, inner2};
