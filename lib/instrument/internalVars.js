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
		SCOPE_ID_VAR_NAME_BODY, TEMP_VAR_NAME_BODY, FN_INFO_VAR_NAME_BODY
	} = require('../shared/constants.js');

// Constants
const TRACKER_VAR_NAME = `${INTERNAL_VAR_NAMES_PREFIX}_${TRACKER_VAR_NAME_BODY}`,
	GET_SCOPE_ID_VAR_NAME = `${INTERNAL_VAR_NAMES_PREFIX}_${GET_SCOPE_ID_VAR_NAME_BODY}`,
	SCOPE_ID_VAR_NAME = `${INTERNAL_VAR_NAMES_PREFIX}_${SCOPE_ID_VAR_NAME_BODY}_`,
	TEMP_VAR_NAME = `${INTERNAL_VAR_NAMES_PREFIX}_${TEMP_VAR_NAME_BODY}_`,
	FN_INFO_VAR_NAME = `${INTERNAL_VAR_NAMES_PREFIX}_${FN_INFO_VAR_NAME_BODY}_`;

// Exports

module.exports = {
	createTrackerVarNode,
	createGetScopeIdVarNode,
	createScopeIdVarNode,
	createTempVarNode,
	createFnInfoVarNode,
	checkInternalVarNameClash,
	renameInternalVars,
	addToInternalVars
};

/*
 * Functions to create internal vars nodes
 */
function createTrackerVarNode(state) {
	return createInternalVarNode(TRACKER_VAR_NAME, state);
}

function createGetScopeIdVarNode(state) {
	return createInternalVarNode(GET_SCOPE_ID_VAR_NAME, state);
}

function createScopeIdVarNode(blockId, state) {
	return createInternalVarNode(`${SCOPE_ID_VAR_NAME}${blockId}`, state);
}

function createTempVarNode(state) {
	return createInternalVarNode(`${TEMP_VAR_NAME}${createBlockId(state)}`, state);
}

function createFnInfoVarNode(id, state) {
	return createInternalVarNode(`${FN_INFO_VAR_NAME}${id}`, state);
}

function createInternalVarNode(name, state) {
	return addToInternalVars(t.identifier(name), state);
}

function addToInternalVars(node, state) {
	state.internalVarNodes.push(node);
	return node;
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
	const newNum = (+internalNameMatch[1] || 0) + 1;
	if (newNum > currentNum) state.internalVarsPrefixNum = newNum;
}

const INTERNAL_VAR_NAME_REGEX = new RegExp(`^${INTERNAL_VAR_NAMES_PREFIX}([1-9]\\d*)?_`);

/**
 * Rename all internal vars to ensure names don't clash with other vars, using prefix counter.
 * @param {Object} state - State object
 * @returns {undefined}
 */
function renameInternalVars(state) {
	const prefixNum = state.internalVarsPrefixNum;
	if (prefixNum === 0) return;

	const prefix = `${INTERNAL_VAR_NAMES_PREFIX}${prefixNum}_`,
		oldPrefixLen = INTERNAL_VAR_NAMES_PREFIX.length + 1;
	for (const varNode of state.internalVarNodes) {
		varNode.name = `${prefix}${varNode.name.slice(oldPrefixLen)}`;
	}
}
