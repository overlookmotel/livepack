/* --------------------
 * livepack module
 * Serialize Sets + Maps
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {SET_TYPE, WEAK_SET_TYPE, MAP_TYPE, WEAK_MAP_TYPE, registerSerializer} = require('./types.js'),
	{weakSets, weakMaps} = require('../shared/internal.js');

// Exports

const setValues = Set.prototype.values,
	mapEntries = Map.prototype.entries;

module.exports = {
	/**
	 * Trace Set.
	 * @param {Set} set - Set object
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceSet(set, record) {
		traceSetOrWeakSet.call(this, set, [...setValues.call(set)], record);
		return SET_TYPE;
	},

	/**
	 * Trace WeakSet.
	 * @param {Set} set - Set object
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceWeakSet(set, record) {
		const {refs} = weakSets.get(set);
		const entries = [];
		for (const ref of refs) {
			const value = ref.deref();
			if (value) entries.push(value);
		}

		traceSetOrWeakSet.call(this, set, entries, record);
		return WEAK_SET_TYPE;
	},

	/**
	 * Trace Map.
	 * @param {Map} map - Map object
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceMap(map, record) {
		traceMapOrWeakMap.call(this, map, [...mapEntries.call(map)], record);
		return MAP_TYPE;
	},

	/**
	 * Trace Map.
	 * @param {Map} map - Map object
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceWeakMap(map, record) {
		const {refs, mapping} = weakMaps.get(map);
		const entries = [];
		for (const ref of refs) {
			const key = ref.deref();
			if (key) entries.push([key, mapping.get(key).value]);
		}

		traceMapOrWeakMap.call(this, map, entries, record);
		return WEAK_MAP_TYPE;
	}
};

/**
 * Trace Set or WeakSet.
 * @this {Object} Serializer
 * @param {Set|WeakSet} set - Set/WeakSet object
 * @param {Array<*>} entries - Set/WeakSet entries
 * @param {Object} record - Record
 * @returns {undefined}
 */
function traceSetOrWeakSet(set, entries, record) {
	const entryRecords = entries.map(
		(val, index) => this.traceDependency(val, `${record.name}_${index}`, `<Set value ${index}>`, record)
	);
	record.extra = {entryRecords};
	this.traceProperties(set, record, undefined);
}

/**
 * Serialize Set.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @returns {Object} - AST node
 */
function serializeSet(record) {
	return serializeSetOrWeakSet.call(this, record, Set, this.setPrototypeRecord, false);
}
registerSerializer(SET_TYPE, serializeSet);

/**
 * Serialize WeakSet.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @returns {Object} - AST node
 */
function serializeWeakSet(record) {
	return serializeSetOrWeakSet.call(this, record, WeakSet, this.weakSetPrototypeRecord, true);
}
registerSerializer(WEAK_SET_TYPE, serializeWeakSet);

/**
 * Serialize Set or WeakSet.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Function} ctor - Constructor - `Set` or `WeakSet`
 * @param {Object} protoRecord - Record for prototype
 * @param {boolean} isUnordered - `true` if entries are unordered (`false` for Sets, `true` for WeakSets)
 * @returns {undefined}
 */
function serializeSetOrWeakSet(record, ctor, protoRecord, isUnordered) {
	const {varNode} = record,
		entryNodes = [];
	let isCircular = false;
	for (const entryRecord of record.extra.entryRecords) {
		if (isUnordered) {
			isCircular = entryRecord.isCircular;
		} else if (!isCircular && entryRecord.isCircular) {
			isCircular = true;
		}

		const entryNode = this.serializeValue(entryRecord);
		if (isCircular) {
			// `set.add(...)`
			this.assignmentNodes.push(t.expressionStatement(
				t.callExpression(t.memberExpression(varNode, t.identifier('add')), [entryNode])
			));
		} else {
			entryNodes.push(entryNode);
		}
	}

	const ctorNode = this.traceAndSerializeGlobal(ctor),
		node = t.newExpression(ctorNode, entryNodes.length > 0 ? [t.arrayExpression(entryNodes)] : []);
	return this.wrapWithProperties(node, record, protoRecord, null);
}

/**
 * Trace Map or WeakMap.
 * @this {Object} Serializer
 * @param {Map|WeakMap} map - Map/WeakMap object
 * @param {Array<*>} entries - Map/WeakMap entries
 * @param {Object} record - Record
 * @returns {undefined}
 */
function traceMapOrWeakMap(map, entries, record) {
	const entryRecords = entries.map(([key, val], index) => ({
		keyRecord: this.traceDependency(key, `${record.name}Keys_${index}`, `<Map key ${index}>`, record),
		valRecord: this.traceDependency(val, `${record.name}Values_${index}`, `<Map value ${index}>`, record)
	}));
	record.extra = {entryRecords};
	this.traceProperties(map, record, undefined);
}

/**
 * Serialize Map.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @returns {Object} - AST node
 */
function serializeMap(record) {
	return serializeMapOrWeakMap.call(this, record, Map, this.mapPrototypeRecord, false);
}
registerSerializer(MAP_TYPE, serializeMap);

/**
 * Serialize WeakMap.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @returns {Object} - AST node
 */
function serializeWeakMap(record) {
	return serializeMapOrWeakMap.call(this, record, WeakMap, this.weakMapPrototypeRecord, true);
}
registerSerializer(WEAK_MAP_TYPE, serializeWeakMap);

/**
 * Serialize Map or WeakMap.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Function} ctor - Constructor - `Map` or `WeakMap`
 * @param {Object} protoRecord - Record for prototype
 * @param {boolean} isUnordered - `true` if entries are unordered (`false` for Maps, `true` for WeakMaps)
 * @returns {undefined}
 */
function serializeMapOrWeakMap(record, ctor, protoRecord, isUnordered) {
	const {varNode} = record,
		entryNodes = [];
	let isCircular = false;
	for (const {keyRecord, valRecord} of record.extra.entryRecords) {
		if (isUnordered) {
			isCircular = keyRecord.isCircular || valRecord.isCircular;
		} else if (!isCircular && (keyRecord.isCircular || valRecord.isCircular)) {
			isCircular = true;
		}

		const keyNode = this.serializeValue(keyRecord),
			valNode = this.serializeValue(valRecord);
		if (isCircular) {
			// `map.set(..., ...)`
			this.assignmentNodes.push(t.expressionStatement(
				t.callExpression(t.memberExpression(varNode, t.identifier('set')), [keyNode, valNode])
			));
		} else {
			entryNodes.push(t.arrayExpression([keyNode, valNode]));
		}
	}

	const ctorNode = this.traceAndSerializeGlobal(ctor),
		node = t.newExpression(ctorNode, entryNodes.length > 0 ? [t.arrayExpression(entryNodes)] : []);
	return this.wrapWithProperties(node, record, protoRecord, null);
}
