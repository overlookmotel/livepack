/* --------------------
 * livepack module
 * Serialize objects
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency, createAssignment} = require('./records.js'),
	{serializeUndefined} = require('./primitives.js'),
	{isJsIdentifier, recordIsCircular} = require('./utils.js');

// Exports

module.exports = {
	serializeObject(obj, record) {
		return this.wrapWithProperties(obj, record);
	},

	wrapWithProperties(val, record, inputNode, shouldSkipKey, shouldForceDescriptor) {
		// Serialize values, getters and setters
		// and determine if circular values (so assignments required)
		// or getters/setters/descriptor properties (so needs to be defined with descriptors)
		const props = [],
			assignments = [];
		const state = {
			numTrailingCircular: 0,
			propertiesNeedDescriptors: false,
			assignmentsNeedDescriptors: false
		};

		// String keys
		for (const key of Object.getOwnPropertyNames(val)) {
			if (shouldSkipKey && shouldSkipKey(key)) continue;
			const keyIsComputed = !isJsIdentifier(key);
			const keyNode = keyIsComputed ? t.stringLiteral(key) : t.identifier(key);
			const needsDescriptor = shouldForceDescriptor ? shouldForceDescriptor(key) : false;
			this.serializeProperty(
				val, key, null, keyNode, keyIsComputed, needsDescriptor, props, assignments, state
			);
		}

		// If last properties were circular references and will be set later by assignment,
		// placeholders properties can be removed without disrupting key order
		if (state.numTrailingCircular > 0) props.length -= state.numTrailingCircular;

		// Symbol keys
		state.numTrailingCircular = 0;
		const {varNode} = record,
			varName = varNode.name;
		Object.getOwnPropertySymbols(val).forEach((key, index) => {
			const keyRecord = this.serializeValue(key, `${varName}SymbolKeys_${index}`);
			this.serializeProperty(
				val, key, keyRecord, keyRecord.varNode, true, false, props, assignments, state
			);
		});
		if (state.numTrailingCircular > 0) props.length -= state.numTrailingCircular;

		// Create node for object definition
		let node;
		if (props.length === 0) {
			// No properties.
			// If props being set on object, pass through input node unchanged, or create empty object.
			node = inputNode || t.objectExpression([]);
		} else if (!state.propertiesNeedDescriptors) {
			// Descriptors not required.
			// Create plain object containing properties `{a: 1, b: 2}`.
			node = t.objectExpression(
				props.map((prop) => {
					const {keyRecord, records: {value: valRecord}} = prop;
					const valNode = valRecord ? valRecord.varNode : serializeUndefined();
					const propNode = t.objectProperty(prop.keyNode, valNode, !!keyRecord, true);
					if (keyRecord) createDependency(record, keyRecord, propNode, 'key');
					if (valRecord) createDependency(record, valRecord, propNode, 'value');
					return propNode;
				})
			);

			if (inputNode) {
				// `Object.assign(input, { ... })`
				const objectAssignRecord = this.serializeValue(Object.assign);
				node = t.callExpression(objectAssignRecord.varNode, [inputNode, node]);
				createDependency(record, objectAssignRecord, node, 'callee');
			}
		} else {
			// Descriptors required
			let methodRecord, targetRecord, targetNode;
			if (!inputNode) {
				// Plain object - `Object.create(Object.prototype, { ... })`
				methodRecord = this.serializeValue(Object.create);
				targetRecord = this.serializeValue(Object.prototype);
				targetNode = targetRecord.varNode;
			} else {
				// Assigning to existing object - `Object.defineProperties(input, { ... })
				methodRecord = this.serializeValue(Object.defineProperties);
				targetNode = inputNode;
			}

			node = t.callExpression(
				methodRecord.varNode,
				[
					targetNode,
					t.objectExpression(
						createDescriptorNodes(props, record)
					)
				]
			);

			createDependency(record, methodRecord, node, 'callee');
			if (targetRecord) createDependency(record, targetRecord, node.arguments, 0);
		}

		// Create assignments for properties containing circular references
		if (assignments.length > 0) {
			if (!state.assignmentsNeedDescriptors) {
				// Assignments do not require descriptors - simple assignments `x.a = v; x.b = v2`
				for (const prop of assignments) {
					const {keyRecord, records: {value: valRecord}} = prop;
					const memberNode = t.memberExpression(varNode, prop.keyNode, prop.keyIsComputed);
					const assignmentNode = t.assignmentExpression('=', memberNode, valRecord.varNode);

					const assignment = createAssignment(record, assignmentNode);
					if (keyRecord) createDependency(assignment, keyRecord, memberNode, 'property');
					createDependency(assignment, valRecord, assignmentNode, 'right');
				}
			} else {
				// Assignments do require descriptors - `Object.defineProperties( x, { ... })`
				const definePropertiesRecord = this.serializeValue(Object.defineProperties);
				const descriptorNodes = [];
				const assignmentNode = t.callExpression(
					definePropertiesRecord.varNode,
					[record.varNode, t.objectExpression(descriptorNodes)]
				);
				const assignment = createAssignment(record, assignmentNode);
				createDependency(assignment, definePropertiesRecord, assignmentNode, 'callee');

				descriptorNodes.push(...createDescriptorNodes(assignments, assignment));
			}
		}

		return node;
	},

	serializeProperty(
		obj, key, keyRecord, keyNode, keyIsComputed, needsDescriptor, props, assignments, state
	) {
		// Serialize value, getter and setter
		const records = {};
		let isCircular = false;
		const descriptor = Object.getOwnPropertyDescriptor(obj, key);
		if ('value' in descriptor) {
			const valRecord = this.serializeValue(descriptor.value, key);
			if (recordIsCircular(valRecord)) isCircular = true;
			records.value = valRecord;
		} else {
			const {get: getter, set: setter} = descriptor;
			if (getter) {
				const getterRecord = this.serializeValue(getter, `${key}Getter`);
				if (recordIsCircular(getterRecord)) isCircular = true;
				records.get = getterRecord;
			}
			if (setter) {
				const setterRecord = this.serializeValue(setter, `${key}Setter`);
				if (recordIsCircular(setterRecord)) isCircular = true;
				records.set = setterRecord;
			}

			needsDescriptor = true;
		}

		// If has non-standard descriptor properties, requires descriptor
		if (
			!needsDescriptor
			&& (!descriptor.writable || !descriptor.enumerable || !descriptor.configurable)
		) needsDescriptor = true;

		if (needsDescriptor) {
			if (isCircular) {
				state.assignmentsNeedDescriptors = true;
			} else {
				state.propertiesNeedDescriptors = true;
			}
		}

		// Add to properties/assignments
		const prop = {keyRecord, keyNode, keyIsComputed, records, descriptor};
		if (isCircular) {
			props.push({
				keyRecord,
				keyNode,
				keyIsComputed,
				records: {},
				descriptor: {writable: true, enumerable: true, configurable: true}
			});
			assignments.push(prop);
			state.numTrailingCircular++;
		} else {
			props.push(prop);
			state.numTrailingCircular = 0;
		}

		return prop;
	}
};

/**
 * Create node for descriptor object.
 * e.g. { a: { value: 1, enumerable: true }, b: { get: () => {} } }`
 * @param {Array} props - Array of prop objects
 * @param {Object} record - Record to create dependencies of
 * @returns {Object} - Node for descriptors object
 */
function createDescriptorNodes(props, record) {
	return props.map((prop) => {
		const propNodes = Object.entries(prop.records).map(
			([descriptorKey, descriptorValueRecord]) => {
				const propNode = t.objectProperty(
					t.identifier(descriptorKey), descriptorValueRecord.varNode, false, true
				);
				createDependency(record, descriptorValueRecord, propNode, 'value');
				return propNode;
			}
		);

		if (propNodes.length === 0) {
			propNodes.push(t.objectProperty(t.identifier('value'), serializeUndefined()));
		}

		const {descriptor} = prop;
		for (const modifierName of ['writable', 'enumerable', 'configurable']) {
			if (!descriptor[modifierName]) continue;
			propNodes.push(t.objectProperty(t.identifier(modifierName), t.booleanLiteral(true)));
		}

		const {keyRecord} = prop;
		const node = t.objectProperty(prop.keyNode, t.objectExpression(propNodes), !!keyRecord, true);
		if (keyRecord) createDependency(record, keyRecord, node, 'key');
		return node;
	});
}
