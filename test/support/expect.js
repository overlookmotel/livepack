/* --------------------
 * livepack
 * Tests `expect` extensions
 * ------------------*/

'use strict';

// Modules
const {printReceived, printExpected} = require('jest-matcher-utils');

// Extend `expect`

expect.extend({
	toHavePrototype(received, expectedProto) {
		const proto = received != null ? Object.getPrototypeOf(received) : undefined;
		const pass = proto === expectedProto;

		return {
			message: () => `expected ${printReceived(received)}${pass ? ' not' : ''} to have prototype ${printExpected(expectedProto)} but has ${printReceived(proto)}`,
			pass
		};
	},

	toHaveOwnPropertyNames(received, expectedKeys) {
		const keys = Object.getOwnPropertyNames(received);
		const pass = keys.length === expectedKeys.length
			&& !keys.find((key, index) => key !== expectedKeys[index]);

		return {
			message: () => `expected ${printReceived(received)}${pass ? ' not' : ''} to have keys ${printExpected(expectedKeys)} but has ${printReceived(keys)}`,
			pass
		};
	},

	toHaveDescriptorFor(received, key) {
		const pass = !!Object.getOwnPropertyDescriptor(received, key);

		return {
			message: () => `expected ${printReceived(received)}.${printReceived(key)}${pass ? ' not' : ''} to have a property descriptor`,
			pass
		};
	},

	toHaveDescriptorModifiersFor(received, key, writable, enumerable, configurable) {
		const descriptor = Object.getOwnPropertyDescriptor(received, key);
		const pass = !!descriptor
			&& descriptor.writable === writable
			&& descriptor.enumerable === enumerable
			&& descriptor.configurable === configurable;

		return {
			message: () => `expected ${printReceived(received)}.${printReceived(key)}${pass ? ' not' : ''} to have descriptor modifiers ${printExpected({writable, enumerable, configurable})} but has ${printReceived(descriptor ? {writable: descriptor.writable, enumerable: descriptor.enumerable, configurable: descriptor.configurable} : descriptor)}`,
			pass
		};
	}
});
