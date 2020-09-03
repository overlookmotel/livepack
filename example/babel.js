/* eslint-disable no-console */

'use strict';

// Modules
const pathJoin = require('path').join,
	{readFileSync} = require('fs'),
	{transformSync} = require('@babel/core'),
	pluginModulesToCommonJs = require('@babel/plugin-transform-modules-commonjs').default,
	pluginTransformJsx = require('@babel/plugin-transform-react-jsx').default,
	babelPlugin = require('../babel.js'); // require('livepack/babel')

// Run

const useConfig = false,
	esm = false,
	jsx = false;

console.log('--------------------');
console.log('--------------------');
console.log('--------------------');

const path = pathJoin(__dirname, 'src/index.js');
const inputJs = readFileSync(path, 'utf8');
const outputJs = transformSync(inputJs, {
	ignore: [],
	configFile: useConfig,
	babelrc: useConfig,
	sourceType: esm ? 'module' : 'script',
	plugins: [
		// Transform JSX if `jsx` option set
		...(jsx ? [pluginTransformJsx] : []),
		// Convert ESM to CJS if `esm` option set
		...(esm ? [pluginModulesToCommonJs] : []),
		babelPlugin
	],
	filename: path,
	generatorOpts: {retainLines: true, compact: false}
}).code;

console.log(outputJs);
