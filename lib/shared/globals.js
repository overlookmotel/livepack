/* --------------------
 * livepack module
 * Shared globals
 * ------------------*/

'use strict';

// Exports

const url = new URL('http://x'),
	URLSymbols = Object.getOwnPropertySymbols(url),
	[URLContextSymbol, URLQuerySymbol] = URLSymbols;

module.exports = {
	URLSymbols,
	URLContextSymbol,
	URLQuerySymbol,
	URLContext: url[URLContextSymbol].constructor
};
