/* --------------------
 * livepack module
 * Tests for object instances
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Instances', ({expectSerializedEqual}) => {
	it('empty object', () => {
		function F() {}
		expectSerializedEqual(
			new F(),
			'Object.create(function F(){}.prototype)',
			(obj) => {
				const ctor = Object.getPrototypeOf(obj).constructor;
				expect(ctor).toBeFunction();
				expect(ctor).not.toBe(Object);
				expect(ctor.name).toBe('F');
			}
		);
	});

	describe('with non-circular properties', () => {
		it('without descriptors', () => {
			function F() {}
			const input = new F();
			input.x = 1;
			input.y = 2;

			expectSerializedEqual(
				input,
				'(()=>{const a=Object;return a.assign(a.create(function F(){}.prototype),{x:1,y:2})})()',
				(obj) => {
					const ctor = Object.getPrototypeOf(obj).constructor;
					expect(ctor).toBeFunction();
					expect(ctor).not.toBe(Object);
					expect(ctor.name).toBe('F');
					expect(obj).toContainAllKeys(['x', 'y']);
					expect(obj.x).toBe(1);
					expect(obj.y).toBe(2);
				}
			);
		});

		it('with descriptors', () => {
			function F() {}
			const input = new F();
			input.x = 1;
			Object.defineProperty(input, 'y', {value: 2, enumerable: true});

			expectSerializedEqual(
				input,
				'Object.create(function F(){}.prototype,{x:{value:1,writable:true,enumerable:true,configurable:true},y:{value:2,enumerable:true}})',
				(obj) => {
					const ctor = Object.getPrototypeOf(obj).constructor;
					expect(ctor).toBeFunction();
					expect(ctor).not.toBe(Object);
					expect(ctor.name).toBe('F');
					expect(obj).toContainAllKeys(['x', 'y']);
					expect(obj.x).toBe(1);
					expect(obj.y).toBe(2);
					expect(obj).toHaveDescriptorModifiersFor('x', true, true, true);
					expect(obj).toHaveDescriptorModifiersFor('y', false, true, false);
				}
			);
		});
	});

	describe('with circular properties', () => {
		it('without descriptors', () => {
			function F() {}
			const input = new F();
			input.x = input;
			input.y = 2;
			input.z = input;

			expectSerializedEqual(
				input,
				'(()=>{const a=Object,b=a.assign(a.create(function F(){}.prototype),{x:void 0,y:2});b.x=b;b.z=b;return b})()',
				(obj) => {
					const ctor = Object.getPrototypeOf(obj).constructor;
					expect(ctor).toBeFunction();
					expect(ctor).not.toBe(Object);
					expect(ctor.name).toBe('F');
					expect(obj).toContainAllKeys(['x', 'y', 'z']);
					expect(obj.x).toBe(obj);
					expect(obj.y).toBe(2);
					expect(obj.z).toBe(obj);
				}
			);
		});

		it('with descriptors', () => {
			function F() {}
			const input = new F();
			input.x = input;
			input.y = 2;
			Object.defineProperty(input, 'z', {value: input, enumerable: true});

			expectSerializedEqual(
				input,
				'(()=>{const a=Object,b=a.assign(a.create(function F(){}.prototype),{x:void 0,y:2});a.defineProperties(b,{x:{value:b},z:{value:b,enumerable:true}});return b})()',
				(obj) => {
					const ctor = Object.getPrototypeOf(obj).constructor;
					expect(ctor).toBeFunction();
					expect(ctor).not.toBe(Object);
					expect(ctor.name).toBe('F');
					expect(obj).toContainAllKeys(['x', 'y', 'z']);
					expect(obj.x).toBe(obj);
					expect(obj.y).toBe(2);
					expect(obj.z).toBe(obj);
					expect(obj).toHaveDescriptorModifiersFor('x', true, true, true);
					expect(obj).toHaveDescriptorModifiersFor('y', true, true, true);
					expect(obj).toHaveDescriptorModifiersFor('z', false, true, false);
				}
			);
		});
	});

	describe('where prototype has getter/setter for own prop', () => {
		describe('getter', () => {
			it('non-circular', () => {
				function F() {}
				Object.defineProperty(F.prototype, 'x', {get() { return 1; }});
				const input = new F();
				Object.defineProperty(input, 'x', {value: 2});

				expectSerializedEqual(
					input,
					'(()=>{const a=Object,b=function F(){}.prototype;a.defineProperties(b,{x:{get(){return 1}}});return a.create(b,{x:{value:2}})})()',
					(obj) => {
						const ctor = Object.getPrototypeOf(obj).constructor;
						expect(ctor).toBeFunction();
						expect(ctor).not.toBe(Object);
						expect(ctor.name).toBe('F');
						expect(obj).toHaveOwnPropertyNames(['x']);
						expect(obj.x).toBe(2);
					}
				);
			});

			it('circular', () => {
				function F() {}
				Object.defineProperty(F.prototype, 'x', {get() { return 1; }});
				const input = new F();
				Object.defineProperty(input, 'x', {value: input});

				expectSerializedEqual(
					input,
					'(()=>{const a=Object,b=function F(){}.prototype,c=a.defineProperties,d=a.create(b);c(b,{x:{get(){return 1}}});c(d,{x:{value:d}});return d})()',
					(obj) => {
						const ctor = Object.getPrototypeOf(obj).constructor;
						expect(ctor).toBeFunction();
						expect(ctor).not.toBe(Object);
						expect(ctor.name).toBe('F');
						expect(obj).toHaveOwnPropertyNames(['x']);
						expect(obj.x).toBe(obj);
					}
				);
			});
		});
	});

	describe('setter', () => {
		it('non-circular', () => {
			function F() {}
			Object.defineProperty(F.prototype, 'x', {set(v) {}}); // eslint-disable-line no-unused-vars
			const input = new F();
			Object.defineProperty(input, 'x', {value: 2});

			expectSerializedEqual(
				input,
				'(()=>{const a=Object,b=function F(){}.prototype;a.defineProperties(b,{x:{set(a){}}});return a.create(b,{x:{value:2}})})()',
				(obj) => {
					const ctor = Object.getPrototypeOf(obj).constructor;
					expect(ctor).toBeFunction();
					expect(ctor).not.toBe(Object);
					expect(ctor.name).toBe('F');
					expect(obj).toHaveOwnPropertyNames(['x']);
					expect(obj.x).toBe(2);
					expect(obj).toHaveDescriptorModifiersFor('x', false, false, false);
				}
			);
		});

		it('circular', () => {
			function F() {}
			Object.defineProperty(F.prototype, 'x', {set(v) {}}); // eslint-disable-line no-unused-vars
			const input = new F();
			Object.defineProperty(input, 'x', {value: input});

			expectSerializedEqual(
				input,
				'(()=>{const a=Object,b=function F(){}.prototype,c=a.defineProperties,d=a.create(b);c(b,{x:{set(a){}}});c(d,{x:{value:d}});return d})()',
				(obj) => {
					const ctor = Object.getPrototypeOf(obj).constructor;
					expect(ctor).toBeFunction();
					expect(ctor).not.toBe(Object);
					expect(ctor.name).toBe('F');
					expect(obj).toHaveOwnPropertyNames(['x']);
					expect(obj.x).toBe(obj);
					expect(obj).toHaveDescriptorModifiersFor('x', false, false, false);
				}
			);
		});
	});
});
