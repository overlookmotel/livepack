/* eslint-disable node/exports-style */

'use strict';

// Necessary because Jest creates `module.exports` in another execution context,
// so prototype of `export` object is a *different* `Object.prototype`.
// This is just an artefact of the testing environment - does not affect real code.
Object.setPrototypeOf(exports, Object.prototype);

exports.x = () => {
	exports.y = 123;
};
