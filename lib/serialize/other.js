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

module.exports = {
	serializeRegex(regex, record) {
		const node = t.regExpLiteral(regex.source, regex.flags);
		return this.wrapWithProperties(
			regex, record, node, key => key === 'lastIndex' && regex.lastIndex === 0
		);
	},

	serializeDate(date, record) {
		// `new Date(...)`
		const dateCtorRecord = this.serializeValue(Date);
		const node = t.newExpression(dateCtorRecord.varNode, [t.numericLiteral(date.getTime())]);
		createDependency(record, dateCtorRecord, node, 'callee');
		return this.wrapWithProperties(date, record, node);
	},

	serializeBuffer(buf, record) {
		// `Buffer.from('...', 'base64')`
		const bufferFromRecord = this.serializeValue(Buffer.from);
		const node = t.callExpression(
			bufferFromRecord.varNode,
			[
				t.stringLiteral(buf.toString('base64')),
				t.stringLiteral('base64')
			]
		);
		createDependency(record, bufferFromRecord, node, 'callee');
		return this.wrapWithProperties(buf, record, node, bufferShouldSkipKey);
	}
};

function bufferShouldSkipKey(key) {
	return key === '0' || key.match(/^[1-9]\d*$/);
}
