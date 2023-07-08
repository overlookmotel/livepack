/* eslint-disable strict, no-console, no-eval */

const x = 123; // eslint-disable-line no-unused-vars

function f() {
	/*
	var x = 'xyz'; // eslint-disable-line no-var, no-shadow
	console.log(typeof x);
	// eval('if (false) { var x = "abc"; }');
	// delete x;
	// eval('{ function x() {} }');
	eval('if (false) { function x() {} }');

	console.log(typeof x);
	*/

	/*
	global.z = 123;

	const o = {x: 1, y: 2};
	with (o) { // eslint-disable-line no-with
		delete x; // eslint-disable-line no-delete-var
		delete z; // eslint-disable-line no-delete-var, no-undef
	}
	console.log('o:', o);
	console.log('global.z:', global.z);
	*/

	global.x = 456;
	const eval = new Proxy(global.eval, {}); // eslint-disable-line no-shadow-restricted-names
	console.log(eval('x')); // Logs '456' i.e. behaves as indirect `eval`
	console.log(eval === global.eval); // Not equal
}

f();
