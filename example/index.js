/* eslint-disable no-console */

'use strict';

// Modules
const pathJoin = require('path').join;

// Imports
const serialize = require('../index.js');

// Register babel plugin to transform requires
require('../register.js')({
	trackerPath: pathJoin(__dirname, '../tracker.js')
});

// Run

console.log('--------------------');
console.log('--------------------');
console.log('--------------------');

const res = require('./src/index.js');

console.log('res:', res);

for (const name of ['outer', 'inner1', 'inner2', 'set1', 'set2']) {
	const js = serialize(res[name]); // eslint-disable-line no-unused-vars
	// console.log(js);
}
