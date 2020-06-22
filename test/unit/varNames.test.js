/* --------------------
 * livepack module
 * Unit tests for var name factories
 * ------------------*/

'use strict';

// Imports
const {
	createMangledVarNameTransform,
	createUnmangledVarNameTransform,
	MangledVarNameFactory
} = require('../../lib/serialize/varNames.js');

// Tests

describe('createMangledVarNameTransform', () => {
	describe('without reserved names', () => {
		let transform, useUntil;
		beforeEach(() => {
			transform = createMangledVarNameTransform();
			useUntil = name => useTransformUntil(transform, name);
		});

		it('produces "a" first', () => {
			expect(transform()).toBe('a');
		});

		it.each([
			['b', 'a'],
			['c', 'b'],
			['A', 'z'],
			['B', 'A'],
			['C', 'B'],
			['aa', 'Z'],
			['ab', 'aa'],
			['ac', 'ab'],
			['aA', 'az'],
			['aB', 'aA'],
			['ba', 'aZ'],
			['bb', 'ba'],
			['bc', 'bb'],
			['bA', 'bz'],
			['bB', 'bA'],
			['Aa', 'zZ'],
			['Ab', 'Aa'],
			['Ac', 'Ab'],
			['AA', 'Az'],
			['AB', 'AA'],
			['AC', 'AB'],
			['Ba', 'AZ'],
			['Bb', 'Ba'],
			['BA', 'Bz'],
			['BB', 'BA'],
			['BC', 'BB'],
			['aaa', 'ZZ'],
			['aab', 'aaa'],
			['aac', 'aab'],
			['aba', 'aaZ'],
			['abb', 'aba'],
			['abc', 'abb']
		])(
			'produces %p after %p',
			(nextName, previousName) => {
				if (previousName) useUntil(previousName);
				expect(transform()).toBe(nextName);
			}
		);

		describe('avoids JS reserved words', () => {
			it('do', () => {
				useUntil('dn');
				expect(transform()).toBe('dp');
			});

			it('this', () => {
				// Shortcut to prevent iterating all the way through to 'this'
				const factory = new MangledVarNameFactory();
				transform = factory.transform.bind(factory);
				factory.counter = 2834276;

				useUntil('thir');
				expect(transform()).toBe('thit');
			});
		});
	});

	describe('with reserved names', () => {
		const reserved = new Set(['a', 'b', 'e', 'f', 'g', 'z', 'ae', 'af', 'ag', 'AA', 'Za', 'aaa']);
		let transform, useUntil;
		beforeEach(() => {
			transform = createMangledVarNameTransform(reserved);
			useUntil = name => useTransformUntil(transform, name);
		});

		it.each([
			['a + b', 'c', null],
			['e + f + g', 'h', 'd'],
			['z', 'A', 'y'],
			['ae + af + ag', 'ah', 'ad'],
			['AA', 'AB', 'Az'],
			['Za', 'Zb', 'YZ'],
			['aaa', 'aab', 'ZZ']
		])(
			'skips %p when reserved',
			(skipName, nextName, previousName) => {
				if (previousName) useUntil(previousName);
				expect(transform()).toBe(nextName);
			}
		);

		it.each([
			['d', 'c'],
			['n', 'm'],
			['ai', 'ah'],
			['AC', 'AB'],
			['Df', 'De'],
			['Zc', 'Zb'],
			['aac', 'aab']
		])(
			'produces %p after %p',
			(nextName, previousName) => {
				if (previousName) useUntil(previousName);
				expect(transform()).toBe(nextName);
			}
		);

		describe('avoids JS reserved words', () => {
			it('do', () => {
				useUntil('dn');
				expect(transform()).toBe('dp');
			});

			it('this', () => {
				// Shortcut to prevent iterating all the way through to 'this'
				const factory = new MangledVarNameFactory(reserved);
				transform = factory.transform.bind(factory);
				factory.counter = 2834276;

				useUntil('thir');
				expect(transform()).toBe('thit');
			});
		});
	});
});

describe('createUnmangledVarNameTransform', () => {
	describe('without reserved names', () => {
		let transform, useUntil;
		beforeEach(() => {
			transform = createUnmangledVarNameTransform();
			useUntil = (name, inputName) => useTransformUntil(transform, name, inputName);
		});

		describe('leaves names unchanged if not used before', () => {
			it('first var', () => {
				expect(transform('foo')).toBe('foo');
			});

			it('2nd var', () => {
				transform('bar');
				expect(transform('foo')).toBe('foo');
			});
		});

		describe('postpends if used before', () => {
			it('first var', () => {
				expect(transform('foo')).toBe('foo');
				expect(transform('foo')).toBe('foo$0');
				expect(transform('foo')).toBe('foo$1');
				expect(transform('foo')).toBe('foo$2');
				useUntil('foo$9', 'foo');
				expect(transform('foo')).toBe('foo$10');
				expect(transform('foo')).toBe('foo$11');
			});

			it('2nd var', () => {
				transform('bar');
				transform('bar');
				expect(transform('foo')).toBe('foo');
				expect(transform('foo')).toBe('foo$0');
				expect(transform('foo')).toBe('foo$1');
				expect(transform('foo')).toBe('foo$2');
				useUntil('foo$9', 'foo');
				expect(transform('foo')).toBe('foo$10');
				expect(transform('foo')).toBe('foo$11');
			});
		});

		describe('postpends if used before with postpend', () => {
			it('first var', () => {
				expect(transform('foo$3')).toBe('foo$3');
				expect(transform('foo')).toBe('foo$4');
				expect(transform('foo')).toBe('foo$5');
				transform('foo$8');
				expect(transform('foo')).toBe('foo$9');
				expect(transform('foo')).toBe('foo$10');
				expect(transform('foo$7')).toBe('foo$11');
			});

			it('2nd var', () => {
				transform('bar');
				transform('bar');
				expect(transform('foo$3')).toBe('foo$3');
				expect(transform('foo')).toBe('foo$4');
				expect(transform('foo')).toBe('foo$5');
				transform('foo$8');
				expect(transform('foo')).toBe('foo$9');
				expect(transform('foo')).toBe('foo$10');
				expect(transform('foo$7')).toBe('foo$11');
			});
		});

		describe('avoids JS reserved words', () => {
			it('do', () => {
				expect(transform('do')).toBe('do$0');
				expect(transform('do')).toBe('do$1');
				expect(transform('do$2')).toBe('do$2');
				expect(transform('do$2')).toBe('do$3');
			});

			it('this', () => {
				expect(transform('this')).toBe('this$0');
				expect(transform('this')).toBe('this$1');
				expect(transform('this$2')).toBe('this$2');
				expect(transform('this$2')).toBe('this$3');
			});
		});
	});

	describe('with reserved names', () => {
		const reserved = new Set(['a', 'b', 'c$0', 'd$3']);
		let transform;
		beforeEach(() => {
			transform = createUnmangledVarNameTransform(reserved);
		});

		describe('leaves names unchanged if not used before', () => {
			it('first var', () => {
				expect(transform('foo')).toBe('foo');
			});

			it('2nd var', () => {
				transform('bar');
				expect(transform('foo')).toBe('foo');
			});
		});

		describe('avoids reserved names', () => {
			it('first name', () => {
				expect(transform('a')).toBe('a$0');
				expect(transform('a')).toBe('a$1');
			});

			it('2nd name', () => {
				expect(transform('b')).toBe('b$0');
				expect(transform('b')).toBe('b$1');
			});

			describe('where $0 postpend reserved', () => {
				it('when input name not postpended', () => {
					expect(transform('c')).toBe('c');
					expect(transform('c')).toBe('c$1');
					expect(transform('c')).toBe('c$2');
				});

				it('when input name has same postpend', () => {
					expect(transform('c$0')).toBe('c$1');
					expect(transform('c$0')).toBe('c$2');
				});
			});

			describe('where $3 postpend reserved', () => {
				it('when input name not postpended', () => {
					expect(transform('d')).toBe('d');
					expect(transform('d')).toBe('d$0');
					expect(transform('d')).toBe('d$1');
					expect(transform('d')).toBe('d$2');
					expect(transform('d')).toBe('d$4');
				});

				it('when input name has lower postpend', () => {
					expect(transform('d$0')).toBe('d$0');
					expect(transform('d$0')).toBe('d$1');
					expect(transform('d$0')).toBe('d$2');
					expect(transform('d$0')).toBe('d$4');
					expect(transform('d$0')).toBe('d$5');
				});

				it('when input name has higher postpend', () => {
					expect(transform('d$5')).toBe('d$5');
					expect(transform('d$5')).toBe('d$6');
				});

				it('when input name has same postpend', () => {
					expect(transform('d$3')).toBe('d$4');
					expect(transform('d$3')).toBe('d$5');
				});
			});
		});

		describe('avoids JS reserved words', () => {
			it('do', () => {
				expect(transform('do')).toBe('do$0');
				expect(transform('do')).toBe('do$1');
				expect(transform('do$2')).toBe('do$2');
				expect(transform('do$2')).toBe('do$3');
			});

			it('this', () => {
				expect(transform('this')).toBe('this$0');
				expect(transform('this')).toBe('this$1');
				expect(transform('this$2')).toBe('this$2');
				expect(transform('this$2')).toBe('this$3');
			});
		});
	});
});

function useTransformUntil(transform, name, inputName) {
	while (true) { // eslint-disable-line no-constant-condition
		if (transform(inputName) === name) return;
	}
}
