/* --------------------
 * livepack module
 * Tests for CJS format
 * ------------------*/

'use strict';

// Modules
const serialize = require('livepack');

// Tests

function serializeCJS(val) {
	return serialize(val, {format: 'cjs', inline: false, mangle: false});
}

describe('CJS output format', () => {
	it('protects `module` var', () => {
		expect(serializeCJS({module: {}}))
			.toBe('const module$0={},exports$0={module:module$0};module.exports=exports$0');
	});

	it('protects `exports` var', () => {
		expect(serializeCJS({})).toBe('const exports$0={};module.exports=exports$0');
		expect(serializeCJS({exports: {}}))
			.toBe('const exports$0={},exports$1={exports:exports$0};module.exports=exports$1');
	});

	it('protects `require` var', () => {
		expect(serializeCJS({require: {}}))
			.toBe('const require$0={},exports$0={require:require$0};module.exports=exports$0');
	});

	it('protects `__dirname` var', () => {
		expect(serializeCJS({__dirname: {}}))
			.toBe('const __dirname$0={},exports$0={__dirname:__dirname$0};module.exports=exports$0');
	});

	it('protects `__filename` var', () => {
		expect(serializeCJS({__filename: {}}))
			.toBe('const __filename$0={},exports$0={__filename:__filename$0};module.exports=exports$0');
	});
});
