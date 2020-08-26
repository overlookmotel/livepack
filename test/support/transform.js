/* --------------------
 * livepack
 * Jest transformer.
 * `babel-jest`, shimmed to record files' code (after transform by babel plugin)
 * in `internal.transpiledFiles`, same as `livepack/register` does.
 * Used in `test/misc.test.js`.
 * See: https://jestjs.io/docs/en/tutorial-react#custom-transformers
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, parse: pathParse} = require('path'),
	babelJest = require('babel-jest');

// Imports
const babelPlugin = require('../../babel.js'),
	{parseSourceMapFromCode} = require('../../lib/shared.js');

// Constants
const LIVEPACK_INTERNALS_PATH = pathJoin(__dirname, '..', '..', 'lib', 'internal.js');

// Exports

const transformer = babelJest.createTransformer({
	ignore: [],
	root: pathParse(__dirname).root,
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
