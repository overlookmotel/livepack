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
		// Serialize values, getters and setters
		// and determine if circular values (so assignments required)
		// or getters/setters/descriptor properties (so needs to be defined with descriptors)
		let numTrailingCircular = 0,
			propertiesNeedDescriptors = false,
			assignmentsNeedDescriptors = false;
		const props = [],
			assignments = [];
		for (const key of Object.getOwnPropertyNames(obj)) {
			const keyIsComputed = !isJsIdentifier(key);
			const keyNode = keyIsComputed ? t.stringLiteral(key) : t.identifier(key);

			// Serialize value, getter and setter
			const records = {};
			let isCircular = false,
				needsDescriptor = false;
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
					assignmentsNeedDescriptors = true;
				} else {
					propertiesNeedDescriptors = true;
				}
			}

			// Add to properties/assignments
			const prop = {keyNode, keyIsComputed, records, descriptor};
			if (isCircular) {
				props.push({
					keyNode,
					keyIsComputed,
					records: {},
					descriptor: {writable: true, enumerable: true, configurable: true}
				});
				assignments.push(prop);
				numTrailingCircular++;
			} else {
				props.push(prop);
				numTrailingCircular = 0;
			}
		}

		// If last properties were circular references and will be set later by assignment,
		// placeholders properties can be removed without disrupting key order
		if (numTrailingCircular > 0) props.length -= numTrailingCircular;

		// Create node for object definition
		let node;
		if (!propertiesNeedDescriptors) {
			// Descriptors not required - plain object `{a: 1, b: 2}`
			node = t.objectExpression(
				props.map((prop) => {
					const valRecord = prop.records.value;
					const valNode = valRecord ? valRecord.varNode : serializeUndefined();
					const propNode = t.objectProperty(prop.keyNode, valNode, false, true);
					if (valRecord) createDependency(record, valRecord, propNode, 'value');
					return propNode;
				})
			);
		} else {
			// Descriptors required - `Object.create(Object.prototype, { ... })`
			node = t.callExpression(
				t.memberExpression(t.identifier('Object'), t.identifier('create')),
				[
					t.memberExpression(t.identifier('Object'), t.identifier('prototype')),
					t.objectExpression(
						createDescriptorNodes(props, record)
					)
				]
			);
		}

		// Create assignments for properties containing circular references
		if (assignments.length > 0) {
			if (!assignmentsNeedDescriptors) {
				// Assignments do not require descriptors - simple assignments `x.a = v; x.b = v2`
				const {varNode} = record;
				for (const prop of assignments) {
					const valRecord = prop.records.value;
					const assignmentNode = t.assignmentExpression(
						'=',
						t.memberExpression(varNode, prop.keyNode, prop.keyIsComputed),
						valRecord.varNode
					);

					const assignment = createAssignment(record, assignmentNode);
					createDependency(assignment, valRecord, assignmentNode, 'right');
				}
			} else {
				// Assignments do require descriptors - `Object.defineProperties( x, { ... })`
				const descriptorNodes = [];
				const assignmentNode = t.callExpression(
					t.memberExpression(t.identifier('Object'), t.identifier('defineProperties')),
					[record.varNode, t.objectExpression(descriptorNodes)]
				);
				const assignment = createAssignment(record, assignmentNode);

				descriptorNodes.push(...createDescriptorNodes(assignments, assignment));
			}
		}

		return node;
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

		return t.objectProperty(prop.keyNode, t.objectExpression(propNodes), false, true);
	});
}
