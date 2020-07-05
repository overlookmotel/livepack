/* --------------------
 * livepack module
 * Serialize other built-ins
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Exports

module.exports = {
	serializeRegex(regex, record) {
		const node = t.regExpLiteral(regex.source, regex.flags);
		return this.wrapWithProperties(
			regex, record, node, key => key === 'lastIndex' && regex.lastIndex === 0
		);
	},

	serializeDate(date, record) {
		const node = t.newExpression(t.identifier('Date'), [t.numericLiteral(date.getTime())]);
		return this.wrapWithProperties(date, record, node);
	},

	serializeBuffer(buf, record) {
		// `Buffer.from('...', 'base64')`
		const node = t.callExpression(
			t.memberExpression(t.identifier('Buffer'), t.identifier('from')),
			[
				t.stringLiteral(buf.toString('base64')),
				t.stringLiteral('base64')
			]
		);
		return this.wrapWithProperties(buf, record, node, bufferShouldSkipKey);
	}
};

function bufferShouldSkipKey(key) {
	return key === '0' || key.match(/^[1-9]\d*$/);
}
