/* eslint-disable no-console */

'use strict';

console.log('WeakMap');
logProtoMethods(WeakMap);

console.log('WeakSet');
logProtoMethods(WeakSet);

function logProtoMethods(ctor) {
	const proto = ctor.prototype;
	const keys = Object.getOwnPropertyNames(proto)
		.filter(key => key !== 'constructor')
		.concat(Object.getOwnPropertySymbols(proto));
	console.log('keys:', keys);
	for (const key of keys) {
		console.log('----------');
		console.log(`${typeof key === 'symbol' ? `Symbol(${key.description})` : key}:`);
		const method = proto[key];
		console.log(typeof method === 'function' ? method.toString() : JSON.stringify(method));
		console.log(Object.getOwnPropertyDescriptor(proto, key));
		if (typeof method === 'function') console.log(Object.getOwnPropertyDescriptors(method));
	}
}
