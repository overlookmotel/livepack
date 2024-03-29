/* --------------------
 * livepack module
 * Serialize other built-ins
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency} = require('./records.js'),
	{URLContextSymbol, URLQuerySymbol} = require('../shared/globals.js');

// Exports

const regexSourceGetter = Object.getOwnPropertyDescriptors(RegExp.prototype).source.get,
	regexFlagsGetter = Object.getOwnPropertyDescriptors(RegExp.prototype).flags.get,
	dateGetTime = Date.prototype.getTime,
	URLToString = URL.prototype.toString,
	URLSearchParamsToString = URLSearchParams.prototype.toString;

const urlShouldSkipKey = URLContextSymbol
	? key => key === URLContextSymbol || key === URLQuerySymbol
	: undefined;

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

		let timeNodes;
		const time = dateGetTime.call(date);
		if (Number.isNaN(time)) {
			// Invalid date - `new Date(NaN)`
			const nanRecord = this.serializeValue(NaN);
			timeNodes = [nanRecord.varNode];
			createDependency(record, nanRecord, timeNodes, 0);
		} else {
			timeNodes = [t.numericLiteral(time)];
		}

		const node = t.newExpression(dateCtorRecord.varNode, timeNodes);
		createDependency(record, dateCtorRecord, node, 'callee');
		return this.wrapWithProperties(date, record, node, Date.prototype);
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
		// `url[Symbol('context')]` property was removed in NodeJS v20.0.0
		const context = URLContextSymbol ? params[URLContextSymbol] : null;
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
			const urlRecord = this.serializeValue(context, 'url', '[Symbol(URLContext)]');
			node = t.memberExpression(urlRecord.varNode, t.identifier('searchParams'));
			createDependency(record, urlRecord, node, 'object');
		}

		return this.wrapWithProperties(
			params, record, node, URLSearchParams.prototype, undefined, urlShouldSkipKey
		);
	},

	serializeWeakRef() {
		throw new Error('Cannot serialize WeakRefs');
	},

	serializeFinalizationRegistry() {
		throw new Error('Cannot serialize FinalizationRegistrys');
	}
};
