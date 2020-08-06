/* eslint-disable no-console, import/order */

'use strict';

// Error.stackTraceLimit = 20;

// Register babel plugin
require('../register.js')(); // require('livepack/register')();

// Modules
const serialize = require('../index.js'); // require('livepack')

// Load source
const res = require('./src/index.js');

// Serialize to JS
const js = serialize(res, {format: 'cjs', minify: false, inline: true, comments: true, mangle: false});
console.log(js);

// Save output to file
const pathJoin = require('path').join,
	{existsSync, mkdirSync, writeFileSync} = require('fs');

const buildDirPath = pathJoin(__dirname, 'build');
if (!existsSync(buildDirPath)) mkdirSync(buildDirPath);
const buildPath = pathJoin(buildDirPath, 'index.js');
writeFileSync(buildPath, js);
