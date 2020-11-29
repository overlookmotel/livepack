/* eslint-disable no-console */

'use strict';

process.on('unhandledRejection', (err) => { throw err; });

// Imports
const serializeFunction = require('./serialize.js');

// Run

const x = {a: 123};
function outer(y) {
	return function inner(z) { console.log('first line'); // eslint-disable-line brace-style
		console.log('vars:', {x, y, z});
	};
}

const f1 = outer({b: 456});
const f2 = outer({b: 789});

const f3 = () => {
	console.log('x:', x);
};

const f1Info = serializeFunction(f1);
// const f2Info = serializeFunction(f2);
// const f3Info = serializeFunction(f3);

console.log('got info');
console.log('x:', x);

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
