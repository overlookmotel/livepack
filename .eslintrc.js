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
	parserOptions: {
		ecmaVersion: 2020
	},
	rules: {
		'node/no-unsupported-features/es-syntax': ['error', {ignores: ['dynamicImport']}]
	}
};
