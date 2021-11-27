/* --------------------
 * livepack module
 * CLI
 * ------------------*/

'use strict';

// Modules
const {resolve: pathResolve, join: pathJoin, parse: pathParse} = require('path'),
	{readFileSync} = require('fs'),
	{spawn} = require('child_process'),
	yargs = require('yargs'),
	findUp = require('find-up'),
	stripJsonComments = require('strip-json-comments'),
	{isObject, isArray, isString, isBoolean} = require('is-it-type'),
	assert = require('simple-invariant');

// Imports
const {DEFAULT_OUTPUT_FILENAME} = require('../shared/constants.js');

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
		'livepack <input path(s)..> -o <output dir path> [options]',
		() => {},
		(_argv) => {
			const {input} = _argv;
			if (input === undefined) {
				const inputs = _argv._;
				assert(inputs.length > 0, 'Must specify input file');
				_argv.input = inputs;
			}
		}
	)
	.alias('help', 'h')
	.alias('version', 'v')
	.option('input', {
		// Only used in config file
		alias: 'inputs',
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
	.option('ext', {
		description: 'JS file extension',
		type: 'string',
		default: 'js'
	})
	.option('map-ext', {
		description: 'Source map file extension',
		type: 'string',
		default: 'map'
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
	.option('entry-chunk-name', {
		type: 'string',
		description: 'Template for entry point chunk names'
	})
	.option('split-chunk-name', {
		type: 'string',
		description: 'Template for split chunk names'
	})
	.option('common-chunk-name', {
		type: 'string',
		description: 'Template for common chunk names'
	})
	.option('source-maps', {
		alias: 's',
		description: 'Create source maps',
		defaultDescription: 'false',
		type: 'string',
		coerce(val) {
			if (val === 'inline' || isBoolean(val) || val === undefined) return val;
			if (val === '') return true;
			throw new Error("--source-maps option should have no value or 'inline'");
		}
	})
	.option('exec', {
		description: 'Output executable script',
		type: 'boolean',
		default: true
	})
	.option('jsx', {
		description: 'JSX source',
		type: 'boolean',
		default: false
	})
	.option('stats', {
		description: 'Output stats file',
		defaultDescription: 'false',
		type: 'string',
		coerce(val) {
			if (val === '') return true;
			if (isString(val) || isBoolean(val) || val === undefined) return val;
			throw new Error('--stats option should have no value or string for name of stats file');
		}
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
	})
	.option('debug', {
		description: 'Output debug info',
		type: 'boolean',
		default: false,
		hidden: true
	});

// Determine output path
const outPath = pathResolve(argv.output);

// Conform inputs array to object
let inputs = argv.input;
if (isString(inputs)) {
	inputs = {[DEFAULT_OUTPUT_FILENAME]: inputs};
} else if (isArray(inputs)) {
	const inputsObj = {};
	for (const path of inputs) {
		assert(isString(path), '`input` paths must be strings');
		const {name} = pathParse(path);
		assert(!inputsObj[name], `Multiple input files with same name '${name}'`);
		inputsObj[name] = path;
	}
	inputs = inputsObj;
} else {
	assert(isObject(inputs), '`input` must be a string, object or array');
	for (const [name, path] of Object.entries(inputs)) {
		assert(isString(name), '`input` keys must be strings');
		assert(isString(path), '`input` paths must be strings');
	}
}

// Execute `exec.js` as child process with loader.
// Sends loader options to loader via JSON query string.
// Sends serialization options to `exec.js` via IPC.
const loaderOptions = {
	jsx: argv.jsx,
	configFile: argv.babelConfigFile || argv.babelConfig === 'pre',
	babelrc: argv.babelrc === 'pre' ? true : undefined,
	cache: argv.babelCache
};

const serializeOptions = {
	format: argv.format,
	ext: argv.ext,
	mapExt: argv.mapExt,
	exec: argv.exec,
	minify: argv.minify,
	inline: argv.inline,
	mangle: argv.mangle,
	comments: argv.comments,
	entryChunkName: argv.entryChunkName,
	splitChunkName: argv.splitChunkName,
	commonChunkName: argv.commonChunkName,
	sourceMaps: argv.sourceMaps || false,
	stats: argv.stats,
	outputDir: argv.sourceMaps ? outPath : undefined,
	debug: argv.debug
};

const child = spawn(
	process.execPath,
	[
		'--no-warnings', // Prevent warning about use of experimental features
		'--experimental-loader',
		`${pathJoin(__dirname, 'loader.mjs')}?${JSON.stringify(loaderOptions)}`,
		'--experimental-specifier-resolution=node',
		pathJoin(__dirname, 'exec.js')
	],
	{stdio: ['inherit', 'inherit', 'inherit', 'ipc']}
);

child.on('message', (msg) => {
	if (msg === 'ready') child.send({inputs, outPath, options: serializeOptions});
});
