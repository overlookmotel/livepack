/* --------------------
 * livepack module
 * Serialize Sets + Maps
 * ------------------*/

'use strict';

// Modules
const assert = require('simple-invariant'),
	t = require('@babel/types');

// Imports
const {createDependency, createAssignment} = require('./records.js'),
	{weakSets, weakMaps} = require('../internal.js'),
	{recordIsCircular} = require('./utils.js');

// Exports

const setValues = Set.prototype.values,
	mapEntries = Map.prototype.entries;

module.exports = {
	serializeSet(set, record) {
		return this.serializeSetLike(set, [...setValues.call(set)], Set, record);
	},

	serializeWeakSet(set, record) {
		assert(weakSets, 'WeakSets cannot be serialized on versions of Node without WeakRef support (< 14)');

		const {refs} = weakSets.get(set);
		const entries = [];
		for (const ref of refs) {
			const value = ref.deref();
			if (value) entries.push(value);
		}

		return this.serializeSetLike(set, entries, WeakSet, record);
	},

	serializeSetLike(set, entries, ctor, record) {
		const {varNode} = record,
			varName = varNode.name;
		let isCircular = false;
		const entryNodes = [];
		entries.forEach((val, index) => {
			const valRecord = this.serializeValue(val, `${varName}_${index}`, `<Set value ${index}>`);
			if (!isCircular && (recordIsCircular(valRecord))) isCircular = true;

			if (isCircular) {
				const arr = [valRecord.varNode];
				const memberNode = t.memberExpression(varNode, t.identifier('add'));
				const assignmentNode = t.callExpression(memberNode, arr);
				const assignment = createAssignment(record, assignmentNode, memberNode, 'object');
				createDependency(assignment, valRecord, arr, 0);
			} else {
				entryNodes[index] = valRecord.varNode;
				createDependency(record, valRecord, entryNodes, index);
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
		return this.serializeMapLike(map, [...mapEntries.call(map)], Map, record);
	},

	serializeWeakMap(map, record) {
		assert(weakMaps, 'WeakMaps cannot be serialized on versions of Node without WeakRef support (< 14)');

		const {refs, mapping} = weakMaps.get(map);
		const entries = [];
		for (const ref of refs) {
			const key = ref.deref();
			if (key) entries.push([key, mapping.get(key).value]);
		}

		return this.serializeMapLike(map, entries, WeakMap, record);
	},

	serializeMapLike(map, entries, ctor, record) {
		const {varNode} = record,
			varName = varNode.name;
		let isCircular = false;
		const entryNodes = [];
		entries.forEach(([key, val], index) => {
			const keyRecord = this.serializeValue(key, `${varName}Keys_${index}`, `<Map key ${index}>`);
			const valRecord = this.serializeValue(val, `${varName}Values_${index}`, `<Map value ${index}>`);
			if (!isCircular && (recordIsCircular(keyRecord) || recordIsCircular(valRecord))) isCircular = true;

			const pair = [keyRecord.varNode, valRecord.varNode];
			let dependent;
			if (isCircular) {
				const memberNode = t.memberExpression(varNode, t.identifier('set'));
				const assignmentNode = t.callExpression(memberNode, pair);
				dependent = createAssignment(record, assignmentNode, memberNode, 'object');
			} else {
				entryNodes[index] = t.arrayExpression(pair);
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
