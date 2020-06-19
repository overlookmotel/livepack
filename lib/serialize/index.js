/* --------------------
 * livepack module
 * Serialize
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	{isObject, isBoolean, isString} = require('is-it-type');

// Imports
const Serializer = require('./serializer.js');

// Constants
const FORMATS = ['js', 'cjs', 'esm'],
	DEFAULT_FORMAT = 'js',
	FORMAT_ALIASES = {commonjs: 'cjs', mjs: 'esm'},
	DEFAULT_OPTIONS = {
		inline: true,
		compact: true,
		comments: false
	};

// Exports

/**
 * Serialize value to Javascript code.
 * @param {*} val - Value to serialize.
 * @param {Object} [options] - Options object
 * @param {string} [options.format='js'] - Output format 'esm' / 'cjs' / 'js'
 * @param {boolean} [options.inline=true] - If false, every object is a separate var
 * @param {boolean} [options.compact=true] - If false, JS is not compacted
 * @param {boolean} [options.comments=false] - If true, comments are left in JS
 * @returns {string} - Javascript code
 */
module.exports = function serialize(val, options) {
	// Conform options
	if (options == null) {
		options = {};
	} else {
		assert(isObject(options), 'options must be an object if provided');
		options = {...options};
	}

	const {format} = options;
	if (format == null) {
		options.format = DEFAULT_FORMAT;
	} else {
		assert(isString(format), 'options.format must be a string if provided');

		const alias = FORMAT_ALIASES[format];
		if (alias) {
			options.format = alias;
		} else {
			assert(
				FORMATS.includes(format),
				`options.format must be one of ${(FORMATS.concat(Object.keys(FORMAT_ALIASES))).map(f => `'${f}'`).join(', ')} if provided`
			);
		}
	}

	for (const optName in DEFAULT_OPTIONS) {
		const optValue = options[optName];
		if (optValue == null) {
			options[optName] = DEFAULT_OPTIONS[optName];
		} else {
			assert(isBoolean(optValue), `options.${optName} must be a boolean if provided`);
		}
	}

	// Serialize value
	const serializer = new Serializer(options);
	return serializer.serialize(val);
};
