/* --------------------
 * livepack module
 * Output methods
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, relative: pathRelative, dirname} = require('path').posix,
	generate = require('@babel/generator').default,
	{fromObject: sourceMapFromObject} = require('convert-source-map'),
	t = require('@babel/types');

// Imports
const {createRecord, createDependency} = require('./records.js'),
	{toJsIdentifier, deleteFirst} = require('./utils.js'),
	{ENTRY_POINT, ASYNC_SPLIT_POINT, ENTRY_POINT_MASK, SPLIT_POINT_MASK} = require('./constants.js');

// Exports

module.exports = {
	/**
	 * Output to files.
	 * @param {Array<Object>} outputs - Array of output objects
	 * @param {Array<Object>} entryPointOutputs - Array of outputs for entry points + async split points
	 * @returns {Array<Object>} - Array of file objects of form `{filename, content}`
	 */
	output(outputs, entryPointOutputs) {
		// Process outputs in reverse order (most deeply nested first)
		for (let i = outputs.length - 1; i >= 0; i--) {
			const output = outputs[i];

			// Combine multiple exports into an array if more than 1
			const {name: outputName, exports} = output;
			let combinedRecord, combinedName, combinedArrayNodes;
			if (exports.length === 1) {
				combinedRecord = exports[0];
				combinedName = combinedRecord.varNode.name;
			} else {
				combinedName = outputName || exports.map(record => record.varNode.name).join('_');
				combinedRecord = createRecord(combinedName);
				combinedArrayNodes = [];
				combinedRecord.node = t.arrayExpression(combinedArrayNodes);
				combinedRecord.output = output;
			}

			// Rewrite dependencies on these values from outside this output to import/require
			// from this output
			const importsMap = new Map(); // Keyed by output
			exports.forEach((record, exportIndex) => {
				const dependents = record.dependents || []; // Empty array fallback for primitives
				for (let dependentIndex = 0; dependentIndex < dependents.length; dependentIndex++) {
					const dependent = dependents[dependentIndex],
						dependentRecord = dependent.record,
						dependentOutput = (dependentRecord.record || dependentRecord).output;
					if (dependentOutput === output) continue;

					// Create record for `import` statement importing this output
					// e.g. `import exportsArray from './filename.js'`.
					// Each output which imports from this one gets its own import record.
					// NB AST node for the record is added after file created - filename is unknown at this point.
					const importProps = importsMap.get(dependentOutput);
					let importRecord, importedValueRecords;
					if (importProps) {
						({importRecord, importedValueRecords} = importProps);
					} else {
						importRecord = createRecord(combinedName);
						importedValueRecords = [];
						importsMap.set(dependentOutput, {importRecord, importedValueRecords});
					}

					// Create record for property of exports array
					// e.g. `exportsArray[0]`
					let importedValueRecord;
					if (combinedArrayNodes) {
						importedValueRecord = importedValueRecords[exportIndex];
						if (!importedValueRecord) {
							importedValueRecord = createRecord(record.varNode.name);
							const memberNode = t.memberExpression(
								importRecord.varNode,
								t.numericLiteral(exportIndex),
								true // computed
							);
							importedValueRecord.node = memberNode;
							createDependency(importedValueRecord, importRecord, memberNode, 'object');

							importedValueRecords[exportIndex] = importedValueRecord;
						}
					} else {
						importedValueRecord = importRecord;
					}

					// Replace dependency on value with dependency on imported value
					dependents.splice(dependentIndex, 1);
					dependentIndex--;

					if (!dependentRecord.node) {
						// Dependent is proxy - set output's export to import from common file
						dependentOutput.exports[0] = importedValueRecord;
					} else {
						// Replace what was reference to record with reference to import
						deleteFirst(dependentRecord.dependencies, dependency => dependency.record === record);

						const {node: parentNode, key} = dependent;
						parentNode[key] = importedValueRecord.varNode;
						createDependency(dependentRecord, importedValueRecord, parentNode, key);
					}
				}

				if (combinedArrayNodes) {
					combinedArrayNodes[exportIndex] = record.varNode;
					createDependency(combinedRecord, record, combinedArrayNodes, exportIndex);
				}
			});

			// Output
			const files = this.outputOne(output, combinedRecord);
			output.files = files;
			const {filename} = output;

			// Create import/require expressions
			for (const [dependentOutput, {importRecord}] of importsMap) {
				const relativePath = getRequirePath(dependentOutput.tempFilename, filename);
				importRecord.node = this.createImportOrRequireNode(relativePath, importRecord.varNode);
			}

			// Create async import functions
			if (output.type === ASYNC_SPLIT_POINT) {
				for (const importFnRecord of output.importFnRecords) {
					const relativePath = getRequirePath(importFnRecord.output.tempFilename, filename);
					importFnRecord.node = t.arrowFunctionExpression(
						[], t.callExpression(t.import(), [t.stringLiteral(relativePath)])
					);
				}
			}
		}

		// Compile files array - entry points first in original order,
		// then common + splits in (roughly) ascending order of depth
		const files = [];
		for (const output of entryPointOutputs) {
			files.push(...output.files);
		}
		for (const output of outputs) { // eslint-disable-next-line no-bitwise
			if (!(output.type & ENTRY_POINT_MASK)) files.push(...output.files);
		}
		return files;
	},

	/**
	 * Output record to files.
	 * Returns file objects - 2 files if source maps, otherwise 1 file.
	 * @param {Object} output - Output object
	 * @param {Object} record - Record for value file exports
	 * @returns {Array<Object>} - Array of file objects of form `{filename, content}`.
	 */
	outputOne(output, record) {
		// Get format
		const {options} = this;
		let {format} = options;
		if (output.type === ENTRY_POINT) {
			if (options.exec) format = 'exec';
		} else if (format === 'js') {
			format = 'cjs';
		}

		// Compile file as AST
		const node = this.outputAst(record, format);

		// Compile to JS
		const {minify, sourceMaps} = options;
		let {code: js, map} = generate(node, { // eslint-disable-line prefer-const
			minified: minify,
			compact: minify,
			comments: options.comments,
			sourceMaps,
			shouldPrintComment: options.shouldPrintComment
		}, sourceMaps ? this.sourceFiles : undefined);

		// Remove trailing semicolon in `minify` mode
		if (format !== 'js' && minify) js = js.slice(0, -1);

		// Add source map comment (without URL)
		if (sourceMaps) {
			js += '\n//# sourceMappingURL=';
			if (sourceMaps === 'inline') js += 'data:application/json;charset=utf-8;base64,';
		}

		// Get filename
		const filename = this.getOutputFilename(output, js);
		output.filename = filename;

		// Add source map
		let mapFile;
		if (sourceMaps) {
			// Convert paths to relative if `outputDir` option provided
			if (options.outputDir) {
				const fileOutputDir = pathJoin(options.outputDir, filename, '..');
				map.sources = map.sources.map(path => getRelativePathFromDir(fileOutputDir, path));
			}

			if (sourceMaps === 'inline') {
				js += sourceMapFromObject(map).toBase64();
			} else {
				const mapFilename = `${filename}.${options.mapExt}`;
				js += mapFilename.replace(/^.+\//, '');
				mapFile = {
					type: 'source map',
					name: null,
					filename: mapFilename,
					content: sourceMapFromObject(map).toJSON()
				};
			}
		}

		// Add trailing newline
		if (!minify) js += '\n';

		// Return file objects
		const files = [{
			type: this.getOutputTypeName(output),
			name: output.name || null,
			filename,
			content: js
		}];
		if (mapFile) files.push(mapFile);
		return files;
	},

	/**
	 * Get output type name.
	 * @param {Object} output - Output object
	 * @returns {string} - Type name ('entry', 'split' or 'common')
	 */
	getOutputTypeName(output) {
		const {type} = output;
		return type === ENTRY_POINT // eslint-disable-line no-nested-ternary
			? 'entry'
			: type & SPLIT_POINT_MASK // eslint-disable-line no-bitwise
				? 'split'
				: 'common';
	},

	/**
	 * Compile AST for output file.
	 * @param {Object} record - Record for value file exports
	 * @param {string} format - Output format
	 * @returns {Object} - Babel AST node for file
	 */
	outputAst(record, format) {
		// Prepare export node
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
		if (format === 'js') {
			// Output as expression
			if (statementNodes.length === 1) {
				// Only 1 statement - remove `return ...`
				return exportNode.argument;
			}

			// Multiple statements - wrap in IIFE
			return t.callExpression(
				t.arrowFunctionExpression([], t.blockStatement(statementNodes)), []
			);
		}

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

		// Output as program
		return t.program(statementNodes);
	},

	/**
	 * Output complex value (i.e. not primitive).
	 * @param {Object} record - Record for value to serialize
	 * @returns {Array<Object>} - Program statements (Babel nodes)
	 */
	outputMain(record) {
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
	},

	outputStatsFile(files) {
		const stats = {
			files: files.map(file => ({type: file.type, name: file.name, filename: file.filename}))
		};

		return {
			type: 'stats',
			name: null,
			filename: this.options.stats,
			content: JSON.stringify(stats)
		};
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

/**
 * Get relative `require()` path between 2 files.
 * @param {string} fromPath - Path of file requiring
 * @param {string} toPath - Path of file being required
 * @returns {string} - Relative path for use in `require()`
 */
function getRequirePath(fromPath, toPath) {
	return getRelativePathFromDir(dirname(`/${fromPath}`), `/${toPath}`);
}

/**
 * Get relative path from dir to file.
 * Returned path begins with `./` or `../`.
 * @param {string} fromPath - Path of source file
 * @param {string} toPath - Path of target file
 * @returns {string} - Relative path
 */
function getRelativePathFromDir(fromPath, toPath) {
	const path = pathRelative(fromPath, toPath);
	return path.slice(0, 3) === '../' ? path : `./${path}`;
}
