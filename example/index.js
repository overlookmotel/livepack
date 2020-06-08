/* eslint-disable no-console */

'use strict';

// Modules
const pathJoin = require('path').join,
	{readFileSync} = require('fs'),
	{transformSync} = require('@babel/core'),
	generate = require('@babel/generator').default;

// Imports
const tracker = require('../tracker.js'),
	plugin = require('../babel.js');

// Run

console.log('--------------------');
console.log('--------------------');
console.log('--------------------');

const path = pathJoin(__dirname, 'src/index.js');
const inputJs = readFileSync(path, 'utf8');
const outputJs = transformSync(inputJs, {
	plugins: [plugin],
	filename: path,
	comments: false
}).code;

console.log(outputJs);
console.log('--------------------');
const {fns} = tracker;
console.log('fns:', fns);
// console.log(generate(fns[Object.keys(fns)[0]].node, {comments: false}).code);

// console.log(getFnJs(fns[Object.keys(fns)[0]]));

function getFnJs(fnObj) {
	const {node} = fnObj;
	node.body.body.shift();
	return generate(node, {comments: false}).code;
}
