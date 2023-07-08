/* eslint-disable max-len, no-console */

'use strict';

/*
function shim() {
	const _String = String;
	Object.defineProperty(global, 'String', {
		get() {
			console.log('get!');
			return _String;
		},
		set(v) {
			console.log('set!');
			Object.defineProperty(global, 'String', {value: v});
		}
	});
}

shim();
const x = String;
String = 123;
const y = String;
console.log({x, y, g: global.String});
*/

/*
const descriptors = Object.getOwnPropertyDescriptors(global);
console.log(Object.keys(descriptors).filter(name => !descriptors[name].configurable));
console.log('Object.getOwnPropertyDescriptor(global, "Infinity"):', Object.getOwnPropertyDescriptor(global, 'Infinity'));
*/

/*
const _global = global;
Object.defineProperty(global, 'global', {
	get() {
		console.log('get!');
		return _global;
	},
	set(v) {
		console.log('set!');
		Object.defineProperty(global, 'global', {value: v});
	}
});

const x = global;
*/

const util = process.binding('util'); // eslint-disable-line node/no-deprecated-api

console.log('util:', util);

/*
const {getHiddenValue} = util;

const a = 123;
function f() {
	return a;
}

for (let i = 0; i < 8; i++) {
	console.log(i, getHiddenValue(f, i));
}
*/

console.log('pending:', util.getPromiseDetails(new Promise(() => {})));
console.log('resolved:', util.getPromiseDetails(Promise.resolve(123)));
const p = Promise.reject(new Error('oops'));
p.catch(() => {});
console.log('rejected:', util.getPromiseDetails(p));

console.log(util.previewEntries({a: 1, b: 2}));
