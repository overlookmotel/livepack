/* eslint-disable no-console */

'use strict';

const options = {
	cache: false,
	esm: false,
	jsx: false,
	minify: false,
	mangle: true,
	comments: true,
	format: 'cjs',
	sourceMaps: false,
	files: false,
	strictEnv: undefined,
	outputDir: `${__dirname}/build`
};

const {cache, esm, jsx, ...serializeOpts} = options;

require('../register.js')({cache, esm, jsx});

const {serialize} = require('../index.js');

let value = require('./src/index.js');

if (esm && value.__esModule) value = value.default;

(async () => {
	if (value instanceof Promise) value = await value;
	const res = serialize(value, serializeOpts);
	console.log(res);
})();

/*
console.log('----------------------------------------');
console.log(res[0].content);
console.log('----------------------------------------');
console.log(JSON.parse(res[1].content));
*/
