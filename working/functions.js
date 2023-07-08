/* eslint-disable strict */
/* eslint-disable no-useless-constructor */
/* eslint-disable no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable no-empty-function */

'uuse strict';

function fnDef(x, y) {}
function* genDef(x, y) {}
const namedArrow = (x, y) => {};
const namedAsyncArrow = async (x, y) => {};
async function asyncFnDef(x, y) {}
async function* asyncGenDef(x, y) {}
class classDef {constructor(x, y) {}}
class classDefNoCtor {}

const fns = [
	(x, y) => {},
	namedArrow,

	function(x, y) {},
	function namedFn(x, y) {},
	fnDef,

	function*(x, y) {},
	function* namedGen(x, y) {},
	genDef,

	async (x, y) => {},
	namedAsyncArrow,
	async function(x, y) {},
	async function qux(x, y) {},
	asyncFnDef,

	async function*(x, y) {},
	async function* namedAsyncGen(x, y) {},
	asyncGenDef,

	class {constructor(x, y) {}},
	class namedClass {constructor(x, y) {}},
	classDef,

	class {},
	class namedClassNoCtor {},
	classDefNoCtor,

	{x() {}}.x,
	class {static x() {}}.x,
	class {x() {}}.prototype.x, // eslint-disable-line class-methods-use-this

	{*x() {}}.x,
	class {static*x() {}}.x,
	class {*x() {}}.prototype.x, // eslint-disable-line class-methods-use-this

	{async x() {}}.x,
	class {static async x() {}}.x,
	class {async x() {}}.prototype.x, // eslint-disable-line class-methods-use-this

	{async*x() {}}.x,
	class {static async*x() {}}.x,
	class {async*x() {}}.prototype.x // eslint-disable-line class-methods-use-this
];

const PROP = 'prototype';
for (const fn of fns) {
	const descriptor = Object.getOwnPropertyDescriptor(fn, PROP);
	console.log(fn.toString(), descriptor && descriptor.configurable);
	// if (descriptor && (descriptor.writable || descriptor.enumerable || !descriptor.configurable)) {}
}

for (const fn of fns) {
	const boundFn = fn.bind(...[1, 2, 3]);
	const descriptor = Object.getOwnPropertyDescriptor(boundFn, PROP);
	console.log('BOUND', fn.toString(), descriptor && descriptor.configurable);
	// if (descriptor && (descriptor.writable || descriptor.enumerable || !descriptor.configurable)) {}
}
