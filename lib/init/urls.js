/* --------------------
 * livepack module
 * Get URL symbols and constructors
 * ------------------*/

'use strict';

// Exports

const url = new URL('http://x'),
	URLSymbols = Object.getOwnPropertySymbols(url),
	[URLContextSymbol, URLQuerySymbol] = URLSymbols;

module.exports = function getUrlVars() {
	return {
		URLSymbols,
		URLContextSymbol,
		URLQuerySymbol,
		URLContext: url[URLContextSymbol].constructor
	};
};
