/* eslint-disable strict */

'no use strict';

function f(x) {
	{ // eslint-disable-line no-lone-blocks
		function x() {} // eslint-disable-line no-inner-declarations, no-unused-vars, no-shadow
	}
	return x;
}
module.exports = f;

/*
TODO The above is serialized incorrectly as:

module.exports = function f(x$0) {
  {
    function x() {}
  }
  return x$0;
};

Or does it matter?
*/
