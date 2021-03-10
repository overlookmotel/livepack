/* --------------------
 * livepack module
 * `split` + `splitAsync` functions, and split methods
 * ------------------*/

'use strict';

// Modules
const assert = require('simple-invariant'),
	{isFullString} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const {splitPoints, functions: specialFunctions} = require('../internal.js'),
	createModulePromise = require('./createModule.js'),
	{recordIsCircular} = require('./utils.js'),
	{isPrimitive} = require('../shared/functions.js');

// Exports

module.exports = {
	split,
	splitAsync,
	// `methods` is merged into `Serializer` class prototype
	methods: {
		initSplits,
		serializeSplitAsyncFunction
	}
};

/**
 * Create a split point (code splitting).
 * @param {*} val - Value to split at
 * @param {string} [name] - Split point name
 * @returns {*} - Input
 */
function split(val, name) {
	name = validateInput(val, name, 'split');
	getOrCreateSplitPoint(val, name);
	return val;
}

/**
 * Create a split point (code splitting) for async loading.
 * Returns a function with same behavior as `import()` - it returns
 * a Promise of a module namespace object with the value as default export.
 * Each call returns a new function, and each call to that function returns a new promise,
 * but the module object is always the same for same value.
 * @param {*} val - Value to split at
 * @param {string} [name] - Split point name
 * @returns {Function} - Import function
 */
function splitAsync(val, name) {
	name = validateInput(val, name, 'split');

	const splitPoint = getOrCreateSplitPoint(val, name);

	// Create import function
	const importFn = () => {
		const {moduleObj, modulePromise} = splitPoint;
		if (!moduleObj && !modulePromise) return createModulePromise(val, splitPoint);
		if (moduleObj) return Promise.resolve(moduleObj);
		return modulePromise.then(mod => mod);
	};

	// Record import function in special functions
	specialFunctions.set(importFn, {type: 'splitAsync', val, splitPoint});

	return importFn;
}

function validateInput(val, name, fnName) {
	assert(!isPrimitive(val), 'Cannot split on primitive values');

	if (name == null) {
		name = undefined;
	} else {
		assert(
			name === undefined || isFullString(name),
			`\`name\` argument to \`${fnName}\` must be a non-empty string if provided`
		);
	}
	return name;
}

function getOrCreateSplitPoint(val, name) {
	let splitPoint = splitPoints.get(val);
	if (!splitPoint) {
		splitPoint = {
			name: name || undefined,
			moduleObj: undefined,
			modulePromise: undefined
		};
		splitPoints.set(val, splitPoint);
	} else if (!splitPoint.name && name) {
		splitPoint.name = name;
	}
	return splitPoint;
}

/*
 * Methods to merge into `Serializer` class prototype
 */

/* eslint-disable no-invalid-this */
function initSplits() {
	this.splitImportFns = [];
}

function serializeSplitAsyncFunction({val, splitPoint}, importFnRecord) {
	const valRecord = this.records.get(val);
	if (valRecord && recordIsCircular(valRecord)) {
		console.error( // eslint-disable-line no-console
			'Cannot use `splitAsync()` to import a value which itself contains the import function.\n'
			+ `Trace:\n${this.getTraceStack()}\n`
		);
		throw new Error('Circular use of `splitAsync()`');
	}

	this.splitImportFns.push({importFnRecord, val, splitPoint});
	return t.identifier('x'); // Will be replaced later
}
/* eslint-enable no-invalid-this */
