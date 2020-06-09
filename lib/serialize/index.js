/* --------------------
 * livepack module
 * Serialize
 * ------------------*/

'use strict';

// Modules
const {isFunction} = require('is-it-type');

// Imports
const serializeFunction = require('./function.js');

// Exports

module.exports = function serialize(val) {
	if (isFunction(val)) return serializeFunction(val);
	return 'NOT A FUNCTION';
};
