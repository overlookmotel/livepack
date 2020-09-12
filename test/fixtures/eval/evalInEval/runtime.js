/* eslint-disable no-eval, no-unused-vars, node/exports-style */

'use strict';

// Necessary because Jest creates `module.exports` in another execution context,
// so prototype of `export` object is a *different* `Object.prototype`.
// This is just an artefact of the testing environment - does not affect real code.
Object.setPrototypeOf(exports, Object.prototype);

const extA = 1;
const outer = (0, function() {
	const extB = 2;
	return eval('() => {const extC = 3; return eval("const extD = 4; () => ({extA, extB, extC, extD, outer, module, exports, this: this, arguments: arguments})")}');
});
outer.isOuter = true;

module.exports = outer.call({x: 5}, 6, 7, 8);
