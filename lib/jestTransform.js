/* --------------------
 * livepack module
 * Jest transform entry point.
 *
 * `babel-jest`, shimmed to:
 * 1. Use Livpack Babel plugin to transform files
 * 2. Record files' code (after transform by Babel plugin) in `internal.transpiledFiles`,
 *   same as `livepack/register` does.
 * See: https://jestjs.io/docs/en/tutorial-react#custom-transformers
 * ------------------*/

'use strict';

// Modules
const pathJoin = require('path').join,
	{createTransformer} = require('babel-jest');

// Imports
const {createBabelConfig, EXT_TYPES} = require('./babel/config.js'),
	{parseSourceMapFromCode} = require('./shared/functions.js');

// Constants
const LIVEPACK_INTERNALS_PATH = pathJoin(__dirname, 'internal.js');

// Exports

const transformer = createTransformer(
	createBabelConfig({
		configFile: false,
		babelrc: false,
		jsx: false,
		extTypes: EXT_TYPES
	})
);

const {process} = transformer;
transformer.process = function(src, filename, config, transformOptions) {
	// Call original `babel-jest` `process()` method
	const out = process.call(this, src, filename, config, transformOptions);

	// Inject `require('.../internal.js').transpiledFiles[__filename] = {code: ..., sourceMapComment: ...}`
	// into code before the source map comment to replicate what `register.js` does.
	const file = parseSourceMapFromCode(out.code),
		{sourceMapComment} = file;
	if (sourceMapComment) {
		out.code = file.code // eslint-disable-line prefer-template
			+ `require(${JSON.stringify(LIVEPACK_INTERNALS_PATH)}).transpiledFiles[__filename] = ${JSON.stringify(file)};\n`
			+ sourceMapComment;
	}

	return out;
};

module.exports = transformer;
