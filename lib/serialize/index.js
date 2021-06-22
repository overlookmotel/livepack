/* --------------------
 * livepack module
 * Serialize
 * ------------------*/

'use strict';

// Modules
const assert = require('simple-invariant'),
	{isObject, isFunction, isBoolean, isString, isFullString} = require('is-it-type');

// Imports
const Serializer = require('./serializer.js'),
	{split, splitAsync} = require('./split.js'),
	{DEFAULT_STATS_FILENAME} = require('./constants.js'),
	{DEFAULT_OUTPUT_FILENAME} = require('../shared/constants.js');

// Constants
const FORMATS = ['js', 'cjs', 'esm'],
	FORMAT_ALIASES = {commonjs: 'cjs', mjs: 'esm'};

// Exports

module.exports = {
	serialize,
	serializeEntries,
	split,
	splitAsync
};

/**
 * Serialize value to Javascript code.
 * @param {*} val - Value to serialize.
 * @param {Object} [options] - Options object (see `conformOptions()` below for details)
 * @returns {string|Array<Object>} - Javascript code / array of file objects
 */
function serialize(val, options) {
	options = conformOptions(options, false);

	const files = serializeImpl({[DEFAULT_OUTPUT_FILENAME]: val}, options);

	if (options.files) return files;
	assert(files.length === 1, 'Cannot be output in a single file. Use `files` option.');
	return files[0].content;
}

/**
 * Serialize multiple values to Javascript code.
 * @param {Object} entries - Entry point values e.g. `{index: () => {}, other: () => {}}`
 * @param {Object} [options] - Options object (see `conformOptions()` below for details)
 * @returns {Array<Object>} - Array of file objects
 */
function serializeEntries(entries, options) {
	assert(isObject(entries), 'entries must be an object');

	options = conformOptions(options, true);
	assert(options.files, 'options.files cannot be false for `serializeEntries()`');

	return serializeImpl(entries, options);
}

function serializeImpl(entries, options) {
	const serializer = new Serializer(options);
	return serializer.serialize(entries);
}

/**
 * Conform options.
 * @param {Object} [options] - Options object
 * @param {string} [options.format='js'] - Output format - 'js' / 'esm' / 'cjs'
 * @param {string} [options.ext='js'] - JS file extension
 * @param {string} [options.mapExt='map'] - Source map file extension
 * @param {boolean} [options.exec=false] - If true, export will be called
 * @param {boolean} [options.minify=true] - If false, JS is not minified (defaults to true)
 * @param {boolean} [options.inline] - If false, every object is a separate var
 *   (default inherits `options.minify`)
 * @param {boolean} [options.mangle] - If false, vars left with original names, rather than shortening
 *   (default inherits `options.minify`)
 * @param {boolean} [options.comments] - If true, comments are left in JS
 *   (default inherits `!options.minify`)
 * @param {boolean} [options.files] - If true, output array of files, each of form `{filename, content}`
 * @param {boolean} [options.strictEnv] - If true, entry points output will be created to run in strict
 *   mode. If false, to run in sloppy mode. Default is false for `js` format.
 *   Only false is valid for `cjs` format, only true is valid for `esm` format.
 * @param {boolean|string} [options.sourceMaps=false] - If true, output will include source maps
 *   as separate files. If 'inline', will make source maps inline.
 * @param {string} [options.outputDir=null] - If provided, source maps will use paths relative
 *   to this directory
 * @param {Function} [options.shouldPrintComment=null] - If provided, function is called with text of
 *   every comment encountered in source. If function returns true, the comment is retained in output.
 * @param {boolean} [options.debug=false] - If `true`, prints debug info to stderr
 * @param {boolean} filesDefault - Default value for `files` option
 * @returns {Object} - Options object
 */
function conformOptions(options, filesDefault) {
	// Conform options to object
	if (options == null) {
		options = {};
	} else {
		assert(isObject(options), 'options must be an object if provided');
		options = {...options};
	}

	// Get `format` option
	let {format} = options;
	if (format == null) {
		format = options.format = 'js';
	} else {
		assert(isString(format), 'options.format must be a string if provided');

		const alias = FORMAT_ALIASES[format];
		if (alias) {
			format = options.format = alias;
		} else {
			assert(
				FORMATS.includes(format),
				`options.format must be one of ${FORMATS.concat(Object.keys(FORMAT_ALIASES)).map(f => `'${f}'`).join(', ')} if provided`
			);
		}
	}

	// Get `exec` option
	const conformBool = conformBoolOption.bind(null, options);
	conformBool('exec', false);
	assert(!options.exec || format !== 'js', "options.exec cannot be true if options.format is 'js'");

	// Get `ext` + `mapExt` options
	const {ext, mapExt} = options;
	if (ext == null) {
		options.ext = 'js';
	} else {
		assert(isFullString(ext), 'options.ext must be a string if provided');
		assert(!/[/\\]/.test(ext), 'options.ext must not contain slashes');
	}

	if (mapExt == null) {
		options.mapExt = 'map';
	} else {
		assert(isFullString(mapExt), 'options.mapExt must be a string if provided');
		assert(!/[/\\]/.test(mapExt), 'options.mapExt must not contain slashes');
	}

	// Conform `minify`, `inline`, `mangle`, `comments`, `files`, `debug` options
	conformBool('minify', true);
	conformBool('inline', true);
	conformBool('mangle', options.minify); // Mangling defaults to enabled if minifying enabled
	conformBool('comments', !options.minify); // Comments defaults to disabled if minifying enabled
	conformBool('files', filesDefault);
	conformBool('debug', false);

	// Conform and validate `strictEnv` option
	const {strictEnv} = options;
	if (strictEnv == null) {
		options.strictEnv = format === 'esm';
	} else {
		assert(isBoolean(strictEnv), 'options.strictEnv must be a boolean if provided');
		if (format === 'cjs') {
			assert(!strictEnv, 'options.strictEnv cannot be true for CommonJS format');
		} else if (format === 'esm') {
			assert(strictEnv, 'options.strictEnv cannot be false for ESM format');
		}
	}

	// Get filename options
	const conformChunkName = conformChunkNameOption.bind(null, options);
	options.entryChunkName = conformChunkName('entryChunkName', '[name]');
	options.splitChunkName = conformChunkName('splitChunkName', '[name].[hash]');
	options.commonChunkName = conformChunkName('commonChunkName', 'common.[hash]');

	// Conform `sourceMaps` option
	const {sourceMaps} = options;
	if (sourceMaps == null) {
		options.sourceMaps = false;
	} else {
		assert(
			isBoolean(sourceMaps) || sourceMaps === 'inline',
			"options.sourceMaps must be true, false or 'inline' if provided"
		);
		assert(
			sourceMaps !== true || options.files,
			"options.sourceMaps must be false or 'inline' unless options.files is true"
		);
	}

	// Conform `outputDir` option
	const {outputDir} = options;
	if (outputDir != null) {
		assert(isFullString(outputDir), 'options.outputDir must be a string if provided');
		if (/[/\\]$/.test(outputDir)) options.outputDir = outputDir.slice(0, -1);
	} else {
		options.outputDir = null;
	}

	// Conform `stats` options
	const {stats} = options;
	if (stats == null || stats === false) {
		options.stats = null;
	} else if (stats === true) {
		options.stats = DEFAULT_STATS_FILENAME;
	} else {
		assert(isString(stats), 'options.stats must be a boolean or string if provided');
	}

	// Conform `shouldPrintComment` option
	const {shouldPrintComment} = options;
	if (shouldPrintComment != null) {
		assert(isFunction(shouldPrintComment), 'options.shouldPrintComment must be a function if provided');
	} else {
		options.shouldPrintComment = null;
	}

	return options;
}

function conformBoolOption(options, name, defaultValue) {
	const value = options[name];
	if (value == null) {
		options[name] = defaultValue;
	} else {
		assert(isBoolean(value), `options.${name} must be a boolean if provided`);
	}
}

function conformChunkNameOption(options, name, defaultValue) {
	const value = options[name];
	if (value == null) return defaultValue;

	const opt = `options.${name}`;
	assert(isFullString(value), `${opt} must be a non-empty string if provided`);

	const parts = value.split('[');
	let isValid = true;
	const placeholders = [];
	if (parts[0].includes(']')) {
		isValid = false;
	} else {
		for (let i = 1; i < parts.length; i++) {
			const [placeholder, ...following] = parts[i].split(']');
			if (following.length !== 1) {
				isValid = false;
				break;
			}
			placeholders.push(placeholder);
		}
	}

	assert(isValid, `${opt} is invalid`);
	const invalidPlaceholder = placeholders.find(placeholder => !['name', 'hash'].includes(placeholder));
	assert(
		invalidPlaceholder === undefined,
		`${opt} contains invalid placeholder '[${invalidPlaceholder}]'`
	);

	return value;
}
