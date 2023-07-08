/* eslint-disable no-console */

'use strict';

const {readFileSync} = require('fs'),
	pathJoin = require('path').join,
	{transform} = require('@swc/core'); // eslint-disable-line import/no-unresolved

const filename = pathJoin(__dirname, 'src/index.js');
const codeIn = readFileSync(filename, 'utf8');

(async () => {
	const codeOut = (await transform(codeIn, {
		// script: true,
		sourceMaps: true,
		caller: {name: 'livepack/register'},
		configFile: false,
		swcrc: false,
		jsc: {
			parser: {
				syntax: 'ecmascript',
				jsx: true
			},
			transform: {
				react: {
					runtime: 'automatic'
				}
			},
			target: 'es2021',
			externalHelpers: true,
			keepClassNames: true
		},
		module: {
			type: 'commonjs'
		},
		minify: false,
		isModule: true
		/*
		env: {
			targets: 'Node 16'
		}
		*/
	})).code;
	console.log(codeOut);
})();
