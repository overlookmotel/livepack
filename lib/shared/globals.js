/* --------------------
 * livepack module
 * Shared globals
 * ------------------*/

'use strict';

// Exports

// URL symbols were removed in NodeJS v20.0.0
const url = new URL('http://x');
let URLSymbols = Object.getOwnPropertySymbols(url.searchParams);

let URLQuerySymbol, URLContextSymbol, URLContext;
if (URLSymbols.length === 2) {
	[URLQuerySymbol, URLContextSymbol] = URLSymbols;
	URLContext = url[URLContextSymbol].constructor;
} else {
	URLSymbols = undefined;
}

module.exports = {
	URLSymbols,
	URLContextSymbol,
	URLQuerySymbol,
	URLContext
};
