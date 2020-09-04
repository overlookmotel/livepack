/* --------------------
 * livepack module
 * Serialize other built-ins
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency} = require('./records.js'),
	{URLContextSymbol, URLQuerySymbol} = require('../internal.js').urlVars,
	{isNumberKey} = require('./utils.js');

// Exports

const regexSourceGetter = Object.getOwnPropertyDescriptors(RegExp.prototype).source.get,
	regexFlagsGetter = Object.getOwnPropertyDescriptors(RegExp.prototype).flags.get,
	dateGetTime = Date.prototype.getTime,
	bufferToString = Buffer.prototype.toString,
	URLToString = URL.prototype.toString,
	URLSearchParamsToString = URLSearchParams.prototype.toString;

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
		// NB No need to check for non-standard descriptors on elements
		// as buffers are created with all properties non-configurable.
		const bufferFromRecord = this.serializeValue(Buffer.from);
		const node = t.callExpression(
			bufferFromRecord.varNode,
			[
				t.stringLiteral(bufferToString.call(buf, 'base64')),
				t.stringLiteral('base64')
			]
		);
		createDependency(record, bufferFromRecord, node, 'callee');
		return this.wrapWithProperties(buf, record, node, Buffer.prototype, undefined, isNumberKey);
	},

	serializeURL(url, record) {
		// `new URL(...)`
		const urlCtorRecord = this.serializeValue(URL);
		const node = t.newExpression(urlCtorRecord.varNode, [t.stringLiteral(URLToString.call(url))]);
		createDependency(record, urlCtorRecord, node, 'callee');
		return this.wrapWithProperties(url, record, node, URL.prototype, undefined, urlShouldSkipKey);
	},

	serializeURLSearchParams(params, record) {
		let node;
		const context = params[URLContextSymbol];
		if (context === null) {
			// Has no context - `new URLSearchParams(...)`
			const urlSearchParamsCtorRecord = this.serializeValue(URLSearchParams);
			node = t.newExpression(
				urlSearchParamsCtorRecord.varNode,
				[t.stringLiteral(URLSearchParamsToString.call(params))]
			);
			createDependency(record, urlSearchParamsCtorRecord, node, 'callee');
		} else {
			// Has context - `new URL(...).searchParams`
			const urlRecord = this.serializeValue(context, 'url');
			node = t.memberExpression(urlRecord.varNode, t.identifier('searchParams'));
			createDependency(record, urlRecord, node, 'object');
		}

		return this.wrapWithProperties(
			params, record, node, URLSearchParams.prototype, undefined, urlShouldSkipKey
		);
	},

	serializeWeakRef() {
		// TODO
		throw new Error('Cannot serialize WeakRef');
	},

	serializeFinalizationRegistry() {
		// TODO
		throw new Error('Cannot serialize FinalizationRegistry');
	}
};

function urlShouldSkipKey(key) {
	return key === URLContextSymbol || key === URLQuerySymbol;
}
