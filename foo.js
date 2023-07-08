/* eslint-disable no-empty-function, require-yield, prefer-arrow-callback */
/* eslint-disable no-unused-vars, no-unused-expressions */

'use strict';

function test(name, fn) {
	let threwSync = false,
		res;
	try {
		res = fn();
	} catch (err) {
		threwSync = true;
	}

	if (!threwSync && res instanceof Promise) res.catch(() => {});
	console.log(`${name}:`, threwSync); // eslint-disable-line no-console
}

test('normal function with error in params', function f(x = null.x) {});
test('normal function with error in body', function f() { null.x; });
test('generator function with error in params', function* f(x = null.x) {});
test('generator function with error in body', function* f() { null.x; });
test('async function with error in params', async function f(x = null.x) {});
test('async function with error in body', async function f() { null.x; });
test('async generator function with error in params', async function* f(x = null.x) {});
test('async generator function with error in body', async function* f() { null.x; });
