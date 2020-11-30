/* eslint-disable no-unused-vars */
/* eslint-disable no-console */

'use strict';

process.on('unhandledRejection', (err) => { throw err; });

// Imports
const serializeFunction = require('./serialize.js');

// Run

const x = 123; // {a: 123};
function outer(y) {
	return function inner(z) { console.log('first line'); // eslint-disable-line brace-style
		console.log('vars:', {x, y, z});
	};
}

const f1 = outer({b: 456});
const f2 = outer({b: 789});

const q = {qq: 123};
const r = () => {};

const f3 = () => { console.log('f3 vars:', {x, q, r}); };

// const f1Info = serializeFunction(f1);
// const f2Info = serializeFunction(f2);
const f3Info = serializeFunction(f3);

console.log('got info');
console.log({x, q, r});

console.log('f3Info:', f3Info);

/*
console.dir({
	f1Info,
	f2Info,
	f3Info
	f1XEqual: f1Info.scopes[0].values.x === x,
	f2XEqual: f2Info.scopes[0].values.x === x,
	f3XEqual: f3Info.scopes[0].values.x === x
}, {depth: 10});
*/
