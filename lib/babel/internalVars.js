/* --------------------
 * livepack module
 * Babel plugin functions for handling internal vars (`livepack_tracker` etc)
 * ------------------*/

'use strict';

// Imports
const {internalIdentifier, createBlockId} = require('./utils.js'),
	{INTERNAL_VAR_NODES, INTERNAL_VAR_PREFIX_NUM} = require('./symbols.js'),
	{
		INTERNAL_VAR_NAMES_PREFIX,
		TRACKER_VAR_NAME_BODY, SCOPE_ID_VAR_NAME_BODY, TEMP_VAR_NAME_BODY,
		EVAL_VAR_NAME_BODY, PREVAL_VAR_NAME_BODY, GET_EVAL_VAR_NAME_BODY
	} = require('../shared/constants.js');

// Constants
const TRACKER_VAR_NAME = `${INTERNAL_VAR_NAMES_PREFIX}_${TRACKER_VAR_NAME_BODY}`,
	SCOPE_ID_VAR_NAME = `${INTERNAL_VAR_NAMES_PREFIX}_${SCOPE_ID_VAR_NAME_BODY}_`,
	TEMP_VAR_NAME = `${INTERNAL_VAR_NAMES_PREFIX}_${TEMP_VAR_NAME_BODY}_`,
	EVAL_VAR_NAME = `${INTERNAL_VAR_NAMES_PREFIX}_${EVAL_VAR_NAME_BODY}`,
	PREVAL_VAR_NAME = `${INTERNAL_VAR_NAMES_PREFIX}_${PREVAL_VAR_NAME_BODY}`,
	GET_EVAL_VAR_NAME = `${INTERNAL_VAR_NAMES_PREFIX}_${GET_EVAL_VAR_NAME_BODY}`;

// Exports

module.exports = {
	initInternalVars,
	createTrackerVarNode,
	createScopeIdVarNode,
	createTempVarNode,
	createEvalVarNode,
	createPrevalVarNode,
	createGetEvalVarNode,
	addToInternalVars,
	getEvalVarName,
	getInternalVarsPrefixNum,
	checkInternalVarNameClash,
	renameInternalVars
};

/**
 * Init array of internal var nodes.
 * Used to track usage so they can be renamed if var name clashes.
 * @param {Object} state - Babel state object
 * @returns {undefined}
 */
function initInternalVars(state) {
	// `[INTERNAL_VAR_PREFIX_NUM]` could be pre-defined for code generated in `eval()`
	if (state[INTERNAL_VAR_PREFIX_NUM] === undefined) state[INTERNAL_VAR_PREFIX_NUM] = 0;
	state[INTERNAL_VAR_NODES] = [];
}

/*
 * Functions to create internal vars nodes
 */
function createTrackerVarNode(state) {
	return createInternalVarNode(TRACKER_VAR_NAME, state);
}

function createScopeIdVarNode(blockId, state) {
	return createInternalVarNode(`${SCOPE_ID_VAR_NAME}${blockId}`, state);
}

function createTempVarNode(state) {
	return createInternalVarNode(`${TEMP_VAR_NAME}${createBlockId(state)}`, state);
}

function createEvalVarNode(state) {
	return createInternalVarNode(EVAL_VAR_NAME, state);
}

function createPrevalVarNode(state) {
	return createInternalVarNode(PREVAL_VAR_NAME, state);
}

function createGetEvalVarNode(state) {
	return createInternalVarNode(GET_EVAL_VAR_NAME, state);
}

function createInternalVarNode(name, state) {
	return addToInternalVars(internalIdentifier(name), state);
}

function addToInternalVars(node, state) {
	state[INTERNAL_VAR_NODES].push(node);
	return node;
}

/**
 * Get eval internal var name.
 * @returns {string}
 */
function getEvalVarName() {
	return EVAL_VAR_NAME;
}

/**
 * Get internal vars prefix number.
 * @param {Object} state - Babel state object
 * @returns {number} - Prefix number
 */
function getInternalVarsPrefixNum(state) {
	return state[INTERNAL_VAR_PREFIX_NUM];
}

/**
 * Check if var name could clash with internal var names and update prefix counter if so.
 * @param {string} name - Var name
 * @param {Object} state - Babel state object
 * @returns {undefined}
 */
function checkInternalVarNameClash(name, state) {
	// eslint-disable-next-line no-use-before-define
	const internalNameMatch = name.match(INTERNAL_VAR_NAME_REGEX);
	if (!internalNameMatch) return;

	const currentNum = state[INTERNAL_VAR_PREFIX_NUM];
	const newNum = (internalNameMatch[1] * 1 || 0) + 1;
	if (newNum > currentNum) state[INTERNAL_VAR_PREFIX_NUM] = newNum;
}

const INTERNAL_VAR_NAME_REGEX = new RegExp(`^${INTERNAL_VAR_NAMES_PREFIX}([1-9]\\d*)?_`);

/**
 * Rename all internal vars to ensure names don't clash with other vars, using prefix counter.
 * @param {Object} state - Babel state object
 * @returns {undefined}
 */
function renameInternalVars(state) {
	const prefixNum = state[INTERNAL_VAR_PREFIX_NUM];
	if (prefixNum === 0) return;

	const prefix = `${INTERNAL_VAR_NAMES_PREFIX}${prefixNum}_`,
		oldPrefixLen = INTERNAL_VAR_NAMES_PREFIX.length + 1;
	for (const varNode of state[INTERNAL_VAR_NODES]) {
		varNode.name = `${prefix}${varNode.name.slice(oldPrefixLen)}`;
	}
}
