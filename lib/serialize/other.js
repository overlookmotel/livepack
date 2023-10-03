/* --------------------
 * livepack module
 * Serialize other built-ins
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency, deleteDependency} = require('./records.js'),
	{
		REGEXP_TYPE, DATE_TYPE, URL_TYPE, URL_SEARCH_PARAMS_TYPE, registerSerializer
	} = require('./types.js'),
	{URLContextSymbol, URLQuerySymbol} = require('../shared/globals.js');

// Exports

const regexSourceGetter = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source').get,
	regexFlagsGetter = Object.getOwnPropertyDescriptor(RegExp.prototype, 'flags').get,
	dateGetTime = Date.prototype.getTime,
	URLToString = URL.prototype.toString,
	URLSearchParamsGetter = Object.getOwnPropertyDescriptor(URL.prototype, 'searchParams').get,
	URLSearchParamsToString = URLSearchParams.prototype.toString;

const urlShouldSkipKey = URLContextSymbol
	? key => key === URLContextSymbol || key === URLQuerySymbol
	: undefined;

module.exports = {
	/**
	 * Trace RegExp.
	 * RegExp source string is recorded as `record.extra.regex`.
	 * RegExp flags string is recorded as `record.extra.flags`.
	 * @param {RegExp} regexp - RegExp object
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceRegexp(regexp, record) {
		this.traceProperties(regexp, record, undefined);
		record.extra = {regexp: regexSourceGetter.call(regexp), flags: regexFlagsGetter.call(regexp)};
		return REGEXP_TYPE;
	},

	/**
	 * Trace Date.
	 * Time (`date.getTime()`) is recorded as `record.extra.time`.
	 * @param {Date} date - Date object
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceDate(date, record) {
		this.traceProperties(date, record, undefined);
		record.extra = {time: dateGetTime.call(date)};
		return DATE_TYPE;
	},

	/**
	 * Trace URL.
	 * URL string (`url.toString()`) is recorded as `record.extra.url`.
	 * @param {URL} url - URL object
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceURL(url, record) {
		// Record relationship to URL's SearchParams.
		// This ensures `const u = new URL('http://foo.com/?x=1'); return {u, s: u.searchParams}`
		// recognises the URL and its SearchParams as related.
		// Allow `URLSearchParamsGetter.call(url)` to fail as in NodeJS v18, could be a non-URL object
		// which has had prototype set to `URL.prototype`.
		// TODO: This implementation isn't quite right on NodeJS v18 as URL objects have
		// symbol properties which we're ignoring. In NodeJS v20 these properties no longer exist.
		let params;
		try { params = URLSearchParamsGetter.call(url); } catch {} // eslint-disable-line no-empty
		if (params) {
			const paramsRecord = this.traceValue(params, 'searchParams', '.searchParams');
			createDependency(paramsRecord, record);
			paramsRecord.extra.urlRecord = record;
			this.maybeSoloURLSearchParams.push(paramsRecord);
		}

		this.traceProperties(url, record, urlShouldSkipKey);
		record.extra = {url: URLToString.call(url)};
		return URL_TYPE;
	},

	/**
	 * Trace URLSearchParams.
	 * If can be derived from a URL, records URL as `record.extra.urlRecord`.
	 * Otherwise, records param string (`params.toString()`) as `record.extra.params`.
	 * @param {URLSearchParams} params - URLSearchParams object
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceURLSearchParams(params, record) {
		record.extra = {params: URLSearchParamsToString.call(params), urlRecord: null};
		this.traceProperties(params, record, urlShouldSkipKey);
		return URL_SEARCH_PARAMS_TYPE;
	},

	/**
	 * Remove any `URLSearchParams` which have no dependents.
	 * `traceURL()` adds a dependency from the URL's search params on the URL,
	 * but if the search params aren't referenced in their own right, this dependency should be removed.
	 * @returns {undefined}
	 */
	finalizeURLSearchParamses() {
		for (const paramsRecord of this.maybeSoloURLSearchParams) {
			if (!paramsRecord.dependents) deleteDependency(paramsRecord, paramsRecord.extra.urlRecord);
		}
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

/**
 * Serialize RegExp.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string} record.extra.regexp - Regex source string
 * @param {string} record.extra.flags - Flags
 * @returns {Object} - AST node
 */
function serializeRegexp(record) {
	const node = t.regExpLiteral(record.extra.regexp, record.extra.flags);

	const existingProps = [{
		key: 'lastIndex',
		valRecord: this.traceValue(0, null, null),
		getRecord: undefined,
		setRecord: undefined,
		writable: true,
		enumerable: false,
		configurable: false
	}];

	return this.wrapWithProperties(node, record, this.regexpPrototypeRecord, existingProps);
}
registerSerializer(REGEXP_TYPE, serializeRegexp);

/**
 * Serialize Date.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {number} record.extra.time - Time (from `date.getTime()`)
 * @returns {Object} - AST node
 */
function serializeDate(record) {
	// `new Date(...)`
	const {time} = record.extra,
		timeNode = Number.isNaN(time) ? this.traceAndSerializeGlobal(NaN) : t.numericLiteral(time);
	const node = t.newExpression(this.traceAndSerializeGlobal(Date), [timeNode]);
	return this.wrapWithProperties(node, record, this.datePrototypeRecord, null);
}
registerSerializer(DATE_TYPE, serializeDate);

/**
 * Serialize URL.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string} record.extra.url - URL string (from `url.toString()`)
 * @returns {Object} - AST node
 */
function serializeURL(record) {
	// `new URL(...)`
	const urlCtorNode = this.traceAndSerializeGlobal(URL);
	const node = t.newExpression(urlCtorNode, [t.stringLiteral(record.extra.url)]);
	return this.wrapWithProperties(node, record, this.urlPrototypeRecord, null);
}
registerSerializer(URL_TYPE, serializeURL);

/**
 * Serialize URLSearchParams.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string} [record.extra.params] - Params string (from `params.toString()`)
 * @returns {Object} - AST node
 */
function serializeURLSearchParams(record) {
	const node = record.extra.urlRecord
		// `url.searchParams`
		? t.memberExpression(this.serializeValue(record.extra.urlRecord), t.identifier('searchParams'))
		// `new URLSearchParams(...)`
		: t.newExpression(
			this.traceAndSerializeGlobal(URLSearchParams),
			[t.stringLiteral(record.extra.params)]
		);
	return this.wrapWithProperties(node, record, this.urlSearchParamsPrototypeRecord, null);
}
registerSerializer(URL_SEARCH_PARAMS_TYPE, serializeURLSearchParams);
