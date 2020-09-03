#!/usr/bin/env node

'use strict';

// Modules
const {resolve: pathResolve, join: pathJoin} = require('path'),
	yargs = require('yargs'),
	{writeFileSync, mkdirsSync} = require('fs-extra');

// Import
const register = require('./register.js'),
	serialize = require('./serialize/index.js');

// CLI

const {argv} = yargs
	.usage('Usage: $0 <file> -o [output dir] [options]')
	.demandCommand(
		1, 1,
		'Must specify input file.',
		'Specify only one input file.'
	)
	.alias('h', 'help')
	.alias('v', 'version')
	.option('o', {
		alias: 'output',
		description: 'Output directory',
		demandOption: true,
		type: 'string'
	})
	.option('f', {
		alias: 'format',
		description: 'Output format',
		type: 'string',
		choices: ['esm', 'cjs'],
		default: 'esm'
	})
	.option('m', {
		alias: 'minify',
		description: 'Minify output',
		type: 'boolean',
		default: false
	})
	.option('inline', {
		type: 'boolean',
		description: 'Inline code where possible',
		default: true
	})
	.option('mangle', {
		type: 'boolean',
		description: 'Mangle var names'
	})
	.option('comments', {
		type: 'boolean',
		description: 'Keep comments in output'
	})
	.option('s', {
		alias: 'source-maps',
		description: 'Create source maps',
		type: 'boolean',
		default: false
	})
	.option('exec', {
		description: 'Output executable script',
		type: 'boolean',
		default: true
	})
	.option('esm', {
		description: 'ESM support',
		type: 'boolean',
		default: false
	})
	.option('jsx', {
		description: 'JSX support',
		type: 'boolean',
		default: false
	})
	.option('babel-config', {
		description: 'Use babel config file',
		type: 'string',
		choices: ['pre', 'post'],
		coerce(val) {
			if (val === 'post') throw new Error("'--babel-config post' is not supported yet");
			return val;
		}
	})
	.option('babelrc', {
		description: 'Use .babelrc',
		type: 'string',
		choices: ['pre', 'post'],
		coerce(val) {
			if (val === 'post') throw new Error("'--babelrc post' is not supported yet");
			return val;
		}
	})
	.option('babel-config-file', {
		description: 'Babel config file path',
		type: 'string',
		implies: 'babel-config',
		normalize: true
	})
	.option('babel-cache', {
		description: 'Enable Babel cache',
		type: 'boolean',
		default: true
	});

// Register Babel transform to track scopes
const srcPath = pathResolve(argv._[0]),
	outPath = pathResolve(argv.output);

register({
	esm: argv.esm,
	jsx: argv.jsx,
	configFile: argv.babelConfigFile || argv.babelConfig === 'pre',
	babelrc: argv.babelrc === 'pre' ? true : undefined,
	cache: argv.babelCache
});

// Load source
let input = require(srcPath); // eslint-disable-line import/no-dynamic-require
if (input.__esModule) input = input.default;

// Serialize
const files = serialize(input, {
	format: argv.format,
	exec: argv.exec,
	minify: argv.minify,
	inline: argv.inline,
	mangle: argv.mangle,
	comments: argv.comments,
	files: true,
	sourceMaps: argv.sourceMaps,
	outputDir: argv.sourceMaps ? outPath : undefined
});

// Output files
mkdirsSync(outPath);

for (const {filename, content} of files) {
	writeFileSync(pathJoin(outPath, filename), content);
}
