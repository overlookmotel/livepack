/* eslint-disable no-console */
/* eeslint-disable no-eval */

'use strict';

const obj = {
	foo() {
		return () => {
			super.bar = () => 5;
			return super.bar();
		};
		/*
		return () => eval(`
			// Object.setPrototypeOf( obj, { foo: () => 2 } );
      // obj.__proto__ = { foo: () => 3 };
			super.bar = () => 5;
			super.bar()
    `);
		*/
	}
};

const superObj = {
	foo: () => 1
};
Object.setPrototypeOf(obj, superObj);

/*
Object.setPrototypeOf(superObj, {
	foo: () => 1
});
*/

const fn = obj.foo();
module.exports = fn;

console.log(fn());
// console.log(superObj.foo.toString());
