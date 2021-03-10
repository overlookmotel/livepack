'use strict';

module.exports = {
	parserOptions: {
		ecmaFeatures: {
			jsx: true
		}
	},
	env: {
		browser: true,
		node: true
	},
	rules: {
		'import/no-unresolved': ['off'],
		'node/no-missing-require': ['off'],
		'no-unused-vars': ['off']
	}
};
