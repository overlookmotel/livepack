/* --------------------
 * livepack module
 * Serialize Sets + Maps
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency, createAssignment} = require('./records.js'),
	{recordIsCircular} = require('./utils.js');

// Exports

const setValues = Set.prototype.values,
	mapEntries = Map.prototype.entries;

module.exports = {
	serializeSet(set, record) {
		const {varNode} = record,
			varName = varNode.name;
		let isCircular = false;
		const entryNodes = [];
		[...setValues.call(set)].forEach((val, index) => {
			const valRecord = this.serializeValue(val, `${varName}_${index}`);
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

		const setCtorRecord = this.serializeValue(Set);
		const node = t.newExpression(
			setCtorRecord.varNode,
			entryNodes.length > 0 ? [t.arrayExpression(entryNodes)] : []
		);
		createDependency(record, setCtorRecord, node, 'callee');
		return this.wrapWithProperties(set, record, node, Set.prototype);
	},

	serializeMap(map, record) {
		const {varNode} = record,
			varName = varNode.name;
		let isCircular = false;
		const entryNodes = [];
		[...mapEntries.call(map)].forEach(([key, val], index) => {
			const keyRecord = this.serializeValue(key, `${varName}Keys_${index}`);
			const valRecord = this.serializeValue(val, `${varName}Values_${index}`);
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

		const mapCtorRecord = this.serializeValue(Map);
		const node = t.newExpression(
			mapCtorRecord.varNode,
			entryNodes.length > 0 ? [t.arrayExpression(entryNodes)] : []
		);
		createDependency(record, mapCtorRecord, node, 'callee');
		return this.wrapWithProperties(map, record, node, Map.prototype);
	},

	serializeWeakSet() {
		// TODO
		throw new Error('Cannot serialize WeakSets');
	},

	serializeWeakMap() {
		// TODO
		throw new Error('Cannot serialize WeakMaps');
	}
};
