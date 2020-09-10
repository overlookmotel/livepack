/* --------------------
 * livepack module
 * Shared globals
 * ------------------*/

'use strict';

// Imports
const {getCallSite} = require('../serialize/external.js');

// Exports

const url = new URL('http://x'),
	URLSymbols = Object.getOwnPropertySymbols(url),
	[URLContextSymbol, URLQuerySymbol] = URLSymbols;

module.exports = {
	/* eslint-disable no-empty-function, prefer-arrow-callback */
	GeneratorPrototype: Object.getPrototypeOf(function*() {}),
	AsyncFunctionPrototype: Object.getPrototypeOf(async function() {}),
	AsyncGeneratorPrototype: Object.getPrototypeOf(async function*() {}),
	TypedArrayPrototype: Object.getPrototypeOf(Uint8Array.prototype),
	/* eslint-enable no-empty-function, prefer-arrow-callback */
	URLSymbols,
	URLContextSymbol,
	URLQuerySymbol,
	URLContext: url[URLContextSymbol].constructor,
	CallSite: getCallSite()
};
