/* --------------------
 * livepack module
 * Init
 * ------------------*/

'use strict';

// Imports
const {isPrimitive, GeneratorFunction, AsyncGeneratorFunction} = require('./shared.js');

// Run

// Shim `Function.prototype.bind` to store details of bound functions
const boundFunctions = new WeakMap();

const bindOriginal = Function.prototype.bind;
function bind(...vars) {
	const boundFn = bindOriginal.call(this, ...vars); // eslint-disable-line no-invalid-this
	boundFunctions.set(boundFn, {fn: this, vars}); // eslint-disable-line no-invalid-this
	return boundFn;
}

Object.defineProperty(bind, 'length', {value: 1}); // To emulate native `.bind()` function

Function.prototype.bind = bind; // eslint-disable-line no-extend-native

// Catalog globals
const globals = new Map(); // Keyed by value

globals.set(global, {parent: null, key: 'global'});

for (const key of Object.getOwnPropertyNames(global)) {
	if (key === 'GLOBAL' || key === 'root') continue;
	catalogGlobal(global[key], key, null);
}

catalogGlobal(GeneratorFunction, null, null);
catalogGlobal(AsyncGeneratorFunction, null, null);

function catalogGlobal(val, key, parent) {
	if (isPrimitive(val)) return;
	if (globals.has(val)) return;

	globals.set(val, {parent, key});

	for (const childKey of Object.getOwnPropertyNames(val)) {
		const descriptor = Object.getOwnPropertyDescriptor(val, childKey);
		if (!('value' in descriptor)) continue; // Skip getters
		if (val === process && childKey === 'mainModule') continue;
		catalogGlobal(val[childKey], childKey, val);
	}
}

// Exports

module.exports = {boundFunctions, globals};
