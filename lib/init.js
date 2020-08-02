/* --------------------
 * livepack module
 * Init
 * ------------------*/

'use strict';

// Imports
const {
	isPrimitive, GeneratorPrototype, AsyncFunctionPrototype, AsyncGeneratorPrototype
} = require('./shared.js');

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

// Shim `Symbol` to record Symbols with empty string description in Node v10
let emptyStringSymbols;
if (!Symbol('x').description) {
	emptyStringSymbols = new Set();

	const SymbolOriginal = Symbol;
	Symbol = function Symbol(description) { // eslint-disable-line no-global-assign
		const symbol = SymbolOriginal(description);
		if (description === '') emptyStringSymbols.add(symbol);
		return symbol;
	};

	Object.defineProperties(Symbol, Object.getOwnPropertyDescriptors(SymbolOriginal));
	Symbol.prototype.constructor = Symbol; // eslint-disable-line no-extend-native
}

// Catalog globals
const globals = new Map(); // Keyed by value

globals.set(global, {parent: null, key: 'global'});

// Done first to prevent being located at a deeper position encountered first
// e.g. `Number.POSITIVE_INFINITY` rather than `Infinity`
catalogGlobal(NaN, 'NaN', null);
catalogGlobal(Infinity, 'Infinity', null);
catalogGlobal(-Infinity, null, null);

for (const key of Object.getOwnPropertyNames(global)) {
	if (key === 'GLOBAL' || key === 'root') continue;
	catalogGlobal(global[key], key, null);
}

catalogGlobal(GeneratorPrototype, null, null);
catalogGlobal(AsyncFunctionPrototype, null, null);
catalogGlobal(AsyncGeneratorPrototype, null, null);

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

module.exports = {boundFunctions, globals, emptyStringSymbols};
