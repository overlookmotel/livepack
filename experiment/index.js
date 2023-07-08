/* eslint-disable no-console */

'use strict';

const options = {
	cache: false,
	esm: false,
	jsx: false,
	minify: false,
	mangle: undefined,
	inline: true,
	comments: true,
	format: 'cjs',
	strictEnv: undefined
};

const {cache, esm, jsx, ...serializeOpts} = options;

require('../register.js')({cache, esm, jsx});

const {serialize} = require('../index.js');

let fn = require('./src/index.js');

if (esm) fn = fn.default;

console.log(serialize(fn, serializeOpts));
