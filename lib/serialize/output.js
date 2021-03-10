/* --------------------
 * livepack module
 * Output methods
 * ------------------*/

'use strict';

// Modules
const generate = require('@babel/generator').default,
	{fromObject: sourceMapFromObject, generateMapFileComment} = require('convert-source-map'),
	t = require('@babel/types');

// Imports
const {toJsIdentifier} = require('./utils.js');

// Exports

module.exports = {
	/**
	 * Output record to files.
	 * @param {Object} record - Record to output
	 * @returns {Array<Object>} - Array of file objects of form `{filename, content}`
	 */
	output(record) {
		// Prepare export node
		const {options} = this,
			format = options.exec ? 'exec' : options.format;
		let exportNode, exportTarget, exportKey;
		if (format === 'exec') {
			exportNode = t.expressionStatement(t.callExpression(record.varNode, []));
			exportTarget = exportNode.expression;
			exportKey = 'callee';
		} else if (format === 'js') {
			exportNode = t.returnStatement(record.varNode);
			exportTarget = exportNode;
			exportKey = 'argument';
		} else if (format === 'cjs') {
			exportNode = t.expressionStatement(
				t.assignmentExpression(
					'=',
					t.memberExpression(t.identifier('module'), t.identifier('exports')),
					record.varNode
				)
			);
			exportTarget = exportNode.expression;
			exportKey = 'right';
		} else { // ESM
			exportNode = t.exportDefaultDeclaration(record.varNode);
			exportTarget = exportNode;
			exportKey = 'declaration';
		}

		// Compile as set of statements
		const {dependents} = record;
		let statementNodes;
		if (!dependents) {
			// Primitive
			statementNodes = [exportNode];
		} else {
			// Non-primitive
			dependents.push({node: exportTarget, key: exportKey});
			statementNodes = this.outputMain(record);
			statementNodes.push(exportNode);
		}

		// Compile node to generate code from
		const {minify} = options;
		let generateFromNode, removeTrailingSemicolon;
		if (format === 'js') {
			// Output as expression
			if (statementNodes.length === 1) {
				// Only 1 statement - remove `return ...`
				generateFromNode = exportNode.argument;
			} else {
				// Multiple statements - wrap in IIFE
				generateFromNode = t.callExpression(
					t.arrowFunctionExpression([], t.blockStatement(statementNodes)), []
				);
			}

			removeTrailingSemicolon = false;
		} else {
			if (format === 'exec') {
				// Output as function expression to be immediately executed.
				// If export is a function (as opposed to a var), unwrap contents of function body.
				// Not unwrapped if:
				//   - Async or generator function
				//   - Function is named (as it may refer to itself internally)
				//   - Function has parameters (as may use these params internally)
				// TODO Could optimize last 2 cases by checking if function name/params
				// are referred to in function body, and unwrapping if not.
				const node = exportNode.expression.callee;
				if (
					t.isFunction(node) && !node.id && !node.async && !node.generator && node.params.length === 0
				) {
					statementNodes.pop();
					const bodyNode = node.body;
					if (t.isBlockStatement(bodyNode)) {
						statementNodes.push(...bodyNode.body);
					} else {
						statementNodes.push(t.expressionStatement(bodyNode));
					}
				}
			}

			generateFromNode = t.program(statementNodes);
			removeTrailingSemicolon = minify;
		}

		// Compile to JS
		const {sourceMaps} = options;
		let {code: js, map} = generate(generateFromNode, { // eslint-disable-line prefer-const
			minified: minify,
			compact: minify,
			comments: options.comments,
			sourceMaps,
			shouldPrintComment: options.shouldPrintComment
		}, sourceMaps ? this.sourceFiles : undefined);

		// Remove trailing semicolon in `minify` mode
		if (removeTrailingSemicolon) js = js.slice(0, -1);

		// Add source map comment
		const filename = 'index.js';

		let mapFile;
		if (sourceMaps === 'inline') {
			js += `\n${sourceMapFromObject(map).toComment()}`;
		} else if (sourceMaps) {
			const mapFilename = `${filename}.map`;
			js += `\n${generateMapFileComment(mapFilename)}`;
			mapFile = {
				filename: mapFilename,
				content: sourceMapFromObject(map).toJSON()
			};
		}

		// Add trailing newline
		if (!minify) js += '\n';

		// Return file objects
		const files = [{filename, content: js}];
		if (mapFile) files.push(mapFile);
		return files;
	},

	/**
	 * Output complex value (i.e. not primitive).
	 * @param {Object} record - Record for value to serialize
	 * @returns {Array<Object>} - Program statements (Babel nodes)
	 */
	outputMain(record) {
		// Create scopes and functions
		this.processBlocks();

		// Trace dependencies and create vars for each
		const transformVarName = this.createVarNameTransform(new Set(this.globalVarNames));
		const varNodes = [],
			statementNodes = [],
			importNodes = [],
			{mangle, inline} = this.options;

		const queue = [record],
			processing = new Map(); // Keyed by record, values = `true` for processed, `false` for processing
		function processQueue() {
			while (queue.length > 0) {
				const valRecord = queue.shift();

				// Reset any which were flagged as processing
				processing.forEach((isProcessed, currentRecord) => {
					if (!isProcessed) processing.delete(currentRecord);
				});

				addDependencies(valRecord);
			}
		}

		function addDependencies(valRecord) {
			// Skip if already processing / processed
			const isProcessed = processing.get(valRecord);
			if (isProcessed !== undefined) return isProcessed;

			// Flag as processing
			processing.set(valRecord, false);

			// Add sub-dependencies
			for (const dependency of valRecord.dependencies) {
				const wasOutput = addDependencies(dependency.record);
				if (!wasOutput) {
					// Could not be completed - add to queue to try again later
					queue.push(valRecord);
					return false;
				}
			}

			// Flag as processed
			processing.set(valRecord, true);

			// Add var definition to output
			const {dependents, assignments} = valRecord;
			let {node} = valRecord;
			const nodeIsImport = t.isImportDeclaration(node);
			if (inline && dependents.length === 1 && !nodeIsImport) {
				// Only used once - substitute content in place of var
				const {node: parentNode, key} = dependents[0];

				// Wrap unnamed functions used as object properties in `(0, fn)` to prevent them getting named
				// and unwrap `{x: {x() {}}.x}` to `{x() {}}`
				if (t.isObjectProperty(parentNode) && key === 'value') {
					if ((t.isFunction(node) || t.isClass(node)) && !node.id) {
						// Wrap unnamed function
						node = t.sequenceExpression([t.numericLiteral(0), node]);
					} else if (!parentNode.computed && isWrappingMethod(node, parentNode.key)) {
						// Unwrap `{x: {x() {}}.x}` to `{x() {}}`
						replaceNode(parentNode, node.object.properties[0]);
						node = null;
					}
				}

				if (node) parentNode[key] = node;
			} else {
				// Create variable to hold this value
				const {varNode} = valRecord;
				varNode.name = transformVarName(mangle ? null : toJsIdentifier(varNode.name));

				if (!nodeIsImport) {
					// Wrap unnamed functions in `(0, fn)` to prevent them getting named.
					// NB `valRecord.scope` check is to avoid doing this for `createScope` functions.
					if ((t.isFunction(node) || t.isClass(node)) && !node.id && valRecord.scope) {
						node = t.sequenceExpression([t.numericLiteral(0), node]);
					}

					varNodes.push(t.variableDeclarator(varNode, node));
				} else {
					importNodes.push(node);
				}
			}

			// Add assignment statements
			if (assignments) {
				for (const assignment of assignments) {
					for (const dependency of assignment.dependencies) {
						addDependencies(dependency.record);
					}

					if (assignment.node) statementNodes.push(t.expressionStatement(assignment.node));
				}
			}

			return true;
		}

		processQueue();

		// Add var definitions statement
		if (varNodes.length > 0) statementNodes.unshift(t.variableDeclaration('const', varNodes));

		// Add import statements
		if (importNodes.length > 0) statementNodes.unshift(...importNodes);

		return statementNodes;
	}
};

/**
 * Determine if a node is an object method wrapped in an object with stated key.
 * e.g. `{x() {}}.x`, `{'0a'() {}}['0a']`, `{0() {}}[0]`
 * @param {Object} node - Babel node
 * @param {string} keyNode - Key node being assigned to
 * @returns {boolean} - `true` if is wrapped object method
 */
function isWrappingMethod(node, keyNode) {
	if (!t.isMemberExpression(node)) return false;

	const keyIsIdentifier = t.isIdentifier(keyNode);
	if (node.computed === keyIsIdentifier) return false;

	const valueKey = keyIsIdentifier ? 'name' : 'value';
	const {type: keyType, [valueKey]: keyValue} = keyNode;

	const propKeyNode = node.property;
	if (propKeyNode.type !== keyType || propKeyNode[valueKey] !== keyValue) return false;

	const objNode = node.object;
	if (!t.isObjectExpression(objNode)) return false;
	const propNodes = objNode.properties;
	if (propNodes.length !== 1) return false;
	const propNode = propNodes[0];
	if (!t.isObjectMethod(propNode) || propNode.computed) return false;
	const objKeyNode = propNode.key;
	return objKeyNode.type === keyType && objKeyNode[valueKey] === keyValue;
}

/**
 * Replace a node in place.
 * @param {Object} node - Babel node
 * @param {Object} replacementNode - Replacement Babel node
 * @returns {Object} - Input node (now with all props of replacement node)
 */
function replaceNode(node, replacementNode) {
	Object.keys(node).forEach(key => delete node[key]);
	return Object.assign(node, replacementNode);
}
