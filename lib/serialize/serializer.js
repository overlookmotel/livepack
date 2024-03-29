/* --------------------
 * livepack module
 * Serializer class
 * ------------------*/

'use strict';

// Imports
const serializeMethods = require('./serialize.js'),
	outputMethods = require('./output.js'),
	filenameMethods = require('./filenames.js').methods,
	valueMethods = require('./values.js'),
	functionMethods = require('./functions.js'),
	objectMethods = require('./objects.js'),
	arrayMethods = require('./arrays.js'),
	setMapMethods = require('./setsMaps.js'),
	symbolMethods = require('./symbols.js'),
	bufferMethods = require('./buffers.js'),
	boxedMethods = require('./boxed.js'),
	otherMethods = require('./other.js'),
	blockMethods = require('./blocks.js'),
	splitMethods = require('./split.js').methods,
	traceMethods = require('./trace.js'),
	serializeArguments = require('./arguments.js'),
	parseFunction = require('./parseFunction.js'),
	serializeRuntime = require('./runtime.js'),
	{createMangledVarNameTransform, createUnmangledVarNameTransform} = require('./varNames.js'),
	{COMMON_JS_VAR_NAMES} = require('../shared/constants.js');

// Exports

class Serializer {
	constructor(options) {
		this.options = options;
		this.records = new Map(); // Keyed by value
		this.files = Object.create(null); // Keyed by file path

		this.createVarNameTransform = options.mangle
			? createMangledVarNameTransform
			: createUnmangledVarNameTransform;

		this.globalVarNames = options.format === 'esm' ? [] : [...COMMON_JS_VAR_NAMES];

		this.prototypes = new Map(); // Keyed by prototype object

		this.sourceFiles = Object.create(null); // Keyed by file path
		this.filesHaveSourcesFor = new Set();

		this.initBlocks();
		this.initFilenames();
		this.initSplits();
		this.initTrace();

		this.evalRecord = undefined;
	}
}

Object.assign(
	Serializer.prototype,
	serializeMethods,
	outputMethods,
	filenameMethods,
	valueMethods,
	functionMethods,
	objectMethods,
	arrayMethods,
	setMapMethods,
	symbolMethods,
	bufferMethods,
	boxedMethods,
	otherMethods,
	blockMethods,
	splitMethods,
	traceMethods,
	{serializeArguments, parseFunction, serializeRuntime}
);

module.exports = Serializer;
