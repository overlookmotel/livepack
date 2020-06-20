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

// console.log('--------------------');
// console.log('--------------------');
// console.log('--------------------');

const res = require('./src/index.js');

const js = serialize(res, {compact: false, inline: true});
// console.log('--------------------');
console.log(js);
