/* --------------------
 * livepack module
 * Serialize Sets + Maps
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency, createAssignment} = require('./records.js'),
	{getWeakSetEntries, getWeakMapEntries} = require('../shared/internal.js'),
	{recordIsCircular} = require('./utils.js');

// Exports

const setValues = Set.prototype.values,
	mapEntries = Map.prototype.entries;

module.exports = {
	serializeSet(set, record) {
		return this.serializeSetLike(set, [...setValues.call(set)], Set, false, record);
	},

	serializeWeakSet(set, record) {
		return this.serializeSetLike(set, getWeakSetEntries(set), WeakSet, true, record);
	},

	serializeSetLike(set, entries, ctor, isUnordered, record) {
		const {varNode} = record,
			varName = varNode.name;
		let isCircular = false;
		const entryNodes = [];
		entries.forEach((val, index) => {
			const valRecord = this.serializeValue(val, `${varName}_${index}`, `<Set value ${index}>`);
			if (isUnordered || !isCircular) isCircular = recordIsCircular(valRecord);

			if (isCircular) {
				const arr = [valRecord.varNode];
				const memberNode = t.memberExpression(varNode, t.identifier('add'));
				const assignmentNode = t.callExpression(memberNode, arr);
				const assignment = createAssignment(record, assignmentNode, memberNode, 'object');
				createDependency(assignment, valRecord, arr, 0);
			} else {
				entryNodes.push(valRecord.varNode);
				createDependency(record, valRecord, entryNodes, entryNodes.length - 1);
			}
		});

		const ctorRecord = this.serializeValue(ctor);
		const node = t.newExpression(
			ctorRecord.varNode,
			entryNodes.length > 0 ? [t.arrayExpression(entryNodes)] : []
		);
		createDependency(record, ctorRecord, node, 'callee');
		return this.wrapWithProperties(set, record, node, ctor.prototype);
	},

	serializeMap(map, record) {
		return this.serializeMapLike(map, [...mapEntries.call(map)], Map, false, record);
	},

	serializeWeakMap(map, record) {
		return this.serializeMapLike(map, getWeakMapEntries(map), WeakMap, true, record);
	},

	serializeMapLike(map, entries, ctor, isUnordered, record) {
		const {varNode} = record,
			varName = varNode.name;
		let isCircular = false;
		const entryNodes = [];
		entries.forEach(([key, val], index) => {
			const keyRecord = this.serializeValue(key, `${varName}Keys_${index}`, `<Map key ${index}>`);
			const valRecord = this.serializeValue(val, `${varName}Values_${index}`, `<Map value ${index}>`);
			if (isUnordered || !isCircular) {
				isCircular = recordIsCircular(keyRecord) || recordIsCircular(valRecord);
			}

			const pair = [keyRecord.varNode, valRecord.varNode];
			let dependent;
			if (isCircular) {
				const memberNode = t.memberExpression(varNode, t.identifier('set'));
				const assignmentNode = t.callExpression(memberNode, pair);
				dependent = createAssignment(record, assignmentNode, memberNode, 'object');
			} else {
				entryNodes.push(t.arrayExpression(pair));
				dependent = record;
			}

			createDependency(dependent, keyRecord, pair, 0);
			createDependency(dependent, valRecord, pair, 1);
		});

		const mapCtorRecord = this.serializeValue(ctor);
		const node = t.newExpression(
			mapCtorRecord.varNode,
			entryNodes.length > 0 ? [t.arrayExpression(entryNodes)] : []
		);
		createDependency(record, mapCtorRecord, node, 'callee');
		return this.wrapWithProperties(map, record, node, ctor.prototype);
	}
};
