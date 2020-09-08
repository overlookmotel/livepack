#!/usr/bin/env node

'use strict';

// Modules
const {resolve: pathResolve, join: pathJoin} = require('path'),
	yargs = require('yargs'),
	{readFileSync, writeFile, mkdirs} = require('fs-extra'),
	findUp = require('find-up'),
	stripJsonComments = require('strip-json-comments'),
	assert = require('simple-invariant');

// Import
const register = require('./register.js'),
	serialize = require('./serialize/index.js');

// CLI

// Load config file
const configPath = findUp.sync(['.livepackrc', 'livepack.config.json', 'livepack.config.js']);
let config;
if (configPath) {
	if (/\.js$/.test(configPath)) {
		config = require(configPath); // eslint-disable-line global-require, import/no-dynamic-require
	} else {
		config = JSON.parse(stripJsonComments(readFileSync(configPath, 'utf8')));
	}
} else {
	config = {};
}

// Parse args
const {argv} = yargs
	.config(config)
	.command(
		'$0',
		'livepack <input path> -o [output dir path] [options]',
		() => {},
		(_argv) => {
			const {input} = _argv;
			if (input === undefined) {
				const inputs = _argv._;
				assert(inputs.length > 0, 'Must specify input file');
				assert(inputs.length === 1, 'Specify only one input file');
				_argv.input = inputs[0];
			}
		}
	)
	.alias('help', 'h')
	.alias('version', 'v')
	.option('input', {
		// Only used in config file
		description: 'Input file path',
		type: 'string',
		hidden: true
	})
	.option('output', {
		alias: 'o',
		description: 'Output directory path',
		demandOption: true,
		type: 'string'
	})
	.option('format', {
		alias: 'f',
		description: 'Output format',
		type: 'string',
		choices: ['esm', 'cjs'],
		default: 'esm'
	})
	.option('minify', {
		alias: 'm',
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
	.option('source-maps', {
		alias: 's',
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
		description: 'ES modules source',
		type: 'boolean',
		default: false
	})
	.option('jsx', {
		description: 'JSX source',
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
const srcPath = pathResolve(argv.input),
	outPath = pathResolve(argv.output);

register({
	esm: argv.esm,
	jsx: argv.jsx,
	configFile: argv.babelConfigFile || argv.babelConfig === 'pre',
	babelrc: argv.babelrc === 'pre' ? true : undefined,
	cache: argv.babelCache
});

// Serialize
(async () => {
	// Load source
	let input = require(srcPath); // eslint-disable-line global-require, import/no-dynamic-require
	if (input.__esModule) input = input.default;

	// Await Promise value
	input = await input;

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
	await mkdirs(outPath);

	for (const {filename, content} of files) {
		await writeFile(pathJoin(outPath, filename), content);
	}
})();
