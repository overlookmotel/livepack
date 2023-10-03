/* --------------------
 * livepack module
 * Serialize buffers
 * ------------------*/

/* eslint-disable no-bitwise */

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency, createAssignment} = require('./records.js'),
	{isNumberKey} = require('./utils.js');

// Exports

const bufferToString = Buffer.prototype.toString,
	TypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype),
	typedArrayBufferGetter = Object.getOwnPropertyDescriptor(TypedArrayPrototype, 'buffer').get,
	typedArrayLengthGetter = Object.getOwnPropertyDescriptor(TypedArrayPrototype, 'byteLength').get,
	typedArrayOffsetGetter = Object.getOwnPropertyDescriptor(TypedArrayPrototype, 'byteOffset').get;

const bitsRegex = /^(Ui|I)nt(\d+)Array$/;

module.exports = {
	serializeBuffer(buf, type, record) {
		// Create node
		let node, defaultProto;
		if (type === 'Uint8Array' && buf instanceof Buffer) {
			// `Buffer.from('...', 'base64')`
			const base64Str = bufferToString.call(buf, 'base64');
			const bufferFromRecord = this.serializeValue(Buffer.from);
			node = t.callExpression(
				bufferFromRecord.varNode,
				[t.stringLiteral(base64Str), t.stringLiteral('base64')]
			);
			createDependency(record, bufferFromRecord, node, 'callee');
			defaultProto = Buffer.prototype;
		} else {
			// `new Uint16Array([...])`
			const match = type.match(bitsRegex),
				isSigned = match[1] === 'I',
				bytesPerChar = match[2] / 8;

			const maxByteValue = 256 ** bytesPerChar,
				signedMaxByteValue = maxByteValue / 2;

			// Convert to Buffer
			const offset = typedArrayOffsetGetter.call(buf),
				len = typedArrayLengthGetter.call(buf);
			const buffer = Buffer.from(typedArrayBufferGetter.call(buf).slice(offset, offset + len));

			const byteNodes = [];
			for (let pos = 0; pos < buffer.length; pos += bytesPerChar) {
				let byte = 0,
					byteMultiplier = 1;
				for (let byteNum = 0; byteNum < bytesPerChar; byteNum++) {
					byte += buffer[pos + byteNum] * byteMultiplier;
					byteMultiplier <<= 8;
				}

				if (isSigned && byte >= signedMaxByteValue) byte -= maxByteValue;

				byteNodes.push(byte === 0 ? null : t.numericLiteral(byte));
			}

			const ctor = global[type],
				ctorRecord = this.serializeValue(ctor);
			node = t.newExpression(ctorRecord.varNode, [t.arrayExpression(byteNodes)]);

			createDependency(record, ctorRecord, node, 'callee');

			defaultProto = ctor.prototype;
		}

		// Wrap in properties.
		// NB: No need to check for non-standard descriptors on elements
		// as buffers are created with all properties non-configurable.
		// All numerical keys can be skipped, even ones above max safe integer key as Buffers
		// only allow writing to numerical keys within bounds of buffer length.
		return this.wrapWithProperties(buf, record, node, defaultProto, undefined, isNumberKey);
	},

	serializeArrayBuffer(buf, record) {
		// If empty, short initialization
		const uint = new Uint8Array(buf);

		let node;
		if (uint.every(byte => byte === 0)) {
			// `new ArrayBuffer(8)`
			const arrayBufferRecord = this.serializeValue(ArrayBuffer);
			node = t.newExpression(arrayBufferRecord.varNode, [t.numericLiteral(uint.length)]);
			createDependency(record, arrayBufferRecord, node, 'callee');
		} else {
			// `new Uint8Array(...).buffer`
			const uintRecord = this.serializeValue(uint, `${record.varNode.name}Buffer`, '<uint>');
			node = t.memberExpression(uintRecord.varNode, t.identifier('buffer'));
			createDependency(record, uintRecord, node, 'object');
		}

		// Wrap in properties
		return this.wrapWithProperties(buf, record, node, ArrayBuffer.prototype);
	},

	serializeSharedArrayBuffer(buf, record) {
		// `new SharedArrayBuffer(8)`
		const uint = new Uint8Array(buf),
			len = uint.length;
		const sharedArrayBufferRecord = this.serializeValue(SharedArrayBuffer);
		const node = t.newExpression(sharedArrayBufferRecord.varNode, [t.numericLiteral(len)]);
		createDependency(record, sharedArrayBufferRecord, node, 'callee');

		const firstNonZeroByte = uint.findIndex(byte => byte !== 0);
		if (firstNonZeroByte !== -1) {
			// Assign values
			// `new Uint8Array(buffer).set([...])`
			const byteNodes = [];
			let numTrailingZeros = 0;
			for (let pos = firstNonZeroByte; pos < len; pos++) {
				const byte = uint[pos];
				if (byte === 0) {
					byteNodes.push(null);
					numTrailingZeros++;
				} else {
					byteNodes.push(t.numericLiteral(byte));
					numTrailingZeros = 0;
				}
			}
			if (numTrailingZeros > 0) byteNodes.length -= numTrailingZeros;

			const uintRecord = this.serializeValue(Uint8Array);
			const assignmentNode = t.callExpression(
				t.memberExpression(
					t.newExpression(uintRecord.varNode, [record.varNode]),
					t.identifier('set')
				),
				[
					t.arrayExpression(byteNodes),
					...(firstNonZeroByte > 0 ? [t.numericLiteral(firstNonZeroByte)] : [])
				]
			);
			const assignment = createAssignment(
				record, assignmentNode, assignmentNode.callee.object.arguments, 0
			);
			createDependency(assignment, uintRecord, assignmentNode.callee.object, 'callee');
		}

		// Wrap in properties
		return this.wrapWithProperties(buf, record, node, SharedArrayBuffer.prototype);
	}
};
