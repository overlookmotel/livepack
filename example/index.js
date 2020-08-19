/* eslint-disable no-console */

'use strict';

// Error.stackTraceLimit = 20;

// Register babel plugin
require('../register.js'); // require('livepack/register');

// Modules
const pathJoin = require('path').join,
	{existsSync, mkdirSync, writeFileSync} = require('fs'),
	serialize = require('../index.js'); // require('livepack')

// Load source
const res = require('./src/index.js');

// Serialize to JS
const outputPath = pathJoin(__dirname, 'build');
const options = {
	format: 'cjs',
	exec: false,
	minify: false,
	inline: true,
	comments: false,
	mangle: false,
	files: true,
	sourceMaps: true,
	outputDir: outputPath
};

const output = serialize(res, options);
const files = options.files ? output : [{filename: 'index.js', content: output}];

// Print generated code
console.log('----------');
console.log(files[0].content);

// Save output to file(s)
if (!existsSync(outputPath)) mkdirSync(outputPath);
for (const {filename, content} of files) {
	writeFileSync(pathJoin(outputPath, filename), content);
}
