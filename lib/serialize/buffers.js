/* --------------------
 * livepack module
 * Serialize buffers
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types'),
	{isNumber} = require('is-it-type');

// Imports
const {
	BUFFER_TYPE, TYPED_ARRAY_TYPE, ARRAY_BUFFER_TYPE, SHARED_ARRAY_BUFFER_TYPE, registerSerializer
} = require('./types.js');

// Exports

const bufferToString = Buffer.prototype.toString,
	TypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype),
	typedArrayBufferGetter = Object.getOwnPropertyDescriptor(TypedArrayPrototype, 'buffer').get,
	typedArrayLengthGetter = Object.getOwnPropertyDescriptor(TypedArrayPrototype, 'byteLength').get,
	typedArrayOffsetGetter = Object.getOwnPropertyDescriptor(TypedArrayPrototype, 'byteOffset').get;

module.exports = {
	/**
	 * Trace Buffer or TypedArray.
	 * @param {Object} buf - TypedArray object
	 * @param {string} type - Type e.g. 'Uint8Array'
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceBuffer(buf, type, record) {
		const bytes = typedArrayBufferGetter.call(buf),
			offset = typedArrayOffsetGetter.call(buf),
			len = typedArrayLengthGetter.call(buf);

		// Despite being writable and configurable, integer-keyed properties cannot be redefined
		// and no further integer-keyed properties can be added. So can skip them.
		// TODO: This is true for NodeJS `Buffer` objects. Check also true for `TypedArray`s.
		this.traceProperties(buf, record, isNumber);

		if (type === 'Uint8Array' && buf instanceof Buffer) {
			record.extra = {bytes, offset, len};
			return BUFFER_TYPE;
		}

		record.extra = {type, bytes, offset, len};
		return TYPED_ARRAY_TYPE;
	},

	/**
	 * Trace ArrayBuffer.
	 * @param {ArrayBuffer} buf - ArrayBuffer
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceArrayBuffer(buf, record) {
		this.traceProperties(buf, record, undefined);
		record.extra = {buf};
		return ARRAY_BUFFER_TYPE;
	},

	/**
	 * Trace SharedArrayBuffer.
	 * @param {SharedArrayBuffer} buf - SharedArrayBuffer
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceSharedArrayBuffer(buf, record) {
		this.traceProperties(buf, record, undefined);
		record.extra = {buf};
		return SHARED_ARRAY_BUFFER_TYPE;
	}
};

/**
 * Serialize NodeJS Buffer.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {ArrayBuffer} record.extra.bytes - ArrayBuffer
 * @param {number} record.extra.offset - Offset of start of data in `bytes`
 * @param {number} record.extra.len - Length of buffer in bytes
 * @returns {Object} - AST node
 */
function serializeBuffer(record) {
	const buf = Buffer.from(record.extra.bytes, record.extra.offset, record.extra.len),
		base64Str = bufferToString.call(buf, 'base64');

	const node = t.callExpression(
		this.traceAndSerializeGlobal(Buffer.from),
		[t.stringLiteral(base64Str), t.stringLiteral('base64')]
	);

	return this.wrapWithProperties(node, record, this.bufferPrototypeRecord, null);
}
registerSerializer(BUFFER_TYPE, serializeBuffer);

/**
 * Serialize TypedArray.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {ArrayBuffer} record.extra.bytes - ArrayBuffer
 * @param {number} record.extra.offset - Offset of start of data in `bytes`
 * @param {number} record.extra.len - Length of buffer in bytes
 * @returns {Object} - AST node
 */
function serializeTypedArray(record) {
	const {extra} = record,
		ctor = global[extra.type];

	// eslint-disable-next-line new-cap
	const buf = new ctor(extra.bytes, extra.offset, extra.len / ctor.BYTES_PER_ELEMENT);

	const valNodes = [],
		len = buf.length;
	let allZero = true;
	for (let index = 0; index < len; index++) {
		const val = buf[index];
		if (val === 0) {
			valNodes.push(null);
		} else {
			valNodes.push(t.numericLiteral(val));
			allZero = false;
		}
	}

	let node;
	const ctorNode = this.traceAndSerializeGlobal(ctor);
	if (allZero) {
		// `new Uint16Array(4)`
		node = t.newExpression(ctorNode, len > 0 ? [t.numericLiteral(len)] : []);
	} else {
		// `new Uint16Array([...])`
		node = t.newExpression(ctorNode, [t.arrayExpression(valNodes)]);
	}

	const ctorPrototypeRecord = this.traceValue(ctor.prototype, null, null);
	return this.wrapWithProperties(node, record, ctorPrototypeRecord, null);
}
registerSerializer(TYPED_ARRAY_TYPE, serializeTypedArray);

/**
 * Serialize ArrayBuffer.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {ArrayBuffer} record.extra.buf - ArrayBuffer
 * @returns {Object} - AST node
 */
function serializeArrayBuffer(record) {
	const uint = new Uint8Array(record.extra.buf);

	const valNodes = [],
		len = uint.length;
	let allZero = true;
	for (let index = 0; index < len; index++) {
		const val = uint[index];
		if (val === 0) {
			valNodes.push(null);
		} else {
			valNodes.push(t.numericLiteral(val));
			allZero = false;
		}
	}

	let node;
	if (allZero) {
		// `new ArrayBuffer(8)`
		node = t.newExpression(
			this.traceAndSerializeGlobal(ArrayBuffer),
			len > 0 ? [t.numericLiteral(len)] : []
		);
	} else {
		// `new Uint8Array(...).buffer`
		node = t.memberExpression(
			t.newExpression(this.traceAndSerializeGlobal(Uint8Array), [t.arrayExpression(valNodes)]),
			t.identifier('buffer')
		);
	}

	return this.wrapWithProperties(node, record, this.arrayBufferPrototypeRecord, null);
}
registerSerializer(ARRAY_BUFFER_TYPE, serializeArrayBuffer);

/**
 * Serialize SharedArrayBuffer.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {ArrayBuffer} record.extra.buf - ArrayBuffer
 * @returns {Object} - AST node
 */
function serializeSharedArrayBuffer(record) {
	const uint = new Uint8Array(record.extra.buf);

	// `new SharedArrayBuffer(8)`
	const len = uint.length;
	const node = t.newExpression(
		this.traceAndSerializeGlobal(SharedArrayBuffer),
		len > 0 ? [t.numericLiteral(len)] : []
	);

	// Set non-zero values (if any)
	const firstNonZeroIndex = uint.findIndex(byte => byte !== 0);
	if (firstNonZeroIndex !== -1) {
		const valNodes = [];
		let numTrailingZeros = 0;
		for (let index = firstNonZeroIndex; index < len; index++) {
			const val = uint[index];
			if (val === 0) {
				valNodes.push(null);
				numTrailingZeros++;
			} else {
				valNodes.push(t.numericLiteral(val));
				numTrailingZeros = 0;
			}
		}

		if (numTrailingZeros > 0) valNodes.length -= numTrailingZeros;

		// `new Uint8Array(arr).set([1, 2, 3]);`
		this.assignmentNodes.push(
			t.expressionStatement(
				t.callExpression(
					t.memberExpression(
						t.newExpression(this.traceAndSerializeGlobal(Uint8Array), [record.varNode]),
						t.identifier('set')
					),
					[
						t.arrayExpression(valNodes),
						...(firstNonZeroIndex > 0 ? [t.numericLiteral(firstNonZeroIndex)] : [])
					]
				)
			)
		);

		record.usageCount++;
	}

	return this.wrapWithProperties(node, record, this.sharedArrayBufferPrototypeRecord, null);
}
registerSerializer(SHARED_ARRAY_BUFFER_TYPE, serializeSharedArrayBuffer);
