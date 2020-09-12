/* --------------------
 * livepack module
 * Serializer class
 * ------------------*/

'use strict';

// Modules
const generate = require('@babel/generator').default,
	{fromObject: sourceMapFromObject, generateMapFileComment} = require('convert-source-map'),
	t = require('@babel/types');

// Imports
const valueMethods = require('./values.js'),
	functionMethods = require('./functions.js'),
	objectMethods = require('./objects.js'),
	arrayMethods = require('./arrays.js'),
	setMapMethods = require('./setsMaps.js'),
	symbolMethods = require('./symbols.js'),
	bufferMethods = require('./buffers.js'),
	boxedMethods = require('./boxed.js'),
	otherMethods = require('./other.js'),
	traceMethods = require('./trace.js'),
	parseFunction = require('./parseFunction.js'),
	processBlock = require('./processBlock.js'),
	{createRecord, createBlock, createScope} = require('./records.js'),
	{createMangledVarNameTransform, createUnmangledVarNameTransform} = require('./varNames.js'),
	{toJsIdentifier, replaceRecordNode} = require('./utils.js'),
	{COMMON_JS_VAR_NAMES} = require('../shared/constants.js');

// Exports

class Serializer {
	constructor(options) {
		this.options = options;
		this.records = new Map(); // Keyed by value
		this.files = Object.create(null); // Keyed by file path

		this.rootBlock = createBlock(0, 'root', null);
		this.rootScope = createScope(null, this.rootBlock, null);

		this.createVarNameTransform = options.mangle
			? createMangledVarNameTransform
			: createUnmangledVarNameTransform;

		this.globalVarNames = ['cjs', 'js'].includes(options.format) ? [...COMMON_JS_VAR_NAMES] : [];

		this.prototypes = new Map(); // Keyed by prototype object

		this.sourceFiles = Object.create(null); // Keyed by file path

		this.traceStack = undefined;
	}

	/**
	 * Serialize value to Javascript code.
	 * @param {*} val - Value to serialize
	 * @returns {string} - Javascript code
	 */
	serialize(val) {
		this.initTrace();

		// Process value into Babel node
		const record = this.serializeValue(val, 'exports', '<root>'),
			{dependents} = record;

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
		let statementNodes;
		if (!dependents) {
			// Primitive
			statementNodes = [exportNode];
		} else {
			// Non-primitive
			dependents.push({node: exportTarget, key: exportKey});
			statementNodes = this.serializeMain(record);
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

				// Workaround for https://github.com/babel/babel/issues/12055
				// TODO Remove this when issue is resolved
				if (
					t.isArrowFunctionExpression(generateFromNode) && t.isObjectExpression(generateFromNode.body)
				) generateFromNode.body = t.parenthesizedExpression(generateFromNode.body);
			} else {
				// Multiple statements - wrap in IIFE
				generateFromNode = t.callExpression(
					t.arrowFunctionExpression([], t.blockStatement(statementNodes)), []
				);
			}

			removeTrailingSemicolon = false;
		} else {
			if (format === 'exec') {
				// Output as function expression to be immediately executed
				const node = exportNode.expression.callee;
				if (t.isFunction(node) && !node.id) {
					// Export is a function (as opposed to a var) - unwrap contents of function body.
					// NB Not unwrapped if function is named as it may refer to itself internally.
					// TODO Could optimize by checking if function name is referred to in function body,
					// and unwrapping if not.
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

		let mapFilename;
		const outputFiles = options.files;
		if (sourceMaps) {
			if (outputFiles) {
				mapFilename = `${filename}.map`;
				js += `\n${generateMapFileComment(mapFilename)}`;
			} else {
				js += `\n${sourceMapFromObject(map).toComment()}`;
			}
		}

		// Add trailing newline
		if (!minify) js += '\n';

		// If `files` option not set, output JS string
		if (!outputFiles) return js;

		// `files` option set - output array of objects each of form `{path, content}`
		const files = [{filename, content: js}];

		if (sourceMaps) {
			const mapContent = sourceMapFromObject(map).toJSON();
			files.push({filename: mapFilename, content: mapContent});
		}

		return files;
	}

	/**
	 * Serialize complex value (i.e. not primitive).
	 * @param {Object} record - Record for value to serialize
	 * @returns {Array<Object>} - Program statements (Babel nodes)
	 */
	serializeMain(record) {
		const {inline} = this.options;

		// Create scopes and functions
		const {rootBlock, rootScope} = this;
		createMissingScopes(rootBlock, null);

		const createScopeRecord = createRecord('createScopeRoot');

		const parentCreateScopes = new Map([[null, createScopeRecord]]);
		const {node: blockNode, globalVarNames: functionsGlobalVarNames} = this.processBlock(
			rootBlock, parentCreateScopes, Object.create(null), true
		);
		const {elements} = blockNode.body;

		const globalVarNames = new Set([...this.globalVarNames, ...functionsGlobalVarNames]);

		// Flatten out contents of global scope
		const rootScopeRecord = rootScope.record;
		for (const {record: dependentRecord} of rootScopeRecord.dependents) {
			// Substitute global scope calls for functions
			replaceRecordNode(dependentRecord, elements.shift());

			dependentRecord.dependencies = dependentRecord.dependencies.filter(
				dependency => dependency.record !== rootScopeRecord
			);
		}

		// Trace dependencies and create vars for each
		const transformVarName = this.createVarNameTransform(globalVarNames);
		const varNodes = [],
			statementNodes = [],
			importNodes = [],
			{mangle} = this.options;

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
}

function createMissingScopes(block, parentBlock) {
	for (const scope of block.scopes.values()) {
		// If scope's parent is not in block's parent, select a scope for it
		// (any which is nested in scope's current parent will work).
		let parentScope = scope.parent;
		const currentParentBlock = parentScope && parentScope.block;
		if (currentParentBlock === parentBlock) continue;

		// Get missing blocks
		const missingBlocks = [parentBlock];
		let thisBlock = parentBlock;
		while (true) { // eslint-disable-line no-constant-condition
			thisBlock = thisBlock.parent;
			if (thisBlock === currentParentBlock) break;
			missingBlocks.unshift(thisBlock);
		}

		let possibleParentScopes = new Set([parentScope]);
		let index;
		for (index = 0; index < missingBlocks.length; index++) {
			const interveningBlock = missingBlocks[index];
			const possibleScopes = new Set();
			for (const possibleScope of interveningBlock.scopes.values()) {
				if (possibleParentScopes.has(possibleScope.parent)) possibleScopes.add(possibleScope);
			}
			if (possibleScopes.size === 0) break;
			possibleParentScopes = possibleScopes;
		}

		parentScope = possibleParentScopes.values().next().value;

		// If some missing scopes not existing, create them
		for (; index < missingBlocks.length; index++) {
			const missingBlock = missingBlocks[index];
			parentScope = createScope(null, missingBlock, parentScope);
		}

		// Set new parent
		scope.parent = parentScope;
	}

	// Traverse through child blocks
	for (const childBlock of block.children) {
		createMissingScopes(childBlock, block);
	}
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

Object.assign(
	Serializer.prototype,
	valueMethods,
	functionMethods,
	objectMethods,
	arrayMethods,
	setMapMethods,
	symbolMethods,
	bufferMethods,
	boxedMethods,
	otherMethods,
	traceMethods,
	{parseFunction, processBlock}
);

module.exports = Serializer;
