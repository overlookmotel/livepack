/* --------------------
 * livepack module
 * Type constants
 * ------------------*/

'use strict';

// Exports

/* eslint-disable no-bitwise */
const NO_TYPE = 0,
	PRIMITIVE_TYPE = 8,
	STRING_TYPE = PRIMITIVE_TYPE | 0,
	BOOLEAN_TYPE = PRIMITIVE_TYPE | 1,
	NUMBER_TYPE = PRIMITIVE_TYPE | 2,
	BIGINT_TYPE = PRIMITIVE_TYPE | 3,
	NULL_TYPE = PRIMITIVE_TYPE | 4,
	UNDEFINED_TYPE = PRIMITIVE_TYPE | 5,
	NEGATIVE_TYPE = PRIMITIVE_TYPE | 6, // TODO: Should this be a primitive?
	FUNCTION_TYPE = 16,
	METHOD_TYPE = FUNCTION_TYPE | 1,
	GLOBAL_TYPE = 32;
/* eslint-enable no-bitwise */

const SERIALIZERS = [];

module.exports = {
	NO_TYPE,
	PRIMITIVE_TYPE,
	STRING_TYPE,
	BOOLEAN_TYPE,
	NUMBER_TYPE,
	BIGINT_TYPE,
	NULL_TYPE,
	UNDEFINED_TYPE,
	NEGATIVE_TYPE,
	FUNCTION_TYPE,
	METHOD_TYPE,
	GLOBAL_TYPE,
	SERIALIZERS,
	registerSerializer
};

function registerSerializer(type, serializer) {
	while (SERIALIZERS.length < type - 1) SERIALIZERS.push(undefined);
	SERIALIZERS[type] = serializer;
}
