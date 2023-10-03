/* --------------------
 * livepack module
 * Output methods
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, relative: pathRelative, dirname} = require('path').posix,
	{CodeGenerator} = require('@babel/generator'),
	sourceMapFromObject = require('convert-source-map').fromObject,
	last = require('lodash/last'),
	t = require('@babel/types');

// Imports
const {createRecord, createDependency} = require('./records.js'),
	{getOutputTypeName, hashFileContent} = require('./filenames.js'),
	{addStrictDirectiveToFunctionMaybeWrapped, addStrictDirectiveToBlock} = require('./strict.js'),
	{toJsIdentifier, setAddFrom, firstMapValue} = require('./utils.js'),
	{HASH_LENGTH, HASH_PLACEHOLDER_CHAR, ENTRY_POINT} = require('./constants.js'),
	{
		PRIMITIVE_TYPE, GLOBAL_TYPE, UNDEFINED_TYPE, FUNCTION_TYPE,
		EXPORT_JS_TYPE, EXPORT_COMMONJS_TYPE, EXPORT_ESM_TYPE, EXPORT_EXEC_TYPE,
		SERIALIZERS, registerSerializer
	} = require('./types.js');

// Constants
const uniformHashPlaceholder = HASH_PLACEHOLDER_CHAR.repeat(HASH_LENGTH),
	placeholderRegex = new RegExp(`${HASH_PLACEHOLDER_CHAR}+\\d+`, 'g'),
	STRING_POSITIONS = Symbol('livepack.STRING_POSITIONS');

// Exports

module.exports = {
	/**
	 * Init output vars.
	 * @returns {undefined}
	 */
	initOutput() {
		this.localVars = undefined;
		this.globalVars = undefined;
		this.importVars = undefined;
		this.assignmentNodes = undefined;
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
				filenamePositionsMap = new Map(); // Keyed by output
			for (const [dependencyOutput, {importRecords, importFnRecords}] of output.dependencies.entries()) {
				// Process output this depends on
				processOutput(dependencyOutput);

				const relativePathStrNode = t.stringLiteral(getRequirePath(filename, dependencyOutput.filename)),
					dependencyIsIncomplete = !!dependencyOutput.awaiting;
				if (dependencyIsIncomplete) {
					setAddFrom(awaiting, dependencyOutput.awaiting);

					const filenamePositions = [];
					filenamePositionsMap.set(dependencyOutput, filenamePositions);
					relativePathStrNode[STRING_POSITIONS] = filenamePositions;
				}

				// Create import statements
				const {exports} = dependencyOutput;
				if (exports.length === 1) {
					// Default export only - create import statement
					const importRecord = importRecords[0];
					if (importRecord) {
						importRecord.node = this.createImportOrRequireNode(
							relativePathStrNode, importRecord.varNode
						);
					}

					// Create dynamic imports
					for (const importFnRecord of importFnRecords) {
						importFnRecord.node = t.arrowFunctionExpression(
							[], t.callExpression(t.import(), [relativePathStrNode])
						);
					}
				} else {
					// Multiple exports.
					// Create import statement (e.g. `import importedVar from './xxx.js'`).
					// Get name from export record (which is last dependent of exported values).
					const importRecord = createRecord(last(exports[0].dependents).record.varNode.name),
						importVarNode = importRecord.varNode;
					importRecord.node = this.createImportOrRequireNode(relativePathStrNode, importVarNode);

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
			let jsForHashing = js;
			for (const filenamePositions of filenamePositionsMap.values()) {
				jsForHashing = replacePlaceholders(jsForHashing, filenamePositions, uniformHashPlaceholder);
			}
			const contentHash = hashFileContent(jsForHashing);

			// Record details of this incomplete output
			incompleteOutputs.set(output, {js, map, hash: undefined, contentHash, filenamePositionsMap});

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
				for (const [dependentOutput, positions] of incompleteOutputProps.filenamePositionsMap) {
					const {hash} = incompleteOutputs.get(dependentOutput);
					finalJs = replacePlaceholders(finalJs, positions, hash);
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

	/**
	 * Generate JS string from AST node.
	 * Uses `CodeGenerator` class instead of `generate()` to remove final semicolon in `minify` mode.
	 * Babel does not offer an option for this, and just removing a final semicolon with `js.slice(0, -1)`
	 * can result in invalid code where final semicolon is an empty statement.
	 * e.g. if input is `() => { if (1) ; }` and `exec` option is set.
	 *
	 * @param {Object} node - AST node for program
	 * @param {boolean} sourceMaps - `true` if source maps enabled
	 * @returns {string} - Javascript code
	 */
	generateJs(node, sourceMaps) {
		const {options} = this,
			{minify} = options;
		const generator = new CodeGenerator(
			node,
			{
				minified: minify,
				compact: minify,
				comments: options.comments,
				sourceMaps,
				shouldPrintComment: options.shouldPrintComment
			},
			sourceMaps ? this.sourceFiles : undefined
		)._generator;

		// Shim generator's `StringLiteral` method to capture positions of import paths
		const {StringLiteral} = generator;
		generator.StringLiteral = function(strNode) {
			const startPos = this._buf._str.length; // NB: A space may be inserted after this
			StringLiteral.call(this, strNode);
			if (strNode[STRING_POSITIONS]) strNode[STRING_POSITIONS].push([startPos, this._buf._str.length]);
		};

		if (minify) {
			// Patch generator to remove final semi-colon if not required
			// TODO: Remove this if https://github.com/babel/babel/issues/14160 is resolved
			const {Program} = generator;
			generator.Program = function(programNode) {
				Program.call(this, programNode);
				this._buf.removeLastSemicolon();
			};
		}

		const {code: js, map} = generator.generate();
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
		exportRecord.extra = {valueRecord: record};
		createDependency(exportRecord, record);
		if (format === 'exec') {
			exportRecord.type = EXPORT_EXEC_TYPE;
		} else if (format === 'js') {
			exportRecord.type = EXPORT_JS_TYPE;
		} else if (format === 'cjs') {
			exportRecord.type = EXPORT_COMMONJS_TYPE;
		} else { // ESM
			exportRecord.type = EXPORT_ESM_TYPE;
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
			// TODO: Could optimize last 2 cases by checking if function name/params
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
		const importVars = this.importVars = [],
			localVars = this.localVars = [],
			assignmentNodes = this.assignmentNodes = [],
			globalVars = this.globalVars = [];

		// Serialize
		const node = this.serializeValueWithSerializer(record);

		// Compile statements array and return
		if (globalVars.length > 0) {
			if (this.options.inline) {
				const usedGlobalVars = globalVars.filter(({record: globalRecord, node: globalNode}) => {
					// Can't use `recordNeedsVar()` because globals don't have dependents
					if (globalRecord.usageCount !== 1) return true;

					// Only used once - inline
					Object.assign(globalRecord.varNode, globalNode);
					return false;
				});
				if (usedGlobalVars.length > 0) localVars.unshift(...usedGlobalVars);
			} else {
				localVars.unshift(...globalVars);
			}
		}

		const statementNodes = [];
		if (localVars.length > 0 || importVars.length > 0) {
			const transformVarName = this.createVarNameTransform(new Set(this.globalVarNames)),
				{mangle} = this.options;

			for (const importVar of importVars) {
				// TODO: Is `toJsIdentifier()` required here or are names already always legal?
				// (they are for NodeJS built-in modules, but maybe not for modules Livepack creates)
				importVar.record.varNode.name = transformVarName(importVar.record.name);
				statementNodes.push(importVar.node);
			}

			if (localVars.length > 0) {
				statementNodes.push(t.variableDeclaration('const', localVars.map(
					({record: localRecord, node: localNode}) => {
						const {varNode} = localRecord;
						varNode.name = transformVarName(mangle ? null : toJsIdentifier(localRecord.name));
						return t.variableDeclarator(varNode, localNode);
					}
				)));
			}
		}

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
		// If is primitive, serialize. Primitive are always inlined.
		const {type} = record;
		if ((type & PRIMITIVE_TYPE) && type !== UNDEFINED_TYPE) { // eslint-disable-line no-bitwise
			return this.serializeValueWithSerializer(record);
		}

		// Increment usage count for globals
		const isGlobal = !!(type & GLOBAL_TYPE) || type === UNDEFINED_TYPE; // eslint-disable-line no-bitwise
		if (isGlobal) record.usageCount++;

		// If already serialized, return var node
		let {varNode} = record;
		if (varNode) return varNode;

		// Create var node
		varNode = t.identifier(record.name);
		record.varNode = varNode;

		// Serialize value
		record.isCircular = true;
		let node = this.serializeValueWithSerializer(record);
		record.isCircular = false;

		// Add to varNodes
		if (t.isImportDeclaration(node)) {
			// Add import statement to `importVars`
			this.importVars.push({record, node});
			node = varNode;
		} else if (isGlobal) {
			// Global - assign to var. Globals which are only used once are inlined later.
			// Use a fake `Identifier` node with no `name` property as `varNode`.
			// If is inlined later, this removes the need to delete the `name` property again.
			this.globalVars.push({record, node});
			node = record.varNode = {type: 'Identifier'};
		} else if (this.recordNeedsVar(record)) {
			// Used more than once - assign to var.
			// Wrap unnamed functions in `(0, fn)` to prevent them getting implicitly named.
			this.localVars.push({record, node: withFunctionWrapper(node, record)});
			node = varNode;
		}

		// Return node
		return node;
	},

	serializeValueWithSerializer(record) {
		return SERIALIZERS[record.type].call(this, record);
	},

	recordNeedsVar(record) {
		if (!this.options.inline) return true;

		const {usageCount} = record;
		if (usageCount > 1) return true;

		const {dependents} = record;
		return usageCount + dependents.size > 1 || usageCount + firstMapValue(dependents) > 1;
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
				// NB: `valRecord.scope` check is to avoid doing this for `createScope` functions.
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
					// NB: `valRecord.scope` check is to avoid doing this for `createScope` functions.
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
		const {js} = this.generateJs(
			t.program(
				[t.expressionStatement(node)],
				isStrict ? [t.directive(t.directiveLiteral('use strict'))] : []
			),
			false
		);

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
 * Where node is an unnamed function, wrap in `(0, )` to prevent being named.
 * Used where function being placed in a position where it would gain name implicitly.
 * e.g. `x = ...`, `{x: ...}`
 * @param {Object} node - AST node
 * @param {Object} record - Record
 * @returns {Object} - AST node
 */
function withFunctionWrapper(node, record) {
	if (
		record.type === FUNCTION_TYPE
		&& (t.isClass(node) || t.isFunction(node))
		&& !node.id
	) {
		return t.sequenceExpression([t.numericLiteral(0), node]);
	}
	return node;
}

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

/**
 * Replace placeholder hashes in code with real hashes.
 * Handles case where `%%%%%%%1` placeholder is followed by further digits.
 * @param {string} js - Code to make replacements in
 * @param {Array<Array<number>>} positions - Array of positions where filenames appear in code
 *   in pairs of `[startPos, endPos]`
 * @param {string} hash - Hash to replace placeholders with. Must be `HASH_LENGTH` chars long.
 * @returns {string} - Code with replacements made
 */
function replacePlaceholders(js, positions, hash) {
	for (const [startPos, endPos] of positions) {
		js = js.slice(0, startPos)
			+ js.slice(startPos, endPos).replace(placeholderRegex, whole => hash + whole.slice(HASH_LENGTH))
			+ js.slice(endPos);
	}
	return js;
}

/**
 * Serialize JS export.
 * @this Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {Object} record.extra.valueRecord - Value record
 * @returns {Object} - AST node
 */
function serializeExportJs(record) {
	return t.returnStatement(this.serializeValue(record.extra.valueRecord));
}
registerSerializer(EXPORT_JS_TYPE, serializeExportJs);

/**
 * Serialize CommonJS export.
 * @this Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {Object} record.extra.valueRecord - Value record
 * @returns {Object} - AST node
 */
function serializeExportCommonJs(record) {
	return t.expressionStatement(
		t.assignmentExpression(
			'=',
			t.memberExpression(t.identifier('module'), t.identifier('exports')),
			this.serializeValue(record.extra.valueRecord)
		)
	);
}
registerSerializer(EXPORT_COMMONJS_TYPE, serializeExportCommonJs);

/**
 * Serialize ESM export.
 * @this Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {Object} record.extra.valueRecord - Value record
 * @returns {Object} - AST node
 */
function serializeExportEsm(record) {
	const {valueRecord} = record.extra;
	// Wrap unnamed function in `(0, ...)` to prevent it getting named
	return t.exportDefaultDeclaration(
		withFunctionWrapper(this.serializeValue(valueRecord), valueRecord)
	);
}
registerSerializer(EXPORT_ESM_TYPE, serializeExportEsm);

/**
 * Serialize exec export.
 * @this Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {Object} record.extra.valueRecord - Value record
 * @returns {Object} - AST node
 */
function serializeExportExec(record) {
	return t.expressionStatement(
		t.callExpression(this.serializeValue(record.extra.valueRecord), [])
	);
}
registerSerializer(EXPORT_EXEC_TYPE, serializeExportExec);
