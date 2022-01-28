/* --------------------
 * livepack module
 * Babel plugin identifier visitor
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {processArguments} = require('./thisArguments.js'),
	{processEval} = require('./eval.js'),
	{getBindingBlock, getVarAccessType} = require('./bindings.js'),
	recordVarUse = require('./vars.js'),
	{checkInternalVarNameClash} = require('./internalVars.js'),
	{identifierIsVariable, createArrayOrPush} = require('../shared/functions.js'),
	{
		COMMON_JS_LOCAL_VAR_NAMES,
		CONST_VIOLATION_CONST, CONST_VIOLATION_FUNCTION_THROWING, CONST_VIOLATION_FUNCTION_SILENT
	} = require('../shared/constants.js');

// Constants
const COMMON_JS_VARS = new Set(COMMON_JS_LOCAL_VAR_NAMES);

// Exports

/**
 * Visitor to track variable use.
 * @param {Object} identifierPath - Babel path object for identifer
 * @param {Object} state - State object
 * @returns {undefined}
 */
module.exports = function identifierVisitor(identifierPath, state) {
	// Skip identifiers not used as vars e.g. `{a: 1}`
	if (!identifierIsVariable(identifierPath)) return;

	// If var name could clash with internal var names, record this
	const {node, parentPath} = identifierPath,
		{name} = node;
	checkInternalVarNameClash(name, state);

	// Handle top-level vars
	const {currentFunction} = state;
	if (!currentFunction) {
		if (
			parentPath.isVariableDeclarator() && identifierPath.key === 'id'
			&& parentPath.parentPath.parentPath.isProgram()
		) {
			// Top-level var declaration - record it.
			// This is a hack to work around Babel not seeing vars created by
			// `@babel/plugin-transform-modules-commonjs` when binding is searched for later.
			// `.scope.getBinding()` returns undefined. So catalog them here and use the list
			// to identify their scope when they're encountered later.
			// https://github.com/babel/babel/issues/13665
			// TODO Find a better way to do this.
			state.topLevelVarNames.add(name);
		} else if (name === 'eval' && !identifierPath.scope.getBinding('eval')) {
			// Shim `eval` in top level scope
			processEval(identifierPath, state);
		}
		return;
	}

	// Skip function/class names where they are defined (i.e. `x` in `function x() {}`)
	if (identifierPath.key === 'id' && (parentPath.isFunction() || parentPath.isClass())) return;

	// Locate binding and handle
	let block, isConst, isSilentConst, isFunction;
	const binding = identifierPath.scope.getBinding(name);
	if (binding) {
		({block, isConst, isSilentConst, isFunction} = getBindingBlock(
			name, binding, identifierPath, state
		));
		if (isSilentConst && currentFunction.isStrict) isSilentConst = false;

		// Skip if identifier is a var local to function in which it's being used
		if (block.id >= currentFunction.id) {
			if (!isFunction) createArrayOrPush(currentFunction.internalVars, name, [...state.trail]);
			return;
		}
	} else if (state.topLevelVarNames.has(name)) {
		// Top-level var
		block = state.programBlock;
		isConst = true; // Assume vars added by other Babel plugins are consts
		isSilentConst = false;
		isFunction = false;
	} else {
		const parentVar = state.parentVars[name];
		if (parentVar) {
			// This is `eval`ed code and var is from scope outside `eval`
			if (name === 'arguments' && !state.currentFullFunction) {
				processArguments(identifierPath, state);
				return;
			}

			block = {
				id: parentVar.blockId,
				name: parentVar.blockName,
				varsBlock: {
					scopeIdVarNode: t.numericLiteral(parentVar.scopeId)
				}
			};
			isConst = parentVar.isConst;
			isSilentConst = parentVar.isSilentConst && !currentFunction.isStrict;
			isFunction = false; // Irrelevant if it is function or not, as will always be in external scope
		} else if (COMMON_JS_VARS.has(name)) {
			// Treat `exports` etc as external vars, not globals
			block = state.programBlock;
			isConst = false;
			isSilentConst = false;
			isFunction = false;
		} else {
			// Global var
			if (name === 'eval') {
				processEval(identifierPath, state);
			} else if (name === 'arguments' && state.currentFullFunction) {
				processArguments(identifierPath, state);
			} else if (currentFunction) {
				currentFunction.globalVarNames.add(name);
			}
			return;
		}
	}

	// Handle `arguments`
	if (name === 'arguments') {
		const {currentFullFunction} = state;
		if (currentFullFunction && block.id < currentFullFunction.id) {
			processArguments(identifierPath, state);
			return;
		}
	}

	// Determine if is const violation
	// eslint-disable-next-line prefer-const
	let {isReadFrom, isAssignedTo} = getVarAccessType(identifierPath);
	if (isAssignedTo && isConst) {
		currentFunction.amendments.unshift({
			type: isSilentConst
				? CONST_VIOLATION_FUNCTION_SILENT
				: isFunction
					? CONST_VIOLATION_FUNCTION_THROWING
					: CONST_VIOLATION_CONST,
			blockId: block.id,
			trail: [...state.trail]
		});
		if (!isReadFrom) return;
		isAssignedTo = false;
	}

	// Record variable use
	recordVarUse(name, block, isReadFrom, isAssignedTo, isFunction, true, state);
};
