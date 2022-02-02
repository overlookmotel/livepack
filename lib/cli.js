#!/usr/bin/env node

/* eslint-disable import/order, import/newline-after-import */

'use strict';

// Use internal module cache
const {useInternalModuleCache} = require('./shared/moduleCache.js');
const revertModuleCache = useInternalModuleCache();

// Modules
const {resolve: pathResolve, join: pathJoin, dirname, parse: pathParse} = require('path'),
	{readFileSync} = require('fs'),
	yargs = require('yargs'),
	findUp = require('find-up'),
	stripJsonComments = require('strip-json-comments'),
	{isObject, isArray, isString, isBoolean} = require('is-it-type'),
	assert = require('simple-invariant');

// CLI

// Throw unhandled rejections
process.on('unhandledRejection', (err) => {
	throw err;
});

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

// The following is all after yargs option parsing, rather than at top of file,
// to avoid slow response for `livepack --help` or a command with missing/invalid options.

// Catalog globals etc
require('./init/index.js');

// Import dependencies required for serialize.
// `fs-extra` must be imported after cataloging globals as `fs-extra` uses `graceful-fs` internally,
// which monkey-patches `fs` module. Need to catalog globals before `graceful-fs`'s patches are applied.
const {writeFile, mkdirs} = require('fs-extra'),
	{serializeEntries} = require('./serialize/index.js'),
	{DEFAULT_OUTPUT_FILENAME} = require('./shared/constants.js');

// Switch back to global module cache
revertModuleCache();

// Register Babel transform to track scopes
const register = require('./register.js');

register({
	esm: argv.esm,
	jsx: argv.jsx,
	cache: argv.babelCache
});

// Serialize
(async () => {
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

	// Load sources
	const entries = {};
	await Promise.all(
		Object.entries(inputs).map(async ([name, pathOriginal]) => {
			const path = pathResolve(pathOriginal);

			let entry;
			try {
				entry = require(path); // eslint-disable-line global-require, import/no-dynamic-require
			} catch (err) {
				if (
					err && err.code === 'MODULE_NOT_FOUND'
					&& err.message.split('\n')[0] === `Cannot find module '${path}'`
					&& err.requireStack
					&& err.requireStack.length === 1
					&& err.requireStack[0] === __filename
				) {
					throw new Error(`Cannot load input file '${pathOriginal}'`);
				}
				throw err;
			}

			if (entry && entry.__esModule) entry = entry.default;

			// Await Promise value
			entry = await entry;

			entries[name] = entry;
		})
	);

	// Serialize
	const files = serializeEntries(entries, {
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
	});

	// Output files
	for (const {filename, content} of files) {
		const path = pathJoin(outPath, filename);
		await mkdirs(dirname(path));
		await writeFile(path, content);
	}
})();
