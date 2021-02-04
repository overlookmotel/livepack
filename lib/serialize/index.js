/* --------------------
 * livepack module
 * Serialize
 * ------------------*/

'use strict';

// Modules
const assert = require('simple-invariant'),
	{isObject, isFunction, isBoolean, isString, isFullString} = require('is-it-type');

// Imports
const Serializer = require('./serializer.js');

// Constants
const FORMATS = ['js', 'cjs', 'esm'],
	FORMAT_ALIASES = {commonjs: 'cjs', mjs: 'esm'};

// Exports

/**
 * Serialize value to Javascript code.
 *
 * @param {*} val - Value to serialize.
 * @param {Object} [options] - Options object
 * @param {string} [options.format='js'] - Output format - 'js' / 'esm' / 'cjs'
 * @param {boolean} [options.exec=false] - If true, export will be called
 * @param {boolean} [options.minify=true] - If false, JS is not minified (defaults to true)
 * @param {boolean} [options.inline] - If false, every object is a separate var
 *   (default inherits `options.minify`)
 * @param {boolean} [options.mangle] - If false, vars left with original names, rather than shortening
 *   (default inherits `options.minify`)
 * @param {boolean} [options.comments] - If true, comments are left in JS
 *   (default inherits `!options.minify`)
 * @param {boolean} [options.files=false] - If true, output array of files,
 *   each of form `{filename, content}`
 * @param {boolean} [options.sourceMaps=false] - If true, output will include source maps
 * @param {string} [options.outputDir=null] - If provided, source maps will use paths relative
 *   to this directory
 * @param {Function} [options.shouldPrintComment=null] - If provided, function is called with text of
 *   every comment encountered in source. If function returns true, the comment is retained in output.
 * @param {boolean} [options.debug=false] - If `true`, prints debug info to stderr
 * @returns {string|Array<Object>} - Javascript code / array of file objects
 */
module.exports = function serialize(val, options) {
	// Conform options
	if (options == null) {
		options = {};
	} else {
		assert(isObject(options), 'options must be an object if provided');
		options = {...options};
	}

	// Get `format` option - default 'js'
	const {format} = options;
	if (format == null) {
		options.format = 'js';
	} else {
		assert(isString(format), 'options.format must be a string if provided');

		const alias = FORMAT_ALIASES[format];
		if (alias) {
			options.format = alias;
		} else {
			assert(
				FORMATS.includes(format),
				`options.format must be one of ${FORMATS.concat(Object.keys(FORMAT_ALIASES)).map(f => `'${f}'`).join(', ')} if provided`
			);
		}
	}

	// Conform `exec`, `minify`, `inline`, `mangle`, `comments`, `files`, `sourceMaps`, `debug` options
	const conformBool = conformBoolOption.bind(null, options);
	conformBool('exec', false);
	conformBool('minify', true);
	conformBool('inline', true);
	conformBool('mangle', options.minify); // Mangling defaults to enabled if minifying enabled
	conformBool('comments', !options.minify); // Comments defaults to disabled if minifying enabled
	conformBool('files', false);
	conformBool('sourceMaps', false);
	conformBool('debug', false);

	// Conform `outputDir` option
	const {outputDir} = options;
	if (outputDir != null) {
		assert(isFullString(outputDir), 'options.outputDir must be a string if provided');
		if (/[/\\]$/.test(outputDir)) options.outputDir = outputDir.slice(0, -1);
	} else {
		options.outputDir = null;
	}

	// Conform `shouldPrintComment` option
	const {shouldPrintComment} = options;
	if (shouldPrintComment != null) {
		assert(isFunction(shouldPrintComment), 'options.shouldPrintComment must be a function if provided');
	} else {
		options.shouldPrintComment = null;
	}

	// Serialize value
	const serializer = new Serializer(options);
	return serializer.serialize(val);
};

function conformBoolOption(options, name, defaultValue) {
	const value = options[name];
	if (value == null) {
		options[name] = defaultValue;
	} else {
		assert(isBoolean(value), `options.${name} must be a boolean if provided`);
	}
}
