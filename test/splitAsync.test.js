/* --------------------
 * livepack module
 * Tests for `splitAsync`
 * ------------------*/

'use strict';

// Modules
const pathJoin = require('path').join,
	{isModuleNamespaceObject} = require('util').types,
	{splitAsync} = require('livepack');

// Constants
const NUM_FIXTURES = 5;

// Tests

const fixturesPaths = new Array(NUM_FIXTURES).fill()
	.map((_, index) => pathJoin(__dirname, `fixtures/splitAsync/${index}.js`));

describe('splitAsync', () => {
	runTests(
		(val, index) => {
			if (!val) val = {x: index || 0};
			const importFn = splitAsync(val);
			return {val, importFn};
		},
		false
	);

	describe('behaves same as `() => import()`', () => {
		runTests(
			(val, index) => {
				const path = fixturesPaths[index || 0];
				val = require(path);// eslint-disable-line global-require, import/no-dynamic-require
				const importFn = (0, () => import(path));
				return {val, importFn};
			},
			true
		);
	});
});

function runTests(createImport, isNativeImport) {
	describe('1 call', () => {
		let val, importFn, mod;
		beforeEach(async () => {
			({val, importFn} = createImport());
			mod = await importFn();
		});

		describe('returns', () => {
			it('a function', () => {
				expect(importFn).toBeFunction();
			});

			it('a function with no name', () => {
				expect(importFn.name).toBe('');
			});

			it('a function which returns a promise', async () => {
				await expect(importFn()).resolves.toBeDefined();
			});

			describe('returns new promise on each call', () => {
				it('when called synchronously', async () => {
					const promises = [];
					for (let i = 0; i < NUM_FIXTURES; i++) {
						promises.push(importFn());
					}

					for (const promise of promises) {
						await expect(promise).resolves.toBeDefined();
					}

					expectAllToBeDifferent(promises);
				});

				it('when called asynchronously', async () => {
					const promises = [];
					for (let i = 0; i < NUM_FIXTURES; i++) {
						const promise = importFn();
						promises.push(promise);
						await expect(promise).resolves.toBeDefined();
						await delay();
					}
					expectAllToBeDifferent(promises);
				});
			});
		});

		describe('promise resolves to a module', () => {
			it('object', () => {
				expect(mod).toBeObject();
			});

			it('module namespace object', () => {
				expect(isModuleNamespaceObject(mod)).toBeTrue();
			});

			it('with only default and [Symbol.toStringTag] properties', () => {
				expect(mod).toHaveOwnPropertyNames(['default']);
				expect(mod).toHaveOwnPropertySymbols([Symbol.toStringTag]);
			});

			it('default property is original value', () => {
				expect(mod.default).toBe(val);
			});

			it("with [Symbol.toStringTag] property 'Module'", () => {
				expect(mod[Symbol.toStringTag]).toBe('Module');
			});

			it('default property is writable and enumerable, but not configurable', () => {
				expect(mod).toHaveDescriptorModifiersFor('default', true, true, false);
			});

			it('[Symbol.toStringTag] property is not writable, enumerable or configurable', () => {
				expect(mod).toHaveDescriptorModifiersFor(Symbol.toStringTag, false, false, false);
			});

			it('with null prototype', () => {
				expect(mod).toHavePrototype(null);
			});

			it('non-extensible', () => {
				expect(Object.isExtensible(mod)).toBeFalse();
			});

			it('sealed', () => {
				expect(Object.isSealed(mod)).toBeTrue();
			});

			it('not frozen', () => {
				expect(Object.isFrozen(mod)).toBeFalse();
			});

			it('default property cannot be written to', () => {
				expect(() => {
					mod.default = 1;
				}).toThrow(
					new Error("Cannot assign to read only property 'default' of object '[object Module]'")
				);
			});
		});
	});

	describe('multiple calls with different values', () => {
		let vals, importFns;
		beforeEach(() => {
			vals = [];
			importFns = [];
			for (let index = 0; index < NUM_FIXTURES; index++) {
				const {val, importFn} = createImport(null, index);
				vals[index] = val;
				importFns[index] = importFn;
			}
		});

		it('each return a different function', () => { // eslint-disable-line jest/expect-expect
			expectAllToBeDifferent(importFns);
		});

		describe('when called synchronously', () => {
			let promises, modules;
			beforeEach(async () => {
				promises = importFns.map(importFn => importFn());
				modules = await Promise.all(promises);
			});

			it('each return different promises', () => { // eslint-disable-line jest/expect-expect
				expectAllToBeDifferent(promises);
			});

			it('each promise resolves to different module', () => { // eslint-disable-line jest/expect-expect
				expectAllToBeDifferent(modules);
			});

			it('each module exports correct value', () => {
				modules.forEach((mod, index) => {
					expect(mod.default).toBe(vals[index]);
				});
			});
		});

		describe('when called asynchronously', () => {
			let promises, modules;
			beforeEach(async () => {
				promises = [];
				modules = [];
				for (const importFn of importFns) {
					const promise = importFn();
					const mod = await promise;
					promises.push(promise);
					modules.push(mod);
					await delay();
				}
			});

			it('each return different promises', () => { // eslint-disable-line jest/expect-expect
				expectAllToBeDifferent(promises);
			});

			it('each promise resolves to different module', () => { // eslint-disable-line jest/expect-expect
				expectAllToBeDifferent(modules);
			});

			it('each module exports correct value', () => {
				modules.forEach((mod, index) => {
					expect(mod.default).toBe(vals[index]);
				});
			});
		});
	});

	describe('multiple calls with same value', () => {
		let val, importFns;
		beforeEach(() => {
			const values = [];
			val = {x: 0};
			importFns = [];
			for (let index = 0; index < NUM_FIXTURES; index++) {
				const {val: value, importFn} = createImport(val, 0);
				values[index] = value;
				if (isNativeImport) val = value;
				importFns[index] = importFn;
			}
		});

		it('each return a different function', () => { // eslint-disable-line jest/expect-expect
			expectAllToBeDifferent(importFns);
		});

		describe('when called synchronously', () => {
			let promises, modules;
			beforeEach(async () => {
				promises = importFns.map(importFn => importFn());
				modules = await Promise.all(promises);
			});

			it('each return different promises', () => { // eslint-disable-line jest/expect-expect
				expectAllToBeDifferent(promises);
			});

			it('each promise resolves to same module', () => { // eslint-disable-line jest/expect-expect
				expectAllToBeSame(modules);
			});

			it('each module exports correct value', () => {
				for (const mod of modules) {
					expect(mod.default).toBe(val);
				}
			});
		});

		describe('when called asynchronously', () => {
			let promises, modules;
			beforeEach(async () => {
				promises = [];
				modules = [];
				for (const importFn of importFns) {
					const promise = importFn();
					const mod = await promise;
					promises.push(promise);
					modules.push(mod);
					await delay();
				}
			});

			it('each return different promises', () => { // eslint-disable-line jest/expect-expect
				expectAllToBeDifferent(promises);
			});

			it('each promise resolves to same module', () => { // eslint-disable-line jest/expect-expect
				expectAllToBeSame(modules);
			});

			it('each module exports correct value', () => {
				for (const mod of modules) {
					expect(mod.default).toBe(val);
				}
			});
		});
	});
}

function expectAllToBeDifferent(values) {
	for (let i = 0; i < values.length; i++) {
		for (let j = 0; j < values.length; j++) {
			if (i !== j) expect(values[j]).not.toBe(values[i]);
		}
	}
}

function expectAllToBeSame(values) {
	for (let i = 1; i < values.length; i++) {
		expect(values[i]).toBe(values[0]);
	}
}

function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms || 20);
	});
}
