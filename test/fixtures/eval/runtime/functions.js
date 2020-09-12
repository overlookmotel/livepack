/* eslint-disable no-eval, no-unused-vars, node/exports-style */

'use strict';

// Necessary because Jest creates `module.exports` in another execution context,
// so prototype of `export` object is a *different* `Object.prototype`.
// This is just an artefact of the testing environment - does not affect real code.
Object.setPrototypeOf(exports, Object.prototype);

const extA = 1;
const outer = (0, function() {
	const extB = 2;
	return () => {
		const extC = 3;
		return eval('() => ({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})');
	};
});
outer.isOuter = true;

const extD = 4;

module.exports = outer.call({x: 7}, 8, 9, 10);

if (true) { // eslint-disable-line no-constant-condition
	var extE = 5; // eslint-disable-line no-var, vars-on-top
	const extF = 6;
}
