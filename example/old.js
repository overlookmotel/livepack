/* eslint-disable no-console */

'use strict';

// Modules
const pathJoin = require('path').join,
	{readFileSync} = require('fs'),
	{transformSync} = require('@babel/core');
	// generate = require('@babel/generator').default;

// Imports
const plugin = require('../babel.js');

// Run

console.log('--------------------');
console.log('--------------------');
console.log('--------------------');

// Run through babel plugin

const path = pathJoin(__dirname, 'src/index.js');
const inputJs = readFileSync(path, 'utf8');
const outputJs = transformSync(inputJs, {
	plugins: [plugin],
	filename: path,
	comments: false
}).code;

console.log(outputJs);
console.log('--------------------');

// Run compiled code

const fn = function() {
	const exports = {};
	const module = {exports};
	function requireWrapped(id) {
		if (id === 'livepack/tracker') id = '../tracker.js';
		return require(id); // eslint-disable-line global-require, import/no-dynamic-require
	}
	// eslint-disable-next-line no-eval
	const fnInner = eval(`(function(module, exports, require) {\n${outputJs}\n})`);
	fnInner(module, exports, requireWrapped);
	return module.exports;
};

const res = fn();
console.log('res:', res);

/*
const {fns} = tracker;
console.log('fns:', fns);

console.log(getFnJs(fns[0]));

function getFnJs(fnObj) {
	const {node} = fnObj;
	node.body.body.shift();
	return generate(node, {comments: false}).code;
}
*/
