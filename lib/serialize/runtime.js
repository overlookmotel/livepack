/* --------------------
 * livepack module
 * Serialize runtime functions
 * ------------------*/

'use strict';

// Exports

module.exports = function serializeRuntime(name) {
	// eslint-disable-next-line global-require, import/no-dynamic-require
	const fn = require(`../runtime/${name}.js`);
	return this.serializeValue(fn, name, `<${name}>`);
};
