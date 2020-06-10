/* --------------------
 * livepack module
 * Serialize
 * ------------------*/

'use strict';

// Modules
const {isFunction} = require('is-it-type');

// Imports
const functionMethods = require('./function.js');

// Exports

class Serializer {
	constructor() {
		this.values = new Map(); // Keyed by value
		this.scopes = new Map(); // Keyed by scope ID
	}

	serialize(val) {
		return this.serializeValue(val);
	}

	serializeValue(val) {
		if (isFunction(val)) return this.serializeFunction(val);
		throw new Error('Cannot serialize');
	}
}

Object.assign(Serializer.prototype, functionMethods);

module.exports = function serialize(val) {
	const serializer = new Serializer();
	return serializer.serializeValue(val);
};
