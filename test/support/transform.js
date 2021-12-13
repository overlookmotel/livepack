/* --------------------
 * livepack module
 * Jest transform
 *
 * `babel-jest`, shimmed to:
 * 1. Use Livpack Babel plugin to transform files
 * 2. Record files' code (after transform by Babel plugin) so tests can test output of Babel plugin
 * See: https://jestjs.io/docs/en/tutorial-react#custom-transformers
 * ------------------*/

'use strict';

// Modules
const pathSep = require('path').sep,
	babelJest = require('babel-jest').default;

// Imports
const babelPlugin = require('../../babel.js'),
	{isInternalPath} = require('../../lib/shared/functions.js');

// Constants
const TESTS_SUPPORT_DIR_PATH = `${__dirname}${pathSep}`,
	TRANSPILED_FILES_PATH = `${TESTS_SUPPORT_DIR_PATH}transpiledFiles.js`,
	SOURCE_MAP_SPLIT_REGEX = /^([\s\S]+?)(\n\/\/# sourceMappingURL=(?:[^\n]+))?$/;

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
	// Do not transform Livepack internals or tests support files
	if (isInternalPath(filename) || filename.startsWith(TESTS_SUPPORT_DIR_PATH)) return src;

	// Call original `babel-jest` `process()` method
	const out = process.call(this, src, filename, config, transformOptions);

	// Inject `require('livepack/test/support/transpiledFiles.js')[__filename] = '<code>';`
	// into code of files before the source map comment
	const [, codeBody, sourceMapComment = ''] = out.code.match(SOURCE_MAP_SPLIT_REGEX);
	out.code = codeBody // eslint-disable-line prefer-template
		+ `\nrequire(${JSON.stringify(TRANSPILED_FILES_PATH)})[__filename] = ${JSON.stringify(codeBody)};`
		+ sourceMapComment;
	return out;
};

module.exports = transformer;
