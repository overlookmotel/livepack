/* eeslint-disable strict, no-eval, no-console */

'use strict';

module.exports = {
	x() {
		return super.toString();
	}
};

/*
Should transpile to:

const scopeAnon = (super$0 => [_super$0 => super$0 = _super$0, {
    x() {
      return Reflect.get(Object.getPrototypeOf(super$0), "toString", this).call(this);
    }
  }.x])(),
  index = {
    x: scopeAnon[1]
  };
scopeAnon[0](index);
module.exports = index;
*/
