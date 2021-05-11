/* --------------------
 * livepack module
 * `defineProps()` runtime function
 * ------------------*/

'use strict';

// Imports
const isNumber = require('./isNumber.js');

// Exports

/**
 * Define properties on object or create new object.
 *
 * Function can:
 * 1. Add properties to an existing object
 * 2. Create a new object with provided prototype with provided properties
 *
 * If only `props` is provided, a new Object is created.
 *
 * Properties can be defined with `writable`, `enumerable`, `configurable` set as required.
 * A 3-bit bitmap is used for this to shorten definition.
 * Properties can be defined as getter/setter pair.
 * Special case for defining a property called `__proto__` (flagged by 4th bit of bitmap).
 *
 * USAGE
 * -----
 * Shortcut form with all descriptors `true`
 * `defineProps( obj, { x: 123, y: 456 } )`
 *
 * Shortcut form with undefined values
 * `defineProps( obj, { x: undefined, y: undefined } )`
 *
 * Long form with `writable`, `enumerable`, `configurable` all `false` - 2nd array item is bitmap
 * `defineProps( obj, { x: [ 123, 7 ], y: [ 456, 7 ] } )`
 *
 * Long form with undefined values + `writable`, `enumerable`, `configurable` all `false`
 * `defineProps( obj, { x: [ , 7 ], y: [ , 7 ] } )`
 *
 * Array value - Disambiguated by wrapping value in another array
 * `defineProps( obj, { x: [ [ 1, 2, 3 ] ] } )`
 *
 * Getter/setter - Disambiguated by 2nd array item being non-integer
 * `defineProps( obj, { x: [ function getter() {}, function setter() {} ] } )`
 *
 * Getter/setter with `writable`, `enumerable`, `configurable` all `false` - 3rd array item is bitmap
 * `defineProps( obj, { x: [ function getter() {}, function setter() {}, 7 ] } )`
 *
 * Getter only - Disambiguated by 2nd array item not being number
 * `defineProps( obj, { x: [ function getter() {}, , ] } )`
 *
 * Setter only - Disambiguated by 2nd array item not being number
 * `defineProps( obj, { x: [ , function setter() {} ] } )`
 *
 * Remove getter only - Disambiguated by 2nd array item not being number
 * `defineProps( obj, { x: [ undefined, , ] } )`
 *
 * Remove setter only - Disambiguated by 2nd array item not being number
 * `defineProps( obj, { x: [ , undefined ] } )`
 *
 * Remove getter and setter - Disambiguated by 2nd array item not being number
 * `defineProps( obj, { x: [ , , ] } )`
 *
 * Leave value/getter/setter as is, but set `writable`, `enumerable`, `configurable` all `false`
 * Disambiguated by 1st array item being number (setting value to `7` would use shortcut form).
 * `defineProps( obj, { x: [ 7 ] } )`
 *
 * Property name is '__proto__' - Signalled by 4th bit of bitmap
 * `defineProps( obj, { a: [ 'proto', 8 ] } )`
 *
 * Use empty object as base (only 1 arg)
 * `defineProps( { x: [ 1, 7 ] } )`
 *
 * @param {Object} [obj] - Object to have properties added (new object created if not provided)
 * @param {Object} props - Property definitions
 * @returns {Object} - Input object
 */
module.exports = (obj, props) => {
	// 1 arg only means base is empty object
	if (!props) {
		props = obj;
		obj = {};
	}

	// Define properties
	Object.getOwnPropertyNames(props)
		.concat(Object.getOwnPropertySymbols(props))
		.forEach((propName) => {
			const definition = props[propName],
				descriptor = {};
			let bitmap;
			if (Array.isArray(definition)) {
				// Full definition provided e.g. `defineProps( obj, {x: [1, 7]} )`
				const definitionLength = definition.length,
					definitionLengthIs3 = definitionLength === 3;
				if (definitionLengthIs3 || (definitionLength === 2 && isNumber(definition[1]))) {
					// Getter + setter
					const hasGetter = 0 in definition,
						hasSetter = 1 in definition;
					if (hasGetter || !hasSetter) descriptor.get = definition[0];
					if (hasSetter || !hasGetter) descriptor.set = definition[1];
					if (definitionLengthIs3) bitmap = definition[2];
				} else if (definitionLength === 1 && isNumber(definition[0])) {
					// Leave value, getter and setter as is, just set descriptor
					bitmap = definition[0];
				} else {
					// Set value
					descriptor.value = definition[0];
					if (definitionLength === 2) bitmap = definition[1];
				}
			} else {
				// Shortcut notation e.g. `defineProps(obj, {x: 1})`
				descriptor.value = definition;
			}

			// Set `writable`, `enumerable`, `configurable`
			if (!bitmap) bitmap = 0;
			if ('value' in descriptor) descriptor.writable = !(bitmap & 1); // eslint-disable-line no-bitwise
			descriptor.enumerable = !(bitmap & 2); // eslint-disable-line no-bitwise
			descriptor.configurable = !(bitmap & 4); // eslint-disable-line no-bitwise

			// If 4th bit of bitmap set, property name is '__proto__'
			if (bitmap & 8) propName = '__proto__'; // eslint-disable-line no-bitwise

			Object.defineProperty(obj, propName, descriptor);
		});

	// Return object for chaining
	return obj;
};
