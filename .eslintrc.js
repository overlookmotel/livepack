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
		files: ['example/src/index.js'],
		parserOptions: {
			sourceType: 'module',
			ecmaFeatures: {jsx: true}
		},
		extends: [
			'plugin:react/recommended'
		],
		rules: {
			'node/no-unsupported-features/es-syntax': ['error', {
				ignores: ['modules']
			}],
			'react/prop-types': 'off'
		}
	}]
};
