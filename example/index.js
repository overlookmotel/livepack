/* eslint-disable no-console */

'use strict';

// Register babel plugin to transform requires
require('../register.js');

// Imports
const serialize = require('../index.js');
const tracker = require('../tracker.js');

// Run

console.log('--------------------');
console.log('--------------------');
console.log('--------------------');

const res = require('./src/index.js');

serialize(res.inner1);
serialize(res.inner2);

console.log('res:', res);
// console.log('fns:', tracker.fns);
console.log('invocations:', tracker.invocations);
