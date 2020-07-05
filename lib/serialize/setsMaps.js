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

module.exports = {
	serializeSet(set, record) {
		const {varNode} = record,
			varName = varNode.name;
		let isCircular = false;
		const entryNodes = [];
		[...set.values()].forEach((val, index) => {
			const valRecord = this.serializeValue(val, `${varName}_${index}`);
			if (!isCircular && (recordIsCircular(valRecord))) isCircular = true;

			if (isCircular) {
				const arr = [valRecord.varNode];
				const assignmentNode = t.callExpression(t.memberExpression(varNode, t.identifier('add')), arr);
				const assignment = createAssignment(record, assignmentNode);
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
		return this.wrapWithProperties(set, record, node);
	},

	serializeMap(map, record) {
		const {varNode} = record,
			varName = varNode.name;
		let isCircular = false;
		const entryNodes = [];
		[...map.entries()].forEach(([key, val], index) => {
			const keyRecord = this.serializeValue(key, `${varName}Keys_${index}`);
			const valRecord = this.serializeValue(val, `${varName}Values_${index}`);
			if (!isCircular && (recordIsCircular(keyRecord) || recordIsCircular(valRecord))) isCircular = true;

			const pair = [keyRecord.varNode, valRecord.varNode];
			let dependent;
			if (isCircular) {
				const assignmentNode = t.callExpression(t.memberExpression(varNode, t.identifier('set')), pair);
				dependent = createAssignment(record, assignmentNode);
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
		return this.wrapWithProperties(map, record, node);
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
