/* --------------------
 * livepack module
 * Babel plugin
 * Functions relating to serializing function ASTs and source maps.
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, isAbsolute: pathIsAbsolute} = require('path'),
	{SourceMapConsumer} = require('source-map');

// Exports

module.exports = {
	initFunctionAstSerialization,
	unpatchNodeToJson,
	cloneNode
};

let nodePrototype;

/**
 * Record source files' code and patch `.toJSON()` prototype method on Babel `Node` class
 * for serializing function ASTs.
 * @param {Object} programPath - Babel path object for program
 * @param {string} [filename] - File path
 * @param {Object} [babelState] - Babel state object (undefined if this is code from in `eval()`)
 * @param {Object} sources - Sources map
 * @returns {undefined}
 */
function initFunctionAstSerialization(programPath, filename, babelState, sources) {
	// Get `Node` class prototype.
	// `Node` class is not exported by Babel, so this is only way to access it.
	if (!nodePrototype) nodePrototype = Object.getPrototypeOf(programPath.node);

	// If has Babel state, is a real file, not code from inside `eval()`
	if (babelState) {
		// Record this file's code
		const {file} = babelState;
		if (filename) sources[filename] = file.code;

		// If file has an input source map, record sources' code,
		// and use custom `.toJSON()` method to map locs in function ASTs to source files
		const sourceMapConverter = file.inputMap;
		if (sourceMapConverter) {
			// Record content of sources
			const sourceMap = sourceMapConverter.sourcemap;
			const sourceMapConsumer = new SourceMapConsumer(sourceMap),
				{sourcesContent} = sourceMap,
				filenameMapping = Object.create(null);
			sourceMap.sources.forEach((sourceFilename, index) => {
				if (!pathIsAbsolute(sourceFilename)) {
					const resolvedFilename = pathJoin(filename, '..', sourceFilename);
					filenameMapping[sourceFilename] = resolvedFilename;
					sourceFilename = resolvedFilename;
				}

				sources[sourceFilename] = sourcesContent[index];
			});

			// Set `toJSON()` function which maps locations to sources
			nodePrototype.toJSON = function(key) {
				return nodeToJsonUsingSourceMap(this, key, sourceMapConsumer, filenameMapping);
			};
			return;
		}
	}

	// No input source map - use basic `toJSON()` function
	nodePrototype.toJSON = nodeToJson;
}

/**
 * Remove patched `.toJSON()` prototype method on Babel `Node` class.
 * @returns {undefined}
 */
function unpatchNodeToJson() {
	delete nodePrototype.toJSON;
}

/**
 * Patched `.toJSON()` prototype method for Babel `Node` class.
 * Replaces nested functions with `null`.
 * Exception is class constructors which are included in serialized AST for the class.
 * @this {Object} Babel AST node
 * @param {string} key - Traversal key
 * @returns {Object|null} - AST node or `null` if is a function
 */
function nodeToJson(key) {
	if (key === '') return this;

	// Equivalent to:
	// `t.isClass(this) || (t.isFunction(this) && !t.isClassMethod(this, {kind: 'constructor'}))`.
	// Avoiding Babel's `.is` functions for speed, as this function is called on every node in the AST.
	const {type} = this;
	if (
		type === 'ClassDeclaration' || type === 'ClassExpression'
		|| type === 'FunctionDeclaration' || type === 'FunctionExpression'
		|| type === 'ArrowFunctionExpression'
		|| type === 'ObjectMethod' || type === 'ClassPrivateMethod'
		|| (type === 'ClassMethod' && this.kind !== 'constructor')
	) return null;

	return this;
}

/**
 * Patched `.toJSON()` prototype method for Babel `Node` class.
 * Performs same function as `nodeToJson()` above, but additionally
 * maps AST node's location to location in source file.
 * @param {Object} node - Babel AST node
 * @param {string} key - Traversal key
 * @param {Object} sourceMapConsumer - Source map consumer object
 * @param {Object} filenameMapping - Map of relative paths to absolute paths
 * @returns {Object|null} - AST node or `null` if is a function
 */
function nodeToJsonUsingSourceMap(node, key, sourceMapConsumer, filenameMapping) {
	node = nodeToJson.call(node, key);
	if (node) transformLocation(node, sourceMapConsumer, filenameMapping);
	return node;
}

/**
 * Map AST node's location to location in source file.
 * @param {Object} node - AST node
 * @param {Object} sourceMapConsumer - Source map consumer object
 * @param {Object} filenameMapping - Map of relative paths to absolute paths
 * @returns {undefined}
 */
function transformLocation(node, sourceMapConsumer, filenameMapping) {
	const {loc} = node,
		{start, end} = loc;
	if (start.line == null || start.column == null || end.line == null || end.column == null) return;

	const newStart = sourceMapConsumer.originalPositionFor(start);
	const filename = newStart.source;
	if (!filename) return;

	const newEnd = sourceMapConsumer.originalPositionFor(end);
	if (newEnd.source !== filename) return;

	start.line = newStart.line;
	start.column = newStart.column;
	end.line = newEnd.line;
	end.column = newEnd.column;
	loc.filename = filenameMapping[filename] || filename;
	loc.identifierName = newStart.name;
}

/**
 * Clone Babel AST Node object.
 * Maintains prototype of node object as Babel's `Node` class prototype.
 * @param {Object} node - AST node object
 * @returns {Object} - Cloned AST node object
 */
function cloneNode(node) {
	return Object.create(nodePrototype, Object.getOwnPropertyDescriptors(node));
}