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
console.log(serialize(res.outer));
console.log(serialize(res.inner1));
console.log(serialize(res.inner2));
