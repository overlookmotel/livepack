/* eslint-disable no-console */

'use strict';

const bindings = new Map();

const {bind} = Function.prototype;
Function.prototype.bind = function(...args) { // eslint-disable-line no-extend-native
	const boundFn = bind.apply(this, args);
	bindings.set(boundFn, {fn: this, args});
	return boundFn;
};

const o = {x: 1};

function x() {
	return this; // eslint-disable-line no-invalid-this
}

const y = x.bind(o);

console.log('res:', y());
console.log('binding:', bindings.get(y));
