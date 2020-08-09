/* --------------------
 * livepack module
 * Serialize other built-ins
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency} = require('./records.js');

// Exports

const regexSourceGetter = Object.getOwnPropertyDescriptors(RegExp.prototype).source.get,
	regexFlagsGetter = Object.getOwnPropertyDescriptors(RegExp.prototype).flags.get,
	dateGetTime = Date.prototype.getTime,
	bufferToString = Buffer.prototype.toString;

module.exports = {
	serializeRegex(regex, record) {
		const node = t.regExpLiteral(regexSourceGetter.call(regex), regexFlagsGetter.call(regex));
		return this.wrapWithProperties(
			regex, record, node, RegExp.prototype,
			[{name: 'lastIndex', value: 0, writable: true, enumerable: false, configurable: false}]
		);
	},

	serializeDate(date, record) {
		// `new Date(...)`
		const dateCtorRecord = this.serializeValue(Date);
		const node = t.newExpression(dateCtorRecord.varNode, [t.numericLiteral(dateGetTime.call(date))]);
		createDependency(record, dateCtorRecord, node, 'callee');
		return this.wrapWithProperties(date, record, node, Date.prototype);
	},

	serializeBuffer(buf, record) {
		// `Buffer.from('...', 'base64')`
		const bufferFromRecord = this.serializeValue(Buffer.from);
		const node = t.callExpression(
			bufferFromRecord.varNode,
			[
				t.stringLiteral(bufferToString.call(buf, 'base64')),
				t.stringLiteral('base64')
			]
		);
		createDependency(record, bufferFromRecord, node, 'callee');
		// TODO Deal with non-standard descriptors on elements
		return this.wrapWithProperties(buf, record, node, Buffer.prototype, undefined, bufferShouldSkipKey);
	}
};

function bufferShouldSkipKey(key) {
	return key === '0' || key.match(/^[1-9]\d*$/);
}
