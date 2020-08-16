/* --------------------
 * livepack module
 * Serializer class
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	generate = require('@babel/generator').default,
	{fromObject: sourceMapFromObject, generateMapFileComment} = require('convert-source-map'),
	{upperFirst} = require('lodash'),
	t = require('@babel/types');

// Imports
const valueMethods = require('./values.js'),
	functionMethods = require('./functions.js'),
	objectMethods = require('./objects.js'),
	arrayMethods = require('./arrays.js'),
	setMapMethods = require('./setsMaps.js'),
	symbolMethods = require('./symbols.js'),
	boxedMethods = require('./boxed.js'),
	otherMethods = require('./other.js'),
	{createRecord, createBlock, createScope, createDependency, createAssignment} = require('./records.js'),
	{createMangledVarNameTransform, createUnmangledVarNameTransform} = require('./varNames.js'),
	{toJsIdentifier, setAddFrom} = require('./utils.js'),
	{transpiledFiles} = require('../internal.js');

// Exports

class Serializer {
	constructor(options) {
		this.options = options;
		this.records = new Map(); // Keyed by value
		this.files = Object.create(null); // Keyed by file path

		this.rootBlock = createBlock(null, 'root');
		this.rootScope = createScope(null, this.rootBlock, null);

		this.createVarNameTransform = options.mangle
			? createMangledVarNameTransform
			: createUnmangledVarNameTransform;

		this.globalVarNames = options.format === 'cjs'
			? ['module', 'exports', 'require', '__dirname', '__filename']
			: [];

		this.prototypes = new Map(); // Keyed by prototype object
	}

	/**
	 * Serialize value to Javascript code.
	 * @param {*} val - Value to serialize
	 * @returns {string} - Javascript code
	 */
	serialize(val) {
		// Process value into Babel node
		const record = this.serializeValue(val, 'exports');

		// Compile as set of statements
		let node, statementNodes;
		if (!record.dependents) {
			// Primitive
			node = record.varNode;
			statementNodes = [];
		} else {
			// Non-primitive
			({node, statementNodes} = this.serializeMain(record));
		}

		// Add export statement
		const {options} = this,
			format = options.exec ? 'exec' : options.format;
		let removeBrackets = false;
		if (format === 'exec') {
			if (statementNodes.length === 0 && t.isFunction(node) && !node.id) {
				const bodyNode = node.body;
				if (t.isBlockStatement(bodyNode)) {
					statementNodes = bodyNode.body;
				} else {
					statementNodes = [t.expressionStatement(bodyNode)];
				}
			} else {
				statementNodes.push(t.expressionStatement(t.callExpression(node, [])));
			}
		} else if (format === 'js') {
			// Javascript expression
			if (statementNodes.length === 0) {
				statementNodes = [t.expressionStatement(t.parenthesizedExpression(node))];
				removeBrackets = true;
			} else {
				statementNodes.push(t.returnStatement(node));
				statementNodes = [t.expressionStatement(
					t.callExpression(
						t.arrowFunctionExpression(
							[], t.blockStatement(statementNodes)
						), []
					)
				)];
			}
		} else if (format === 'cjs') {
			// CommonJS
			statementNodes.push(
				t.expressionStatement(
					t.assignmentExpression(
						'=',
						t.memberExpression(t.identifier('module'), t.identifier('exports')),
						node
					)
				)
			);
		} else {
			// ESM
			statementNodes.push(t.exportDefaultDeclaration(node));
		}

		// Get mappings from source file paths to source code for source maps
		const {sourceMaps, minify} = options;
		let sourceMappings;
		if (sourceMaps) {
			sourceMappings = Object.create(null);
			for (const filePath of Object.keys(this.files)) {
				const {sources, sourceRoot, sourcesContent} = transpiledFiles[filePath].map;
				sources.forEach((filename, index) => {
					sourceMappings[`${sourceRoot}${filename}`] = sourcesContent[index].replace(/\t/g, ' ');
				});
			}
		}

		// Compile to JS
		const programNode = t.program(statementNodes);
		let {code: js, map} = generate(programNode, { // eslint-disable-line prefer-const
			minified: minify,
			compact: minify,
			comments: options.comments,
			sourceMaps
		}, sourceMappings);

		// Remove final semicolon
		if (format === 'js' || minify) js = js.slice(0, -1);

		// Remove enclosing brackets in JS format
		if (removeBrackets) js = js.slice(1, -1);

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
	 * @returns {Object}
	 * @returns {Object} .node - Babel node representing values
	 * @returns {Array<Object>} .statementNodes - Program statements (Babel nodes)
	 */
	serializeMain(record) {
		const {inline} = this.options;

		// Create scopes and functions
		const {rootBlock, rootScope} = this;
		const createScopeRecord = createRecord('createScopeRoot');

		const parentCreateScopes = new Map([[null, createScopeRecord]]);
		const {node: blockNode, globalVarNames: functionsGlobalVarNames} = this.processBlock(
			rootBlock, parentCreateScopes, Object.create(null), true
		);
		const {elements} = blockNode.body;

		const globalVarNames = new Set([...this.globalVarNames, ...functionsGlobalVarNames]);

		// Flatten out contents of global scope
		// TODO Can creation of dependencies on global scope be avoiding during creation,
		// rather than creating and then having to get rid of them again later?
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

				const wasOutput = addDependencies(valRecord);
				assert(wasOutput, 'Unresolved circular dependency');
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

		// Create pseudo-node for final export
		const exportsNode = {exports: record.varNode};
		record.dependents.push({node: exportsNode, key: 'exports'});

		processQueue();

		// Add var definitions statement
		if (varNodes.length > 0) statementNodes.unshift(t.variableDeclaration('const', varNodes));

		// Add import statements
		if (importNodes.length > 0) statementNodes.unshift(...importNodes);

		return {node: exportsNode.exports, statementNodes};
	}

	processBlock(block, parentCreateScopes, inheritedVars, isRoot) {
		const returnNodes = [];

		// Init local vars object to contain all var nodes for local vars
		// so they can have names changed if necessary
		const {paramNames} = block;
		const localVars = Object.create(null);
		for (const paramName of paramNames) {
			localVars[paramName] = [];
		}

		// Function to create functions to inject values into scope
		const injectionIndexes = Object.create(null);
		const injectionVarNodes = Object.create(null);
		function createInjection(paramName) {
			let index = injectionIndexes[paramName];
			if (index !== undefined) return index;

			const inputParamNode = t.identifier(`_${paramName}`);
			const outputParamNode = t.identifier(paramName);
			injectionVarNodes[paramName] = inputParamNode;
			localVars[paramName].push(outputParamNode);

			const injectNode = t.arrowFunctionExpression(
				[inputParamNode],
				t.assignmentExpression('=', outputParamNode, inputParamNode)
			);

			index = returnNodes.length;
			injectionIndexes[paramName] = index;
			returnNodes.push(injectNode);
			return index;
		}

		// Create scopes
		const blockScopes = block.scopes;
		for (const scope of blockScopes.values()) {
			// Create node for calling createScope function to create scope object
			const createScopeRecord = parentCreateScopes.get(scope.parentScope);

			const argumentNodes = [];
			const callNode = t.callExpression(createScopeRecord.varNode, argumentNodes);
			const scopeRecord = scope.record;
			scopeRecord.node = callNode;

			// Link scope object to createScope function
			createDependency(scopeRecord, createScopeRecord, callNode, 'callee');

			// Get parameters
			const {values} = scope;
			let numTrailingCircular = 0;
			let paramIndex = 0;
			for (const paramName of paramNames) {
				const valProps = values[paramName];
				let node;
				if (!valProps) {
					// Value not required - insert `0` as empty value
					node = t.numericLiteral(0);
					numTrailingCircular++;
				} else {
					const valRecord = valProps.record;
					node = valRecord.varNode;
					let {isCircular} = valProps;

					// If value is a function, and it's in this scope or one above, needs to be injected later.
					// Flag as circular if so. NB `.scope` property is only set for functions.
					let fnScope = valRecord.scope;
					if (fnScope) {
						while (true) { // eslint-disable-line no-constant-condition
							if (fnScope === scope) {
								isCircular = true;
								break;
							}

							fnScope = fnScope.parentScope;
							if (!fnScope) break;
						}
					}

					if (isCircular) {
						// Circular reference - inject into scope later
						const injectionIndex = createInjection(paramName);

						// Create var for inject function for this scope.
						// Each var will only be injected once into each scope, so no need to guard against
						// duplicate inject function vars being created.
						const injectRecord = createRecord(
							`inject${upperFirst(paramName)}Into${upperFirst(scopeRecord.varNode.name)}`
						);

						const injectFnNode = t.memberExpression(
							scopeRecord.varNode,
							t.numericLiteral(injectionIndex),
							true
						);
						injectRecord.node = injectFnNode;

						createDependency(injectRecord, scopeRecord, injectFnNode, 'object');

						// Create assignment
						const argumentsNode = [node];
						const assignmentNode = t.callExpression(injectRecord.varNode, argumentsNode);
						const assignment = createAssignment(scopeRecord, assignmentNode);
						createDependency(assignment, injectRecord, assignmentNode, 'callee');
						createDependency(assignment, valRecord, argumentsNode, 0);

						// Insert `0` as empty value
						node = t.numericLiteral(0);
						numTrailingCircular++;
					} else {
						createDependency(scopeRecord, valRecord, argumentNodes, paramIndex);
						numTrailingCircular = 0;
					}
				}

				argumentNodes[paramIndex] = node;
				paramIndex++;
			}

			// Trim off any trailing empty params
			if (numTrailingCircular > 0) argumentNodes.length -= numTrailingCircular;
		}

		// Determine if can output a singular value rather than an array
		// NB Root function always returns an array - it will be destructured in `serializeMain()`
		const {functions: blockFunctions, children: childBlocks} = block;
		let index = returnNodes.length;

		const isSingular = !isRoot
			&& index + blockFunctions.length + childBlocks.length === 1;

		// Create functions
		const globalVarNames = new Set(),
			reservedVarNames = new Set();
		for (const {
			node, scopes: fnScopes, externalVars, internalVars, globalVarNames: fnGlobalVarNames, functionNames
		} of blockFunctions) {
			for (const [scope, fnRecord] of fnScopes) {
				const scopeRecord = scope.record;

				let fnNode;
				if (isSingular) {
					// Will output singular function rather than array.
					// The scope object is defunct - can go direct to createScope function.

					// Copy over `createScope(...)` node created above
					fnNode = scopeRecord.node;
					scopeRecord.node = null;

					// Transfer dependencies from scope object to function instance
					const {dependencies} = fnRecord,
						scopeDependencies = scopeRecord.dependencies;
					for (const dependency of scopeDependencies) {
						dependencies.push(dependency);
						for (const dependent of dependency.record.dependents) {
							if (dependent.record === scopeRecord) dependent.record = fnRecord;
						}
					}
					scopeDependencies.length = 0;
				} else {
					// Will output array - link function instance to scope object
					fnNode = t.memberExpression(
						scopeRecord.varNode,
						t.numericLiteral(index),
						true
					);

					createDependency(fnRecord, scopeRecord, fnNode, 'object');
				}

				// Replace placeholder var with reference to scope var
				replaceRecordNode(fnRecord, fnNode);
			}

			// Add var nodes to globals/locals
			const fnReservedVarNames = new Set();
			for (const varName in externalVars) {
				const localVarNodes = localVars[varName];
				if (localVarNodes) {
					// Local var
					localVarNodes.push(...externalVars[varName]);
				} else {
					// Var referencing upper scope
					inheritedVars[varName].push(...externalVars[varName]);
				}
			}

			// Add global vars to globals
			for (const varName of fnGlobalVarNames) {
				globalVarNames.add(varName);
				fnReservedVarNames.add(varName);
			}

			// Add function names to reserved var names
			// Function names treated differently from internal vars as not renaming them,
			// but still need to make sure other vars don't clash with function names
			for (const fnName of functionNames) {
				reservedVarNames.add(fnName);
				fnReservedVarNames.add(fnName);
			}

			// Rename internal vars
			// Names avoid clashing with internal and globals vars used within this function
			const transformVarName = this.createVarNameTransform(fnReservedVarNames);
			for (const varName in internalVars) {
				const newName = transformVarName(varName);
				if (newName !== varName) {
					for (const varNode of internalVars[varName]) {
						varNode.name = newName;
					}
				}

				reservedVarNames.add(newName);
			}

			// Return function definition (as function/class expression)
			returnNodes[index++] = node;
		}

		const nextInheritedVars = Object.assign(Object.create(null), inheritedVars, localVars);

		// Create `createScope()` functions for child blocks
		for (const childBlock of childBlocks) {
			const createScopes = new Map();
			for (const scope of blockScopes.values()) {
				const scopeRecord = scope.record;
				const createScopeName = `createScope${upperFirst(childBlock.name)}`;

				if (isSingular) {
					// Will output singular createScope function.
					// Repurpose the scope object created above as the createScope function.
					// NB No need to do dependency linking - already done above.
					scopeRecord.varNode.name = createScopeName;
					createScopes.set(scope, scopeRecord);
				} else {
					// Will output array of functions - createScope function will be a element of scope array.
					const createScopeRecord = createRecord(createScopeName);

					const createScopeNode = t.memberExpression(
						scopeRecord.varNode,
						t.numericLiteral(index),
						true
					);
					createScopeRecord.node = createScopeNode;

					createDependency(createScopeRecord, scopeRecord, createScopeNode, 'object');

					createScopes.set(scope, createScopeRecord);
				}
			}

			const {
				node: childNode, globalVarNames: childGlobalVarNames, reservedVarNames: childReservedVarNames
			} = this.processBlock(childBlock, createScopes, nextInheritedVars);
			setAddFrom(globalVarNames, childGlobalVarNames);
			setAddFrom(reservedVarNames, childReservedVarNames);

			returnNodes[index++] = childNode;
		}

		// Rename params
		const transformVarName = this.createVarNameTransform(
			new Set([...globalVarNames, ...reservedVarNames])
		);

		const paramNodes = [];
		const {mangle} = this.options;
		for (const paramName of paramNames) {
			const newName = transformVarName(paramName);
			if (newName !== paramName) {
				// Rename all nodes
				for (const varNode of localVars[paramName]) {
					varNode.name = newName;
				}

				// Rename injection node
				const injectionVarNode = injectionVarNodes[paramName];
				if (injectionVarNode) {
					injectionVarNode.name = mangle // eslint-disable-line no-nested-ternary
						? (newName === 'a' ? 'b' : 'a')
						: `_${newName}`;
				}
			}

			reservedVarNames.add(newName);

			paramNodes.push(t.identifier(newName));
		}

		// Create block function
		// Function will return either array of functions or single function
		const node = t.arrowFunctionExpression(
			paramNodes,
			isSingular ? returnNodes[0] : t.arrayExpression(returnNodes)
		);

		// Return block function node, global var names + reserved var names
		return {node, globalVarNames, reservedVarNames};
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

/**
 * Replace node for a record, maintaining wrapping with `Object.assign()` etc
 * @param {Object} record - Record to replace node on
 * @param {Object} replacementNode - Babel node to inject in
 * @returns {undefined}
 */
function replaceRecordNode(record, replacementNode) {
	const originalNode = record.node;
	if (!t.isCallExpression(originalNode)) {
		record.node = replacementNode;
	} else {
		let argumentsNode = originalNode.arguments;
		while (t.isCallExpression(argumentsNode[0])) {
			argumentsNode = argumentsNode[0].arguments;
		}
		argumentsNode[0] = replacementNode;
	}
}

Object.assign(
	Serializer.prototype,
	valueMethods,
	functionMethods,
	objectMethods,
	arrayMethods,
	setMapMethods,
	symbolMethods,
	boxedMethods,
	otherMethods
);

module.exports = Serializer;
