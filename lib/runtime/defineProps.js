/* --------------------
 * livepack module
 * `defineProps()` runtime function
 * ------------------*/

'use strict';

// Exports

const {Object} = global, // Moving `Object` into scope makes function more minifyable
	objectCreate = Object.create;

/**
 * Define properties on object or create new object.
 *
 * Function can:
 * 1. Add properties to an existing object
 * 2. Set prototype of an existing object
 * 3. Create a new object with provided prototype + (optionally) provided properties
 * 4. Create a new object with null prototype + (optionally) provided properties
 *
 * Properties can be defined with `writable`, `enumerable`, `configurable` set as required.
 * A 3-bit bitmap is used for this to shorten definition.
 * Properties can be defined as getter/setter pair.
 * Special case for defining a property called `__proto__` (flagged by 4th bit of bitmap).
 *
 * Can be called with a number of different sets of arguments.
 * Designed so all above cases can be covered with minimum length of code in the function calls.
 *
 * DEFINING PROPERTIES ON EXISTING OBJECT
 * --------------------------------------
 * Shortcut form with all descriptors `true`
 * `defineProps( obj, { x: 123, y: 456 } )`
 *
 * Long form with `writable`, `enumerable`, `configurable` all `false` - 2nd array item is bitmap
 * `defineProps( obj, { x: [ 123, 7 ], y: [ 456, 7 ] } )`
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
 * Property name is '__proto__' - Signalled by 4th bit of bitmap
 * `defineProps( obj, { a: [ 'proto', 8 ] } )`
 *
 * SET PROTOTYPE OF EXISTING OBJECT
 * --------------------------------
 * 3 args where 1st arg is Object = set prototype as 3rd arg, and props from 2nd arg:
 *
 * Set prototype to `Klass.prototype`
 * `defineProps( obj, 0, Klass.prototype )`
 *
 * Set prototype to `Klass.prototype` + define props
 * `defineProps( obj, { x: 123, y: 456 }, Klass.prototype )`
 *
 * 1st arg with value `2` = set prototype to null:
 *
 * Set prototype to `null`
 * `defineProps( 2, obj )`
 *
 * Set prototype to `null` + define props
 * `defineProps( 2, obj, { x: 123, y: 456 } )`
 *
 * CREATE OBJECT WITH PROTOTYPE
 * ----------------------------
 * 1st arg with value `1` = create new Object with 2nd arg as prototype and 3rd arg as object props:
 *
 * Object with prototype `Klass.prototype` with no properties
 * `defineProps( 1, Klass.prototype )`
 *
 * Object with prototype `Klass.prototype` with properties
 * `defineProps( 1, Klass.prototype, { x: 123, y: 456 } )`
 *
 * Only 0 or 1 args = create Object with null prototype, using 1st arg as object props:
 *
 * Null prototype object with no properties
 * `defineProps()`
 *
 * Null prototype object with properties
 * `defineProps( { x: 123, y: 456 } )`
 *
 * @param {*} obj
 * @param {*} props
 * @param {*} proto
 * @returns {Object}
 */
module.exports = function(obj, props, proto) {
	let setProto = false;
	if (obj === 1) {
		// Create object with prototype
		// Args = 1, proto, props
		obj = objectCreate(props);
		props = proto;
	} else if (obj === 2) {
		// Set prototype to null
		// Args = 2, obj, props
		obj = props;
		props = proto;
		proto = null;
		setProto = true;
	} else {
		const numArgs = arguments.length;
		if (numArgs < 2) {
			// Create object with null prototype
			// Args = props (or no args at all = no props)
			props = obj;
			obj = objectCreate(null);
		} else if (numArgs === 3) {
			// Set prototype to provided value
			// Args = object, props, proto
			setProto = true;
		}
	}

	// Define properties
	if (props) {
		const propNames = Object.getOwnPropertyNames(props).concat(Object.getOwnPropertySymbols(props));
		propNames.forEach((propName) => {
			const def = props[propName],
				descriptor = {};
			let bitmap;
			if (Array.isArray(def)) {
				// Full definition provided e.g. `defineProps( obj, {x: [1, 7]} )`
				const defLen = def.length;
				if (defLen === 3 || (defLen === 2 && typeof def[1] !== 'number')) {
					// Getter + setter
					descriptor.get = def[0];
					descriptor.set = def[1];
					bitmap = def[2];
				} else {
					// Value
					descriptor.value = def[0];
					bitmap = def[1];
				}
			} else {
				// Shortcut notation e.g. `defineProps(obj, {x: 1})`
				descriptor.value = def;
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
	}

	// Set prototype
	if (setProto) Object.setPrototypeOf(obj, proto);

	// Return object for chaining
	return obj;
};
