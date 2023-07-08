/* eslint-disable no-console */

'use strict';

const {readFileSync} = require('fs'),
	pathJoin = require('path').join,
	{instrumentCodeImpl} = require('../lib/instrument/instrument.js');

const filename = pathJoin(__dirname, 'src/index.js');
// const filename = pathJoin(__dirname, '../node_modules/is-it-type/dist/cjs/is-it-type.js');
// const filename = pathJoin(__dirname, '../test/functions.test.js');
const codeIn = readFileSync(filename, 'utf8');

// eeslint-disable-next-line no-unused-vars
const options = {
	isEsm: false,
	isCommonJs: true,
	isJsx: false,
	isStrict: false,
	sourceMaps: true,
	retainLines: false
};

const startTime = new Date();
const codeOut = instrumentCodeImpl(
	codeIn, filename, options.isEsm, options.isCommonJs, options.isJsx, options.isStrict,
	options.sourceMaps, undefined, options.retainLines
).code;
const endTime = new Date();
console.log(codeOut);
console.log(`-----\nInstrumented in ${endTime - startTime} ms`);
