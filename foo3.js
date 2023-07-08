/* eslint-disable no-inner-declarations */
/* eslint-disable no-console */
/* eslint-disable strict */

// Demonstration that arguments object remains connected to function args even outside the function

function outer(x) {
	return {
		args: arguments, // eslint-disable-line prefer-rest-params
		getX() { return x; },
		setX(v) { x = v; }
	};
}

{
	const {args, getX, setX} = outer(1);
	function debug(name) {
		console.log(`${name}:`, {arg: args[0], x: getX()});
	}

	debug(1);
	setX(2);
	debug(2);
	args[0] = 3;
	debug(3);
	// Deleting argument breaks the linkage
	delete args[0];
	args[0] = 4;
	debug(4);
	setX(5);
	debug(5);
}

console.log('------');

{
	const {args, getX, setX} = outer(1);
	function debug(name) {
		console.log(`${name}:`, {arg: args[0], x: getX()});
	}

	debug(1);
	// Defining a getter for argument breaks the linkage
	Object.defineProperty(args, 0, {get() { return 2; }});
	debug(2);
	Object.defineProperty(args, 0, {value: 3});
	debug(3);
	setX(4);
	debug(4);
}
