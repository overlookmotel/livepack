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
	babelJest = require('babel-jest').default;

// Imports
const babelPlugin = require('./babel/index.js'),
	{parseSourceMapFromCode} = require('./shared/functions.js');

// Constants
const LIVEPACK_INTERNALS_PATH = pathJoin(__dirname, 'shared/internal.js');

// Exports

const transformer = babelJest.createTransformer({
	ignore: [],
	configFile: false,
	babelrc: false,
	sourceType: 'script',
	plugins: [babelPlugin],
	generatorOpts: {retainLines: true, compact: false}
});

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
