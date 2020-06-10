/* eslint-disable no-console */

'use strict';

// Register babel plugin to transform requires
const pathJoin = require('path').join;
require('../register.js')({
	trackerPath: pathJoin(__dirname, '../tracker.js')
});

// Modules
const serialize = require('../index.js');

// Run

console.log('--------------------');
console.log('--------------------');
console.log('--------------------');

const res = require('./src/index.js');

for (const name of ['outer', 'inner1', 'inner2', 'set1', 'set2']) {
	console.log(name);
	const js = serialize(res[name]);
	console.log(js);
	console.log('--------------------');
}
