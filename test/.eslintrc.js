/* --------------------
 * livepack module
 * Tests ESLint config
 * ------------------*/

'use strict';

// Exports

module.exports = {
	extends: [
		'@overlookmotel/eslint-config-jest'
	],
	rules: {
		'import/no-unresolved': ['error', {ignore: ['^livepack$']}],
		'node/no-missing-require': ['error', {allowModules: ['livepack']}],
		'jest/no-standalone-expect': [
			'error',
			{
				additionalTestBlockFunctions: [
					'itSerializes',
					'itSerializes.skip',
					'itSerializes.only',
					'itSerializes.each',
					'itSerializesEqual',
					'itSerializesEqual.skip',
					'itSerializesEqual.only',
					'itSerializesEqual.each',
					'itSerializesEntries',
					'itSerializesEntries.skip',
					'itSerializesEntries.only',
					'itSerializesEntries.each',
					'itSerializesEntriesEqual',
					'itSerializesEntriesEqual.skip',
					'itSerializesEntriesEqual.only',
					'itSerializesEntriesEqual.each'
				]
			}
		]
	}
};
