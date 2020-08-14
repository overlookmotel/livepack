/* eslint-disable no-console */

'use strict';

// Modules
const pathJoin = require('path').join,
	{readFileSync} = require('fs'),
	{transformSync} = require('@babel/core'),
	babelPlugin = require('../babel.js'); // require('livepack/babel')

// Run

console.log('--------------------');
console.log('--------------------');
console.log('--------------------');

const path = pathJoin(__dirname, 'src/index.js');
const inputJs = readFileSync(path, 'utf8');
const outputJs = transformSync(inputJs, {
	plugins: [babelPlugin],
	filename: path,
	generatorOpts: {retainLines: true},
	sourceType: 'script'
}).code;

console.log(outputJs);
