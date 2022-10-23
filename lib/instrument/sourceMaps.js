/* --------------------
 * livepack module
 * Code instrumentation source maps functions
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, dirname, isAbsolute: pathIsAbsolute} = require('path'),
	{readFileSync} = require('fs'),
	{
		commentRegex: inlineCommentRegex,
		mapFileCommentRegex: fileCommentRegex,
		fromComment: sourceMapFromInlineComment,
		fromMapFileComment: sourceMapFromFileComment
	} = require('convert-source-map'),
	{SourceMapConsumer} = require('source-map');

// Imports
const {traverseAll} = require('../shared/functions.js');

// Exports

module.exports = {
	parseSourceMapComment,
	mapLocations
};

/**
 * Parse source map from source map comment, if found.
 * If multiple source map comments, use last one.
 * Do not parse if `filename` not provided (source maps disabled or user provided input source map).
 *
 * Remove source map comments (replace with 'SOURCE MAP COMMENT' placeholders).
 * Purpose of removing source map comments is:
 * 1. prevent incorrect source map comments in instrumented output.
 * 2. prevent function ASTs having source map comments attached to them,
 *    which could then be erroneously included in serialized output.
 *
 * @param {Object} ast - AST
 * @param {string} [filename] - File path (or `undefined` if source map should not be parsed)
 * @returns {Object|undefined} - Source map, if found
 */
function parseSourceMapComment(ast, filename) {
	// Locate source map comments. Replace them with placeholder comments.
	let getSourceMap;
	for (const comment of ast.comments) {
		const commentText = comment.type === 'CommentBlock' ? `/*${comment.value}*/` : `//${comment.value}`;

		const inlineMatch = inlineCommentRegex.exec(commentText);
		if (inlineMatch) {
			getSourceMap = () => getSourceMapFromInlineComment(commentText);
		} else {
			const fileMatch = fileCommentRegex.exec(commentText);
			if (!fileMatch) continue;
			getSourceMap = () => getSourceMapFromFileComment(commentText, filename);
		}

		comment.value = 'SOURCE MAP COMMENT';
	}

	// Parse source map from comment (unless not required)
	if (getSourceMap && filename) return getSourceMap();
	return undefined;
}

function getSourceMapFromInlineComment(commentText) {
	return sourceMapFromInlineComment(commentText).sourcemap;
}

function getSourceMapFromFileComment(commentText, filename) {
	// Ignore file system errors e.g. source map file does not exist
	try {
		return sourceMapFromFileComment(
			commentText,
			mapFilename => readFileSync(pathJoin(dirname(filename), mapFilename), 'utf8')
		).sourcemap;
	} catch (err) {
		return undefined;
	}
}

/**
 * Map location of all AST nodes according to source map.
 * `loc.filename` will be absolute paths.
 * Gather all sources in `sources` object.
 * @param {Object} ast - AST
 * @param {Object} sourceMap - Source map object
 * @param {string} [filename] - File path
 * @returns {Object} - Sources object mapping file path to file content
 */
function mapLocations(ast, sourceMap, filename) {
	// Convert source map file paths to absolute paths
	let {sourceRoot} = sourceMap;
	if (!sourceRoot && filename) sourceRoot = dirname(filename);

	const sources = Object.create(null),
		{sourcesContent} = sourceMap;
	sourceMap = {...sourceMap, sourceRoot: undefined};
	sourceMap.sources = sourceMap.sources.map((path, index) => {
		let absolutePath;
		if (pathIsAbsolute(path)) {
			absolutePath = path;
		} else {
			if (!sourceRoot) return '';
			absolutePath = pathJoin(sourceRoot, path);
		}
		sources[absolutePath] = sourcesContent[index];
		return absolutePath;
	});

	// Map `loc` of AST nodes to source
	const sourceMapConsumer = new SourceMapConsumer(sourceMap),
		originalPositionFor = sourceMapConsumer.originalPositionFor.bind(sourceMapConsumer);
	traverseAll(ast, node => transformLocation(node, originalPositionFor));

	// Return sources
	return sources;
}

/**
 * Map AST node's location to location in source file.
 * @param {Object} node - AST node
 * @param {Function} originalPositionFor - Function to get source position
 * @returns {undefined}
 */
function transformLocation(node, originalPositionFor) {
	const {loc} = node;
	if (!loc || loc.source) return;

	const {start, end} = loc;
	if (start.line == null || start.column == null || end.line == null || end.column == null) {
		node.loc = undefined;
		return;
	}

	const newStart = originalPositionFor(start);
	const filename = newStart.source;
	if (!filename) return;

	const newEnd = originalPositionFor(end);
	if (newEnd.source !== filename) return;

	start.line = newStart.line;
	start.column = newStart.column;
	end.line = newEnd.line;
	end.column = newEnd.column;
	loc.filename = filename;
	loc.identifierName = newStart.name;
}
