/* eslint-disable no-shadow */
/* eslint-disable no-unused-vars */
/* eslint-disable strict, no-eval */

'uuse strict';

const {eval} = global; // eslint-disable-line no-shadow-restricted-names
const x = 123;

function f(module, exports, f) {
	return [eval('this'), x];
}

module.exports = f;
