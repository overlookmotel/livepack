/* eslint-disable no-console */

'use strict';

// Modules
const babelRegister = require('@babel/register');

// Imports
const plugin = require('../babel.js');
const tracker = require('../tracker.js');

// Run

console.log('--------------------');
console.log('--------------------');
console.log('--------------------');

babelRegister({
	ignore: [],
	root: '/',
	plugins: [plugin],
	cache: false
});

const res = require('./src/index.js');

console.log('res:', res);
// console.log('fns:', tracker.fns);
console.log('invocations:', tracker.invocations);
