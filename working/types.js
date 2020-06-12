/* eslint-disable no-console */

'use strict';

// Modules
const {isObject, isFunction} = require('is-it-type'),
	t = require('@babel/types');

// Run

// Find all properties which aren't a `foo` + `isFoo` + `assertFoo` set
const keys = Object.keys(t);

let lowerKeys = [],
	upperKeys = [],
	isKeys = [],
	assertKeys = [],
	staticKeys = [];
const convertedLowerKeys = [],
	convertedUpperKeys = [];
for (const key of keys) {
	assignToVars(key, t);
}

function assignToVars(key, obj, prefix) {
	const keyWithPrefix = addPrefix(key, prefix);

	const val = obj[key];
	if (isObject(val)) {
		const subVal = t[key];
		if (!key.match(/^([A-Z]+_)*[A-Z]+$/)) {
			for (const subKey of Object.keys(subVal)) {
				assignToVars(subKey, subVal, key);
			}
			return;
		}
	}

	if (!isFunction(val)) {
		staticKeys.push(keyWithPrefix);
		return;
	}

	const match = key.match(/^(is|assert)[A-Z].*/);
	if (match) {
		(match[1] === 'is' ? isKeys : assertKeys).push(addPrefix(key, prefix));
	} else if (key.match(/^[A-Z]/)) {
		upperKeys.push(keyWithPrefix);
		convertedUpperKeys.push(convertUpperToLower(key));
	} else {
		lowerKeys.push(keyWithPrefix);
		convertedLowerKeys.push(convertLowerToUpper(key));
	}
}

function addPrefix(key, prefix) {
	return prefix ? `${prefix}.${key}` : key;
}

function convertLowerToUpper(key) {
	const tsMatch = key.match(/^ts([A-Z].*)$/);
	if (tsMatch) return `TS${tsMatch[1]}`;
	const jsxMatch = key.match(/^jsx([A-Z].*)$/);
	if (jsxMatch) return `JSX${jsxMatch[1]}`;
	return `${key[0].toUpperCase()}${key.slice(1)}`;
}

function convertUpperToLower(key) {
	const tsMatch = key.match(/^TS([A-Z].*)$/);
	if (tsMatch) return `ts${tsMatch[1]}`;
	const jsxMatch = key.match(/^JSX([A-Z].*)$/);
	if (jsxMatch) return `jsx${jsxMatch[1]}`;
	return `${key[0].toLowerCase()}${key.slice(1)}`;
}

isKeys = isKeys.filter(key => !upperKeys.includes(key.slice(2))).sort();
assertKeys = assertKeys.filter(key => !upperKeys.includes(key.slice(6))).sort();
lowerKeys = lowerKeys.filter(key => !convertedUpperKeys.includes(key))
	.filter((key) => {
		const match = key.match(/^(tS|jSX)([A-Z].*)$/);
		if (!match) return true;
		const alt = t[`${match[1].toLowerCase()}${match[2]}`];
		if (!alt) return true;
		return t[key] !== alt;
	});
staticKeys = staticKeys.filter((key) => {
	const val = t[key];
	if (!isObject(val)) return true;
	if (key.match(/^([A-Z]+_)*[A-Z]+$/)) return true;
	for (const subKey of Object.keys(val)) {
		assignToVars(subKey, val[subKey], key);
	}
	return false;
});

upperKeys = upperKeys.filter(key => !convertedLowerKeys.includes(key));

console.log('upperKeys:', upperKeys);
console.log('lowerKeys:', lowerKeys);
// console.log('staticKeys:', staticKeys);
console.log('isKeys:', isKeys);
console.log('assertKeys:', assertKeys);

// console.log('t.isMethod:', t.isMethod.toString());
// console.log('t.isBlockScoped:', t.isBlockScoped.toString());
