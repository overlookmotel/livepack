/* eslint-disable no-console */

'use strict';

// Modules
const pathJoin = require('path').join,
	{readFileSync} = require('fs'),
	{transformSync} = require('@babel/core'),
	pluginModulesToCommonJs = require('@babel/plugin-transform-modules-commonjs').default,
	pluginImportMeta = require('babel-plugin-transform-import-meta').default,
	pluginTransformJsx = require('@babel/plugin-transform-react-jsx').default,
	babelPlugin = require('../babel.js'); // require('livepack/babel')

// Run

console.log('--------------------');
console.log('--------------------');
console.log('--------------------');

const esm = true,
	jsx = false;

const path = pathJoin(__dirname, 'src/index.js');
const inputJs = readFileSync(path, 'utf8');
const outputJs = transformSync(inputJs, {
	plugins: [
		// Transform JSX if `jsx` option set
		...(jsx ? [pluginTransformJsx] : []),
		// Convert ESM to CJS if `esm` option set
		...(esm ? [pluginModulesToCommonJs, pluginImportMeta] : []),
		babelPlugin
	],
	filename: path,
	generatorOpts: {retainLines: true},
	sourceType: esm ? 'module' : 'script'
}).code;

console.log(outputJs);
