/* --------------------
 * livepack module
 * Output methods
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, relative: pathRelative, dirname} = require('path').posix,
	generate = require('@babel/generator').default,
	{fromObject: sourceMapFromObject} = require('convert-source-map'),
	stringSplice = require('string-splice'),
	last = require('lodash/last'),
	t = require('@babel/types'),
	assert = require('simple-invariant');

// Imports
const {createRecord, createDependency} = require('./records.js'),
	{getOutputTypeName, hashFileContent} = require('./filenames.js'),
	{addStrictDirectiveToFunctionMaybeWrapped, addStrictDirectiveToBlock} = require('./strict.js'),
	{toJsIdentifier, setAddFrom, firstMapValue} = require('./utils.js'),
	{HASH_LENGTH, HASH_PLACEHOLDER_CHAR, ENTRY_POINT} = require('./constants.js'),
	{PRIMITIVE_TYPE} = require('./types.js');

// Constants
const uniformHashPlaceholder = HASH_PLACEHOLDER_CHAR.repeat(HASH_LENGTH),
	placeholderRegex = new RegExp(`${HASH_PLACEHOLDER_CHAR}+(\\d+)`, 'g');

// Exports

module.exports = {
	/**
	 * Init output vars.
	 * @returns {undefined}
	 */
	initOutput() {
		this.importNodes = undefined;
		this.varNodes = undefined;
		this.assignmentNodes = undefined;
		this.transformVarName = undefined;
	},

	/**
	 * Output to files.
	 * @param {Array<Object>} entryPointOutputs - Array of outputs for entry points
	 * @returns {Array<Object>} - Array of file objects of form `{filename, content}`
	 */
	output(entryPointOutputs) {
		const {options} = this,
			numFilesPerOutput = options.sourceMaps === true ? 2 : 1;
		const files = new Array(entryPointOutputs.length * numFilesPerOutput);

		const incompleteOutputs = new Map(); // Keyed by output

		const finalizeOutput = (output, js, map) => {
			// Generate files objects
			const outputFiles = this.generateOutputFiles(output, js, map);

			// Add to files. Entry points come first, in original order, followed by all others.
			if (output.type === ENTRY_POINT) {
				files.splice(output.index * numFilesPerOutput, numFilesPerOutput, ...outputFiles);
			} else {
				files.push(...outputFiles);
			}
		};

		// TODO Alter to reflect 2-phase serialization
		const processOutput = (output) => {
			// If already processed/processing, exit
			if (output.filename) return;

			// Get filename (if filename includes hash, temp filename with hash placeholder)
			const filenameAndHash = this.getOutputFilenameAndHash(output, undefined);
			const {filename} = filenameAndHash;
			output.filename = filename;
			const filenameIsTemp = !!filenameAndHash.hash;

			// Output dependencies and create import statements to import from them
			let awaitedBy;
			if (filenameIsTemp) {
				awaitedBy = new Set();
				output.awaitedBy = awaitedBy;
				output.awaiting = new Set([output]);
			}

			const awaiting = new Set(),
				outputIndexToOutputMap = Object.create(null);
			let numPlaceholders = 0;
			for (const [dependencyOutput, {importRecords, importFnRecords}] of output.dependencies.entries()) {
				// Process output this depends on
				processOutput(dependencyOutput);

				const dependencyFilename = dependencyOutput.filename,
					dependencyIsIncomplete = !!dependencyOutput.awaiting;
				if (dependencyIsIncomplete) {
					setAddFrom(awaiting, dependencyOutput.awaiting);
					outputIndexToOutputMap[dependencyOutput.index] = dependencyOutput;
				}

				// Create import statements
				const {exports} = dependencyOutput,
					relativePath = getRequirePath(filename, dependencyFilename);
				if (exports.length === 1) {
					// Default export only - create import statement
					const importRecord = importRecords[0];
					if (importRecord) {
						importRecord.node = this.createImportOrRequireNode(relativePath, importRecord.varNode);
						if (dependencyIsIncomplete) numPlaceholders++;
					}

					// Create dynamic imports
					for (const importFnRecord of importFnRecords) {
						importFnRecord.node = t.arrowFunctionExpression(
							[], t.callExpression(t.import(), [t.stringLiteral(relativePath)])
						);
						if (dependencyIsIncomplete) numPlaceholders++;
					}
				} else {
					// Multiple exports.
					// Create import statement (e.g. `import importedVar from './xxx.js'`).
					// Get name from export record (which is last dependent of exported values).
					const importRecord = createRecord(last(exports[0].dependents).record.varNode.name),
						importVarNode = importRecord.varNode;
					importRecord.node = this.createImportOrRequireNode(relativePath, importVarNode);
					if (dependencyIsIncomplete) numPlaceholders++;

					// Create import values e.g. `importedVar[0]`
					for (const [exportIndex, importValueRecord] of Object.entries(importRecords)) {
						const importValueNode = t.memberExpression(
							importVarNode,
							t.numericLiteral(exportIndex * 1),
							true // computed
						);
						importValueRecord.node = importValueNode;
						createDependency(importValueRecord, importRecord, importValueNode, 'object');
					}
				}
			}

			if (filenameIsTemp) {
				output.awaitedBy = undefined;
				output.awaiting = undefined;
			}

			// Create export record
			const {exports} = output;
			let exportRecord;
			if (exports.length === 1) {
				exportRecord = exports[0];
			} else {
				exportRecord = createRecord(output.name || exports.map(record => record.varNode.name).join('_'));
				const arrayNodes = [];
				exports.forEach((record, exportIndex) => {
					createDependency(exportRecord, record, arrayNodes, exportIndex);
					arrayNodes[exportIndex] = record.varNode;
				});
				exportRecord.node = t.arrayExpression(arrayNodes);
				exportRecord.output = output;
			}

			// Generate JS
			const {js, map} = this.generateOutputJsAndSourceMap(output, exportRecord);

			// If JS contains no placeholders for circular outputs, finalize immediately
			if (awaiting.size === 0) {
				if (filenameIsTemp) output.filename = this.getOutputFilenameAndHash(output, js).filename;
				finalizeOutput(output, js, map);
				return;
			}

			// JS contains placeholders for circular outputs - defer finalizing until they're resolved.
			// Hash JS - but first replace placeholder hashes with uniform placeholder hash
			// so hash of content is not dependent on output indexes, which are unstable.
			let numReplacements = 0;
			const replacements = new Map(); // Keyed by output
			const jsForHashing = js.replace(placeholderRegex, (whole, outputIndex, position) => {
				if (whole.length !== HASH_LENGTH) return whole;

				const dependentOutput = outputIndexToOutputMap[outputIndex];
				let positions = replacements.get(dependentOutput);
				if (!positions) replacements.set(dependentOutput, positions = []);
				positions.push(position);

				numReplacements++;
				return uniformHashPlaceholder;
			});

			assert(
				numReplacements === numPlaceholders,
				`Cannot output code where source contains ${HASH_LENGTH}-character escape sequence comprising '${HASH_PLACEHOLDER_CHAR}'s followed by digits`
			);

			const contentHash = hashFileContent(jsForHashing);

			// Record details of this incomplete output
			incompleteOutputs.set(output, {js, map, hash: undefined, contentHash, replacements});

			// If awaiting other outputs, record that, and leave output incomplete
			awaiting.delete(output);
			if (awaiting.size > 0) {
				for (const waiter of awaitedBy) {
					// "You're not waiting on me any more"
					if (waiter.awaiting) waiter.awaiting.delete(output);
				}

				for (const awaitedOutput of awaiting) {
					// "I am waiting on you"
					const awaitedAwaitedBy = awaitedOutput.awaitedBy;
					awaitedAwaitedBy.add(output);

					for (const waiter of awaitedBy) {
						// "This guy is waiting on you too"
						awaitedAwaitedBy.add(waiter);
						// "You (who was previously waiting on me) are now waiting on this guy"
						if (waiter.awaiting) waiter.awaiting.add(awaitedOutput);
					}
				}

				if (filenameIsTemp) output.awaiting = awaiting;
				return;
			}

			// This output completes cycle.
			// Generate filenames for all in cycle.
			awaitedBy.add(output);
			for (const awaitedOutput of awaitedBy) {
				// Create final hash from concatenation of content hashes of all outputs involved in cycle,
				// with this output's content hash first
				const incompleteOutputProps = incompleteOutputs.get(awaitedOutput);
				let hashes = incompleteOutputProps.contentHash;
				for (const otherOutput of awaitedBy) {
					if (otherOutput !== awaitedOutput) hashes += incompleteOutputs.get(otherOutput).contentHash;
				}

				const finalFilenameAndHash = this.getOutputFilenameAndHash(awaitedOutput, hashes);
				awaitedOutput.filename = finalFilenameAndHash.filename;
				incompleteOutputProps.hash = finalFilenameAndHash.hash;
			}

			// Generate files for all in cycle
			for (const awaitedOutput of awaitedBy) {
				const incompleteOutputProps = incompleteOutputs.get(awaitedOutput);
				let finalJs = incompleteOutputProps.js;
				for (const [dependentOutput, positions] of incompleteOutputProps.replacements) {
					const {hash} = incompleteOutputs.get(dependentOutput);
					for (const position of positions) {
						finalJs = stringSplice(finalJs, position, HASH_LENGTH, hash);
					}
				}
				finalizeOutput(awaitedOutput, finalJs, incompleteOutputProps.map);
			}

			// Clean up
			for (const awaitedOutput of awaitedBy) {
				awaitedOutput.awaiting = undefined;
				incompleteOutputs.delete(awaitedOutput);
			}
		};

		// Process outputs
		for (const output of entryPointOutputs) {
			processOutput(output);
		}

		// Output stats file
		if (options.stats) files.push(this.outputStatsFile(files));

		return files;
	},

	generateOutputJsAndSourceMap(output, record) {
		// Get format
		const {options} = this;
		let {format, strictEnv} = options;
		if (output.type === ENTRY_POINT) {
			if (options.exec) format = 'exec';
		} else {
			if (format === 'js') format = 'cjs';
			strictEnv = format === 'esm';
		}

		// Compile file as AST
		const node = this.outputAst(record, output, format, strictEnv);

		// Compile to JS
		const {sourceMaps} = options;
		let {js, map} = this.generateJs(node, sourceMaps); // eslint-disable-line prefer-const

		if (sourceMaps) {
			// Convert source map paths to relative if `outputDir` option provided
			if (options.outputDir) {
				const fileOutputDir = pathJoin(options.outputDir, output.filename, '..');
				map.sources = map.sources.map(path => getRelativePathFromDir(fileOutputDir, path));
			}

			// Add source map comment.
			// URL/inline map content not added at this stage as don't want it to affect hash of the file.
			// It will be appended later after hashes have been calculated.
			js += '\n//# sourceMappingURL=';
			if (sourceMaps === 'inline') js += 'data:application/json;charset=utf-8;base64,';
		}

		return {js, map};
	},

	generateJs(node, sourceMaps) {
		const {options} = this,
			{minify} = options;
		let {code: js, map} = generate(node, { // eslint-disable-line prefer-const
			minified: minify,
			compact: minify,
			comments: options.comments,
			sourceMaps,
			shouldPrintComment: options.shouldPrintComment
		}, sourceMaps ? this.sourceFiles : undefined);

		// Remove trailing semicolon in `minify` mode
		if (minify && js.slice(-1) === ';') js = js.slice(0, -1);

		return {js, map};
	},

	generateOutputFiles(output, js, map) {
		// Add source map
		const files = [],
			{filename} = output,
			{options} = this,
			{sourceMaps} = options;
		if (sourceMaps === 'inline') {
			js += sourceMapFromObject(map).toBase64();
		} else if (sourceMaps) {
			const mapFilename = `${filename}.${options.mapExt}`;
			js += mapFilename.replace(/^.+\//, '');
			files[1] = {
				type: 'source map',
				name: null,
				filename: mapFilename,
				content: sourceMapFromObject(map).toJSON()
			};
		}

		// Add trailing newline
		if (!options.minify) js += '\n';

		// Return file objects
		files[0] = {
			type: getOutputTypeName(output),
			name: output.name || null,
			filename,
			content: js
		};

		return files;
	},

	/**
	 * Compile AST for output file.
	 * @param {Object} record - Record for value file exports
	 * @param {Object} output - Output object
	 * @param {string} format - Output format
	 * @param {boolean} strictEnv - `true` if code will run in strict mode environment
	 * @returns {Object} - Babel AST node for file
	 */
	outputAst(record, output, format, strictEnv) {
		// Prepare export record
		const exportRecord = createRecord('x');
		createDependency(exportRecord, record);
		if (format === 'exec') {
			exportRecord.serializer = () => t.expressionStatement(
				t.callExpression(this.serializeValue(record), [])
			);
		} else if (format === 'js') {
			exportRecord.serializer = () => t.returnStatement(this.serializeValue(record));
		} else if (format === 'cjs') {
			exportRecord.serializer = () => t.expressionStatement(
				t.assignmentExpression(
					'=',
					t.memberExpression(t.identifier('module'), t.identifier('exports')),
					this.serializeValue(record)
				)
			);
		} else { // ESM
			exportRecord.serializer = () => t.exportDefaultDeclaration(this.serializeValue(record));
		}

		// Determine if requires top level 'use strict' directive
		let modifyStrictRecords,
			addTopLevelUseStrictDirective;
		if (strictEnv) {
			// Strict env - any sloppy functions need wrapping
			modifyStrictRecords = output.sloppyFnRecords;
			addTopLevelUseStrictDirective = false;
		} else if (output.sloppyFnRecords.size === 0) {
			// All functions are strict mode or indeterminate, or no functions at all
			const numStrictFns = output.strictFnRecords.size;
			if (numStrictFns === 1 && format === 'js') {
				// Only 1 function and JS output format.
				// Add 'use strict' directive to function to avoid wrapping function.
				modifyStrictRecords = output.strictFnRecords;
				addTopLevelUseStrictDirective = false;
			} else {
				// 0 or 2+ strict functions.
				// If any strict functions, add 'use strict' directive at top level.
				modifyStrictRecords = new Set();
				addTopLevelUseStrictDirective = numStrictFns !== 0;
				strictEnv = addTopLevelUseStrictDirective;
			}
		} else {
			// All sloppy, or mix of strict, sloppy and indeterminate.
			// Add 'use strict' directives to strict functions.
			modifyStrictRecords = output.strictFnRecords;
			addTopLevelUseStrictDirective = false;
		}

		// Compile as set of statements
		const statementNodes = this.outputMain(exportRecord, strictEnv, modifyStrictRecords);

		// Compile node to generate code from
		if (format === 'js') {
			// Output as expression
			if (statementNodes.length === 1 && !addTopLevelUseStrictDirective) {
				// Only 1 statement - remove `return ...`
				return statementNodes[0].argument;
			}

			// Multiple statements or 'use strict' directive required - wrap in IIFE
			const blockNode = t.blockStatement(statementNodes);
			if (addTopLevelUseStrictDirective) addStrictDirectiveToBlock(blockNode);
			return t.callExpression(t.arrowFunctionExpression([], blockNode), []);
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
			const node = last(statementNodes);
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
		const programNode = t.program(statementNodes);
		if (addTopLevelUseStrictDirective) addStrictDirectiveToBlock(programNode);
		return programNode;
	},

	/**
	 * Output complex value (i.e. not primitive).
	 * @param {Object} record - Record for value to serialize
	 * @param {boolean} strictEnv - `true` if code will run in strict mode environment
	 * @param {Set} modifyStrictRecords - Set of function records that need strict/sloppy status
	 *   to be altered
	 * @returns {Array<Object>} - Program statements (Babel nodes)
	 */
	outputMain(record, strictEnv, modifyStrictRecords) { // eslint-disable-line no-unused-vars
		// TODO Handle strict mode

		// Init output state
		const importNodes = this.importNodes = [],
			varNodes = this.varNodes = [],
			assignmentNodes = this.assignmentNodes = [];
		this.transformVarName = this.createVarNameTransform(new Set(this.globalVarNames));

		// Serialize
		const node = this.serializeValueWithSerializer(record);

		// Compile statements array and return
		const statementNodes = [...importNodes];
		if (varNodes.length > 0) statementNodes.push(t.variableDeclaration('const', varNodes));
		if (assignmentNodes.length > 0) statementNodes.push(...assignmentNodes);
		statementNodes.push(node);
		return statementNodes;
	},

	/**
	 * Serialize record to AST.
	 * @param {Object} record - Value record
	 * @returns {Object} - AST node
	 */
	serializeValue(record) {
		// If already processed, return var node
		let {varNode} = record;
		if (varNode) return varNode;

		// Create var node
		varNode = t.identifier(this.transformVarName(record.name));
		record.varNode = varNode;

		// Serialize value
		let node = this.serializeValueWithSerializer(record);

		// Add to varNodes
		if (t.isImportDeclaration(node)) {
			// Add import statement to importNodes
			this.importNodes.push(node);
		} else {
			// If used more than once, assign to var
			const {dependents} = record;
			if (
				(!this.options.inline && record.type !== PRIMITIVE_TYPE)
				|| dependents.size > 1
				|| firstMapValue(dependents) > 1
			) {
				// Wrap unnamed functions in `(0, fn)` to prevent them getting implicitly named.
				if (
					record.serializer === this.serializeFunction
					&& (t.isClass(node) || t.isFunction(node))
					&& !node.id
				) {
					node = t.sequenceExpression([t.numericLiteral(0), node]);
				}

				this.varNodes.push(t.variableDeclarator(varNode, node));
				node = varNode;
			}
		}

		// Unflag as currently processing
		record.isCircular = false;

		// Return node
		return node;
	},

	serializeValueWithSerializer(record) {
		return record.serializer.call(this, record);
	},

	outputMainOld(record, strictEnv, modifyStrictRecords) {
		// Trace dependencies and create vars for each
		const transformVarName = this.createVarNameTransform(new Set(this.globalVarNames));
		const varNodes = [],
			statementNodes = [],
			importNodes = [],
			{mangle, inline} = this.options;

		const queue = [record],
			processing = new Map(); // Keyed by record, values = `true` for processed, `false` for processing
		const addDependencies = (valRecord) => {
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

			// Convert function to strict/sloppy mode
			let {node} = valRecord;
			if (modifyStrictRecords.has(valRecord)) {
				if (strictEnv) {
					// Sloppy function - wrap in `(0, eval())` to escape into sloppy mode
					node = this.wrapInIndirectEval(node, false);
				} else {
					// Strict function - add 'use strict' directive
					node = addStrictDirectiveToFunctionMaybeWrapped(node);
				}
			}

			// Add var definition to output
			const {dependents, assignments} = valRecord;
			const nodeIsImport = t.isImportDeclaration(node);
			if (inline && dependents.length === 1 && !nodeIsImport) {
				// Only used once - substitute content in place of var
				const {node: parentNode, key} = dependents[0];

				// Wrap unnamed functions used as object properties or `export default`
				// in `(0, fn)` to prevent them getting implicitly named.
				// NB `valRecord.scope` check is to avoid doing this for `createScope` functions.
				// Convert named function as default export to declaration to avoid being wrapped in brackets
				// i.e. `export default function f() {}` not `export default (function f() {})`.
				if ((t.isFunction(node) || t.isClass(node))) {
					if (node.id) {
						// Named function
						if (t.isExportDefaultDeclaration(parentNode)) {
							node.type = t.isClass(node) ? 'ClassDeclaration' : 'FunctionDeclaration';
						}
					} else if (
						valRecord.scope && (
							(t.isObjectProperty(parentNode) && key === 'value')
							|| t.isExportDefaultDeclaration(parentNode)
						)
					) {
						// Unnamed function - Wrap in `(0, ...)`
						node = t.sequenceExpression([t.numericLiteral(0), node]);
					}
				}

				// Unwrap `{x: {x() {}}.x}` to `{x() {}}`
				if (
					(t.isObjectProperty(parentNode) && key === 'value')
					&& !parentNode.computed && isWrappingMethod(node, parentNode.key)
				) {
					replaceNode(parentNode, node.object.properties[0]);
					node = null;
				}

				if (node) parentNode[key] = node;
			} else {
				// Create variable to hold this value
				const {varNode} = valRecord;
				varNode.name = transformVarName(mangle ? null : toJsIdentifier(varNode.name));

				if (!nodeIsImport) {
					// Wrap unnamed functions in `(0, fn)` to prevent them getting implicitly named.
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
		};

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

		processQueue();

		// Add var definitions statement
		if (varNodes.length > 0) statementNodes.unshift(t.variableDeclaration('const', varNodes));

		// Add import statements
		if (importNodes.length > 0) statementNodes.unshift(...importNodes);

		return statementNodes;
	},

	wrapInIndirectEval(node, isStrict) {
		let {js} = this.generateJs(t.expressionStatement(node), false);
		if (isStrict) js = `"use strict";${js}`;
		return t.callExpression(
			t.sequenceExpression([t.numericLiteral(0), t.identifier('eval')]),
			[t.stringLiteral(js)]
		);
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
