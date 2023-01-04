/* --------------------
 * livepack module
 * Code instrumentation functions for handling internal vars (`livepack_tracker` etc)
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createBlockId} = require('./blocks.js'),
	{
		INTERNAL_VAR_NAMES_PREFIX, TRACKER_VAR_NAME_BODY, GET_SCOPE_ID_VAR_NAME_BODY,
		SCOPE_ID_VAR_NAME_BODY, TEMP_VAR_NAME_BODY, FN_INFO_VAR_NAME_BODY,
		LOCAL_EVAL_VAR_NAME_BODY
	} = require('../shared/constants.js');

// Exports

module.exports = {
	createTrackerVarNode,
	createGetScopeIdVarNode,
	createScopeIdVarNode,
	createTempVarNode,
	createLocalEvalVarNode,
	createFnInfoVarNode,
	createInternalVarNodeFromPrefixNum,
	checkInternalVarNameClash
};

/*
 * Functions to create internal vars nodes
 */
function createTrackerVarNode(state) {
	return createInternalVarNode(TRACKER_VAR_NAME_BODY, state);
}

function createGetScopeIdVarNode(state) {
	return createInternalVarNode(GET_SCOPE_ID_VAR_NAME_BODY, state);
}

function createScopeIdVarNode(blockId, state) {
	return createInternalVarNode(`${SCOPE_ID_VAR_NAME_BODY}_${blockId}`, state);
}

function createTempVarNode(state) {
	return createInternalVarNode(`${TEMP_VAR_NAME_BODY}_${createBlockId(state)}`, state);
}

function createLocalEvalVarNode(state) {
	return createInternalVarNode(LOCAL_EVAL_VAR_NAME_BODY, state);
}

function createFnInfoVarNode(id, state) {
	return createInternalVarNode(`${FN_INFO_VAR_NAME_BODY}_${id}`, state);
}

function createInternalVarNode(name, state) {
	return createInternalVarNodeFromPrefixNum(name, state.internalVarsPrefixNum);
}

function createInternalVarNodeFromPrefixNum(name, prefixNum) {
	return t.identifier(`${INTERNAL_VAR_NAMES_PREFIX}${prefixNum || ''}_${name}`);
}

/**
 * Check if var name could clash with internal var names and update prefix counter if so.
 * @param {string} varName - Var name
 * @param {Object} state - State object
 * @returns {undefined}
 */
function checkInternalVarNameClash(varName, state) {
	// eslint-disable-next-line no-use-before-define
	const internalNameMatch = varName.match(INTERNAL_VAR_NAME_REGEX);
	if (!internalNameMatch) return;

	const currentNum = state.internalVarsPrefixNum;
	const newNum = (internalNameMatch[1] * 1 || 0) + 1;
	if (newNum > currentNum) {
		state.internalVarsPrefixNum = newNum;
		state.internalVarsPrefixNumHasChanged = true;
	}
}

const INTERNAL_VAR_NAME_REGEX = new RegExp(`^${INTERNAL_VAR_NAMES_PREFIX}([1-9]\\d*)?_`);
