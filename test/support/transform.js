/* --------------------
 * livepack
 * Jest transformer.
 * `babel-jest`, shimmed to inject files' code (after transform by babel plugin)
 * back into files in local `__codeAfterBabelTransform__` var.
 * Used in `test/misc.test.js`.
 * See: https://jestjs.io/docs/en/tutorial-react#custom-transformers
 * ------------------*/

'use strict';

// Modules
const babelJest = require('babel-jest');

// Imports
const babelPlugin = require('../../babel.js');

// Exports

const transformer = babelJest.createTransformer({
	plugins: [babelPlugin],
	generatorOpts: {retainLines: true, compact: false}
});

const {process} = transformer;
transformer.process = function(src, filename, config, transformOptions) {
	// Call original `babel-jest` `process()` method
	const out = process.call(this, src, filename, config, transformOptions);

	// Inject `var __codeAfterBabelTransform__ = <code>` into code before the sourcemap comment
	const {code} = out;
	const match = code.match(/\n\/\/# sourceMappingURL=([^\n]+)$/);
	if (match) {
		const {index} = match;
		const codeBody = code.slice(0, index);
		out.code = codeBody // eslint-disable-line prefer-template
			+ `\nvar __codeAfterBabelTransform__ = ${JSON.stringify(codeBody)}`
			+ code.slice(index);
	}

	return out;
};

module.exports = transformer;
