/* --------------------
 * livepack module
 * Type constants
 * ------------------*/

'use strict';

// Exports

/* eslint-disable no-bitwise */
const NONE = 0,
	PRIMITIVE = 8,
	STRING = PRIMITIVE | 0,
	BOOLEAN = PRIMITIVE | 1,
	NUMBER = PRIMITIVE | 2,
	BIGINT = PRIMITIVE | 3,
	NULL = PRIMITIVE | 4,
	UNDEFINED = PRIMITIVE | 5,
	NEGATIVE = PRIMITIVE | 6, // TODO: Should this be a primitive?
	FUNCTION = 16,
	METHOD = FUNCTION | 1,
	GLOBAL = 32;
/* eslint-enable no-bitwise */

const SERIALIZERS = [];

module.exports = {
	NONE,
	PRIMITIVE,
	STRING,
	BOOLEAN,
	NUMBER,
	BIGINT,
	NULL,
	UNDEFINED,
	NEGATIVE,
	FUNCTION,
	METHOD,
	GLOBAL,
	SERIALIZERS,
	registerSerializer
};

function registerSerializer(type, serializer) {
	while (SERIALIZERS.length < type - 1) SERIALIZERS.push(undefined);
	SERIALIZERS[type] = serializer;
}
