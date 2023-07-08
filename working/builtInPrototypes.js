/* eslint-disable no-console */

'use strict';

const names = Object.getOwnPropertyNames(global).filter(
	name => global[name] !== undefined
		&& Object.prototype.hasOwnProperty.call(global[name], 'prototype')
);

names.sort();

for (const name of names) {
	const Klass = global[name];
	const proto = Klass.prototype;
	const descriptor = Object.getOwnPropertyDescriptor(proto, Symbol.toStringTag);
	if (descriptor === undefined) continue;
	console.log(`${name}:`, descriptor.value);
}
