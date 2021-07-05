/* --------------------
 * livepack module
 * Serialize other built-ins
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency} = require('./records.js'),
	{URLContextSymbol, URLQuerySymbol} = require('../shared/globals.js'),
	{firstMapKey} = require('./utils.js');

// Exports

const regexSourceGetter = Object.getOwnPropertyDescriptors(RegExp.prototype).source.get,
	regexFlagsGetter = Object.getOwnPropertyDescriptors(RegExp.prototype).flags.get,
	dateGetTime = Date.prototype.getTime,
	URLToString = URL.prototype.toString,
	URLSearchParamsToString = URLSearchParams.prototype.toString;

module.exports = {
	/**
	 * Trace RegExp.
	 * RegExp source string is recorded as `record.extra.regex`.
	 * RegExp flags string is recorded as `record.extra.flags`.
	 * @param {RegExp} regex - RegExp object
	 * @param {Object} record - Record
	 * @returns {Function} - Serializer function
	 */
	traceRegex(regex, record) {
		this.traceProperties(
			regex, record, RegExp.prototype,
			[{
				key: 'lastIndex',
				val: 0,
				get: undefined,
				set: undefined,
				writable: true,
				enumerable: false,
				configurable: false
			}]
		);
		record.extra = {regex: regexSourceGetter.call(regex), flags: regexFlagsGetter.call(regex)};
		return this.serializeRegex;
	},

	/**
	 * Serialize RegExp.
	 * @param {Object} record - Record
	 * @param {Object} record.extra - Extra props object
	 * @param {string} record.extra.regex - Regex source string
	 * @param {string} record.extra.flags - Flags
	 * @returns {Object} - AST node
	 */
	serializeRegex(record) {
		const {extra} = record;
		const node = t.regExpLiteral(extra.regex, extra.flags);
		return this.wrapWithProperties(record, record.props, node);
	},

	/**
	 * Trace Date.
	 * Time (`date.getTime()`) is recorded as `record.extra.time`.
	 * @param {Date} date - Date object
	 * @param {Object} record - Record
	 * @returns {Function} - Serializer function
	 */
	traceDate(date, record) {
		const dateCtorRecord = this.traceValue(Date);
		createDependency(record, dateCtorRecord);

		this.traceProperties(date, record, Date.prototype);
		record.extra = {time: dateGetTime.call(date)};
		return this.serializeDate;
	},

	/**
	 * Serialize Date.
	 * `Date` constructor will be 1st dependency.
	 * @param {Object} record - Record
	 * @param {Object} record.extra - Extra props object
	 * @param {number} record.extra.time - Time (from `date.getTime()`)
	 * @returns {Object} - AST node
	 */
	serializeDate(record) {
		// `new Date(...)`
		const dateCtorNode = this.serializeValue(firstMapKey(record.dependencies));
		const node = t.newExpression(dateCtorNode, [t.numericLiteral(record.extra.time)]);
		return this.wrapWithProperties(record, record.props, node);
	},

	/**
	 * Trace URL.
	 * URL string (`url.toString()`) is recorded as `record.extra.url`.
	 * @param {URL} url - URL object
	 * @param {Object} record - Record
	 * @returns {Function} - Serializer function
	 */
	traceURL(url, record) {
		const urlCtorRecord = this.traceValue(URL);
		createDependency(record, urlCtorRecord);

		this.traceProperties(url, record, URL.prototype, undefined, urlShouldSkipKey);
		record.extra = {url: URLToString.call(url)};
		return this.serializeURL;
	},

	/**
	 * Serialize URL.
	 * `URL` constructor will be 1st dependency.
	 * @param {Object} record - Record
	 * @param {Object} record.extra - Extra props object
	 * @param {string} record.extra.url - URL string (from `url.toString()`)
	 * @returns {Object} - AST node
	 */
	serializeURL(record) {
		// `new URL(...)`
		const urlCtorNode = this.serializeValue(firstMapKey(record.dependencies));
		const node = t.newExpression(urlCtorNode, [t.stringLiteral(record.extra.url)]);
		return this.wrapWithProperties(record, record.props, node);
	},

	/**
	 * Trace URLSearchParams.
	 * If can be derived from a URL:
	 *   - uses `serializeURLSearchParamsDerivedFromURL()` as serializer
	 * Otherwise:
	 *   - uses `serializeURLSearchParams()` as serializer
	 *   - records param string (`params.toString()`) as `record.extra.params`
	 *
	 * @param {URLSearchParams} params - URLSearchParams object
	 * @param {Object} record - Record
	 * @returns {Function} - Serializer function
	 */
	traceURLSearchParams(params, record) {
		const url = params[URLContextSymbol];
		if (url) {
			// Has URL context - `new URL(...).searchParams`
			const urlRecord = this.traceValue(url, 'url', '[Symbol(URLContext)]');
			createDependency(record, urlRecord);

			this.traceProperties(params, record, URLSearchParams.prototype, undefined, urlShouldSkipKey);
			return this.serializeURLSearchParamsDerivedFromURL;
		}

		// Has no context - `new URLSearchParams(...)`
		const urlSearchParamsCtorRecord = this.traceValue(URLSearchParams);
		createDependency(record, urlSearchParamsCtorRecord);

		this.traceProperties(params, record, URLSearchParams.prototype, undefined, urlShouldSkipKey);
		record.extra = {params: URLSearchParamsToString.call(params)};
		return this.serializeURLSearchParams;
	},

	/**
	 * Serialize URLSearchParams.
	 * `URLSearchParams` constructor will be 1st dependency.
	 * @param {Object} record - Record
	 * @param {Object} record.extra - Extra props object
	 * @param {string} record.extra.params - Params string (from `params.toString()`)
	 * @returns {Object} - AST node
	 */
	serializeURLSearchParams(record) {
		// `new URLSearchParams(...)`
		const urlSearchParamsCtorNode = this.serializeValue(firstMapKey(record.dependencies));
		const node = t.newExpression(urlSearchParamsCtorNode, [t.stringLiteral(record.extra.params)]);
		return this.wrapWithProperties(record, record.props, node);
	},

	/**
	 * Serialize URLSearchParams derived from URL.
	 * URL it's derived from will be 1st dependency.
	 * @param {Object} record - Record
	 * @returns {Object} - AST node
	 */
	serializeURLSearchParamsDerivedFromURL(record) {
		// `new URL(...).searchParams`
		const urlNode = this.serializeValue(firstMapKey(record.dependencies));
		const node = t.memberExpression(urlNode, t.identifier('searchParams'));
		return this.wrapWithProperties(record, record.props, node);
	},

	traceWeakRef(weakRef, record) { // eslint-disable-line no-unused-vars
		// TODO
		throw new Error('Cannot serialize WeakRefs');
	},

	traceFinalizationRegistry(registry, record) { // eslint-disable-line no-unused-vars
		// TODO
		throw new Error('Cannot serialize FinalizationRegistrys');
	}
};

function urlShouldSkipKey(key) {
	return key === URLContextSymbol || key === URLQuerySymbol;
}
