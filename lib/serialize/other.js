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
	}
};
