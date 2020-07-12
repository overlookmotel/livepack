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

// Constants
const DEFAULT_MODIFIERS = {writable: true, enumerable: true, configurable: true},
	DEFAULT_DESCRIPTOR_MODIFIERS = {writable: false, enumerable: false, configurable: false},
	MODIFIER_NAMES = ['writable', 'enumerable', 'configurable'],
	VALUELESS_MODIFIER_NAMES = ['enumerable', 'configurable'];

// Exports

module.exports = {
	serializePlainObject(obj, record) {
		return this.serializeProperties(obj, record, null, null);
	},

	serializeNullObject(obj, record) {
		return this.serializeProperties(obj, record, {varNode: t.nullLiteral()}, null);
	},

	serializeProtoObject(obj, record, proto) {
		const protoRecord = this.serializeValue(proto, 'prototype');
		return this.serializeProperties(obj, record, protoRecord, null);
	},

	wrapWithProperties(val, record, inputNode, shouldSkipKey, getDefaultModifiers) {
		return this.serializeProperties(val, record, null, inputNode, shouldSkipKey, getDefaultModifiers);
	},

	serializeProperties(val, record, protoRecord, inputNode, shouldSkipKey, getDefaultModifiers) {
		// If is a prototype, and already converted, substitute `fn.prototype`
		const {prototypes} = this;
		let prototypeOf = prototypes.get(val);
		if (prototypeOf) {
			const fnRecord = prototypeOf.record;
			this.setPrototypeVarName(record, fnRecord);
			return this.createPrototypeNode(fnRecord, record);
		}

		// Serialize values, getters and setters
		// and determine if circular values (so assignments required)
		// or getters/setters/descriptor properties (so needs to be defined with descriptors)
		const props = [],
			assignments = [],
			circularAssignments = [];
		const state = {
			propertiesNeedDescriptors: false,
			assignmentsNeedDescriptors: false
		};

		// String keys
		for (const key of Object.getOwnPropertyNames(val)) {
			if (shouldSkipKey && shouldSkipKey(key)) continue;
			const keyIsComputed = !isJsIdentifier(key);
			const keyNode = keyIsComputed ? t.stringLiteral(key) : t.identifier(key);
			const defaultModifiers = getDefaultModifiers ? getDefaultModifiers(key) : null;
			this.serializeProperty(
				val, key, null, keyNode, keyIsComputed, defaultModifiers,
				props, assignments, circularAssignments, state
			);
		}

		deleteTrailingPropsForCircularAssignments(circularAssignments, props);

		// Symbol keys
		const {varNode} = record,
			varName = varNode.name;
		Object.getOwnPropertySymbols(val).forEach((key, index) => {
			const keyRecord = this.serializeValue(key, `${varName}SymbolKeys_${index}`);
			this.serializeProperty(
				val, key, keyRecord, keyRecord.varNode, true, null,
				props, assignments, circularAssignments, state
			);
		});

		deleteTrailingPropsForCircularAssignments(circularAssignments, props);

		// Create node for object definition
		let node;
		if (props.length === 0) {
			// No properties.
			// If props being set on object, pass through input node unchanged, or create empty object.
			if (inputNode) {
				node = inputNode;
			} else if (protoRecord) {
				const objectCreateRecord = this.serializeValue(Object.create);
				node = t.callExpression(objectCreateRecord.varNode, [protoRecord.varNode]);
				createDependency(record, objectCreateRecord, node, 'callee');
				createDependency(record, protoRecord, node.arguments, 0);
			} else {
				node = t.objectExpression([]);
			}
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

			if (protoRecord) {
				const objectCreateRecord = this.serializeValue(Object.create);
				inputNode = t.callExpression(objectCreateRecord.varNode, [protoRecord.varNode]);
				createDependency(record, objectCreateRecord, inputNode, 'callee');
				createDependency(record, protoRecord, inputNode.arguments, 0);
			}

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
				// New object
				methodRecord = this.serializeValue(Object.create);

				if (protoRecord) {
					// Object with prototype - `Object.create(proto, { ... })`
					targetRecord = protoRecord;
					targetNode = targetRecord.varNode;
				} else {
					// Plain object - `Object.create(Object.prototype, { ... })`
					targetRecord = this.serializeValue(Object.prototype);
					targetNode = targetRecord.varNode;
				}
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

					const assignment = createAssignment(record, assignmentNode, memberNode, 'object');
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
				const assignment = createAssignment(record, assignmentNode, assignmentNode.arguments, 0);
				createDependency(assignment, definePropertiesRecord, assignmentNode, 'callee');

				descriptorNodes.push(...createDescriptorNodes(assignments, assignment));
			}
		}

		// If is a prototype, convert to `fn.prototype` and move props to assignments.
		// NB Need to retrieve from `prototypes` again as it may have been defined while serializing props.
		prototypeOf = prototypes.get(val);
		if (prototypeOf) {
			const fnRecord = prototypeOf.record;
			const {fnNode, protoNode} = this.convertPrototype(
				prototypeOf.fn, fnRecord, fnRecord.node, val, record, node, prototypeOf.isGenerator, true
			);
			node = protoNode;
			fnRecord.node = fnNode;
		}

		return node;
	},

	serializeProperty(
		obj, key, keyRecord, keyNode, keyIsComputed, defaultModifiers,
		props, assignments, circularAssignments, state
	) {
		// Serialize value, getter and setter
		const descriptor = Object.getOwnPropertyDescriptor(obj, key),
			hasValue = 'value' in descriptor,
			varName = keyRecord ? keyRecord.varNode.name : key,
			records = {};
		let isCircular = false,
			needsDescriptor = defaultModifiers
				? !defaultModifiers.writable && defaultModifiers.configurable
				: false;
		if (hasValue) {
			const valRecord = this.serializeValue(descriptor.value, varName);
			if (recordIsCircular(valRecord)) isCircular = true;
			records.value = valRecord;
		} else {
			const {get: getter, set: setter} = descriptor;
			if (getter) {
				const getterRecord = this.serializeValue(getter, `${varName}Getter`);
				if (recordIsCircular(getterRecord)) isCircular = true;
				records.get = getterRecord;
			}
			if (setter) {
				const setterRecord = this.serializeValue(setter, `${varName}Setter`);
				if (recordIsCircular(setterRecord)) isCircular = true;
				records.set = setterRecord;
			}

			needsDescriptor = true;
		}

		const modifierNames = hasValue ? MODIFIER_NAMES : VALUELESS_MODIFIER_NAMES;
		if (!needsDescriptor) {
			const defaultDescriptorModifiers = defaultModifiers || DEFAULT_MODIFIERS;
			needsDescriptor = !!modifierNames.find(modifierName => (
				descriptor[modifierName] !== defaultDescriptorModifiers[modifierName]
			));
		}

		const modifiers = createModifiers(
			descriptor, modifierNames,
			defaultModifiers || (isCircular ? DEFAULT_MODIFIERS : DEFAULT_DESCRIPTOR_MODIFIERS)
		);

		// Add to properties/assignments
		const prop = {keyRecord, keyNode, keyIsComputed, records, modifiers, defaultModifiers, descriptor};
		if (isCircular) {
			assignments.push(prop);
			if (needsDescriptor) state.assignmentsNeedDescriptors = true;
			if (!defaultModifiers) {
				props.push({keyRecord, keyNode, keyIsComputed, records: {}, modifiers: DEFAULT_MODIFIERS});
				circularAssignments.push(prop);
			}
		} else {
			props.push(prop);
			if (needsDescriptor) state.propertiesNeedDescriptors = true;
			circularAssignments.length = 0;
		}

		return prop;
	}
};

/**
 * Delete trailing placeholder props which will be set later by assignment.
 * As assignment will add these props on the end, placeholders can be removed
 * without disrupting key order.
 * @param {Array<Object>} circularAssignments
 * @param {Array<Object>} props
 * @returns {undefined}
 */
function deleteTrailingPropsForCircularAssignments(circularAssignments, props) {
	if (circularAssignments.length === 0) return;

	props.length -= circularAssignments.length;

	for (const prop of circularAssignments) {
		prop.modifiers = createModifiers(
			prop.descriptor,
			prop.records.value ? MODIFIER_NAMES : VALUELESS_MODIFIER_NAMES,
			prop.defaultModifiers || DEFAULT_DESCRIPTOR_MODIFIERS
		);
	}

	circularAssignments.length = 0;
}

/**
 * Create modifiers object for modifiers whcih differ from default.
 * @param {Object} descriptor - Property descriptor
 * @param {Array<string>} modifierNames - Array of properties to check
 *   e.g. `['enumerable', 'configurable']`
 * @param {Object} defaultModifiers - Default modifiers
 * @returns {Object} - Modifiers object e.g. `{enumerable: true, configurable: true}`
 */
function createModifiers(descriptor, modifierNames, defaultModifiers) {
	const modifiers = {};
	for (const modifierName of modifierNames) {
		const value = descriptor[modifierName];
		if (value !== defaultModifiers[modifierName]) modifiers[modifierName] = value;
	}
	return modifiers;
}

/**
 * Create node for descriptor object.
 * e.g. { a: { value: 1, enumerable: true }, b: { get: () => {} } }`
 * @param {Array} props - Array of prop objects
 * @param {Object} record - Record to create dependencies of
 * @returns {Object} - Node for descriptors object
 */
function createDescriptorNodes(props, record) {
	return props.map((prop) => {
		const {records} = prop;
		const descriptorPropNodes = Object.entries(records).map(
			([descriptorKey, descriptorValueRecord]) => {
				const descriptorPropNode = t.objectProperty(
					t.identifier(descriptorKey), descriptorValueRecord.varNode, false, true
				);
				createDependency(record, descriptorValueRecord, descriptorPropNode, 'value');
				return descriptorPropNode;
			}
		);

		if (descriptorPropNodes.length === 0) {
			descriptorPropNodes.push(t.objectProperty(t.identifier('value'), serializeUndefined()));
		}

		for (const [modifierName, value] of Object.entries(prop.modifiers)) {
			descriptorPropNodes.push(t.objectProperty(t.identifier(modifierName), t.booleanLiteral(value)));
		}

		const {keyRecord} = prop;
		const node = t.objectProperty(
			prop.keyNode, t.objectExpression(descriptorPropNodes), !!keyRecord, true
		);
		if (keyRecord) createDependency(record, keyRecord, node, 'key');
		return node;
	});
}
