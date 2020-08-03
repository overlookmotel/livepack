'use strict';

const {last} = require('lodash');

let a = 1;
function outer() {
	let b = a;

	function inner() {
		return `a = ${a}, b = ${b}`;
	}
	function setA(newA) {
		a = newA;
	}
	function setB(newB) {
		b = newB;
	}

	return {inner, setA, setB};
}

const {inner: inner1, setA, setB: setB1} = outer();
setA(100);
const {inner: inner2, setB: setB2} = outer();
setB1(200);
setB2(300);

module.exports = {inner1, inner2, last};
