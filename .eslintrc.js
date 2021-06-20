/* --------------------
 * livepack module
 * ESLint config
 * ------------------*/

'use strict';

// Exports

module.exports = {
	extends: [
		'@overlookmotel/eslint-config',
		'@overlookmotel/eslint-config-node'
	],
	overrides: [{
		files: 'es/*',
		parserOptions: {
			sourceType: 'module'
		},
		rules: {
			'node/no-unpublished-import': ['off']
		}
	}]
};
