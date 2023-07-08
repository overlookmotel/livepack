/* eslint-disable no-console */

'use strict';

const TypedArrayProto = Object.getPrototypeOf(Uint8Array).prototype;

const names = Object.getOwnPropertyNames(global).filter(
	name => name.match(/^[A-Z]/)
		&& Object.prototype.hasOwnProperty.call(global[name], 'prototype')
);

const roots = [],
	dependents = [];

for (const name of names) {
	const proto = global[name].prototype;
	const protoProto = Object.getPrototypeOf(proto);
	const parentName = protoProto === TypedArrayProto
		? 'TypedArray'
		: names.find(possParentName => global[possParentName].prototype === protoProto);
	if (!parentName || parentName === 'Object') {
		roots.push(name);
	} else {
		dependents.push({name, parentName});
	}
}

roots.sort();
dependents.sort(({name: name1}, {name: name2}) => (name1 < name2 ? -1 : 1));

roots.forEach(name => console.log(name));
dependents.forEach(({name, parentName}) => console.log(`${name} => ${parentName}`));
