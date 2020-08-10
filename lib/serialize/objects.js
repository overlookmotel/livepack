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
	{isJsIdentifier, isNumberKey, recordIsCircular} = require('./utils.js');

// Constants
const DEFAULT_MODIFIERS = {writable: true, enumerable: true, configurable: true},
	DEFAULT_REASSIGN_MODIFIERS = {writable: false, enumerable: false, configurable: false},
	DEFAULT_NON_EXTENSIBLE_MODIFIERS = {
		freeze: {writable: false, configurable: false},
		seal: {configurable: false}
	},
	MODIFIER_NAMES = ['writable', 'enumerable', 'configurable'],
	VALUELESS_MODIFIER_NAMES = ['enumerable', 'configurable'];

// Exports

module.exports = {
	serializeObject(obj, record) {
		// Serialize properties
		return this.serializeProperties(
			obj, record, null, Object.prototype, undefined, undefined, undefined, false
		);
	},

	wrapWithProperties(
		val, record, inputNode, defaultProto, defaultProps, shouldSkipKey, shouldForceDescriptor
	) {
		return this.serializeProperties(
			val, record, inputNode, defaultProto, defaultProps, shouldSkipKey, shouldForceDescriptor, false
		);
	},

	serializeProperties(
		val, record, inputNode, defaultProto, defaultProps, shouldSkipKey, shouldForceDescriptor, forceAssign
	) {
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

		// Init default prop tracker
		let defaultProp, defaultPropIndex;
		if (defaultProps) {
			defaultProp = defaultProps[0];
			defaultPropIndex = 0;
		}

		const deletedPropNames = new Set();
		function deleteDefaultProps(nextKey) {
			while (defaultProp && defaultProp.name !== nextKey) {
				const memberNode = t.memberExpression(record.varNode, t.identifier(defaultProp.name));
				const assignmentNode = t.unaryExpression('delete', memberNode);
				createAssignment(record, assignmentNode, memberNode, 'object', true);

				deletedPropNames.add(defaultProp.name);

				nextDefaultProp();
			}
		}

		function nextDefaultProp() {
			defaultPropIndex++;
			if (defaultPropIndex === defaultProps.length) {
				defaultPropIndex = undefined;
				defaultProp = undefined;
			} else {
				defaultProp = defaultProps[defaultPropIndex];
			}
		}

		// Get extensible status
		let nonExtensibleStatus;
		if (Object.isFrozen(val)) {
			nonExtensibleStatus = 'freeze';
		} else if (Object.isSealed(val)) {
			nonExtensibleStatus = 'seal';
		} else if (!Object.isExtensible(val)) {
			nonExtensibleStatus = 'preventExtensions';
		}

		// String keys
		for (const key of Object.getOwnPropertyNames(val)) {
			if (shouldSkipKey && shouldSkipKey(key)) continue;

			// If default prop is missing, delete it
			deleteDefaultProps(key);

			const keyIsComputed = !isJsIdentifier(key);
			const keyNode = keyIsComputed // eslint-disable-line no-nested-ternary
				? isNumberKey(key)
					? t.numericLiteral(key * 1)
					: t.stringLiteral(key)
				: t.identifier(key);
			const propWasDeleted = deletedPropNames.has(key),
				forceDescriptor = propWasDeleted || (shouldForceDescriptor && shouldForceDescriptor(key));
			this.serializeProperty(
				val, key, null, keyNode, keyIsComputed, defaultProp, nonExtensibleStatus,
				props, assignments, circularAssignments, state, forceAssign || propWasDeleted, forceDescriptor
			);

			if (defaultProp) nextDefaultProp();
		}

		// If further missing default props, delete them
		deleteDefaultProps();

		deleteTrailingPropsForCircularAssignments(circularAssignments, props);

		// Symbol keys
		const {varNode} = record,
			varName = varNode.name;
		Object.getOwnPropertySymbols(val).forEach((key, index) => {
			if (shouldSkipKey && shouldSkipKey(key)) return;

			const keyRecord = this.serializeValue(key, `${varName}SymbolKeys_${index}`);
			this.serializeProperty(
				val, key, keyRecord, keyRecord.varNode, true, undefined, nonExtensibleStatus,
				props, assignments, circularAssignments, state, forceAssign, false
			);
		});

		deleteTrailingPropsForCircularAssignments(circularAssignments, props);

		// Get proto record if proto differs from default
		let protoRecord,
			protoIsCircular = false;
		const proto = Object.getPrototypeOf(val);
		if (proto !== defaultProto) {
			protoRecord = this.serializeValue(proto, 'prototype');
			protoIsCircular = forceAssign || recordIsCircular(protoRecord);
		}

		// Create node for object definition
		let node;
		if (props.length === 0) {
			// No properties.
			// If props being set on object, pass through input node unchanged, or create empty object.
			if (inputNode) {
				node = inputNode;
			} else if (protoRecord && !protoIsCircular) {
				const objectCreateRecord = this.serializeValue(Object.create);
				node = t.callExpression(objectCreateRecord.varNode, [protoRecord.varNode]);
				createDependency(record, objectCreateRecord, node, 'callee');
				createDependency(record, protoRecord, node.arguments, 0);
				protoRecord = undefined;
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

			if (!inputNode && protoRecord && !protoIsCircular) {
				const objectCreateRecord = this.serializeValue(Object.create);
				inputNode = t.callExpression(objectCreateRecord.varNode, [protoRecord.varNode]);
				createDependency(record, objectCreateRecord, inputNode, 'callee');
				createDependency(record, protoRecord, inputNode.arguments, 0);
				protoRecord = undefined;
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
				if (protoRecord && !protoIsCircular) {
					// Object with prototype - `Object.create(proto, { ... })`
					methodRecord = this.serializeValue(Object.create);
					targetRecord = protoRecord;
					targetNode = targetRecord.varNode;
					protoRecord = undefined;
				} else {
					// Plain object - `Object.defineProperties({}, { ... })`
					inputNode = t.objectExpression([]);
				}
			}

			if (inputNode) {
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
		let assignment;
		if (assignments.length > 0) {
			if (!state.assignmentsNeedDescriptors) {
				// Assignments do not require descriptors - simple assignments `x.a = v; x.b = v2`
				for (const prop of assignments) {
					const {keyRecord, records: {value: valRecord}} = prop;
					const memberNode = t.memberExpression(varNode, prop.keyNode, prop.keyIsComputed);
					const assignmentNode = t.assignmentExpression('=', memberNode, valRecord.varNode);

					const singleAssignment = createAssignment(record, assignmentNode, memberNode, 'object');
					if (keyRecord) createDependency(singleAssignment, keyRecord, memberNode, 'property');
					createDependency(singleAssignment, valRecord, assignmentNode, 'right');
				}
			} else {
				// Assignments do require descriptors - `Object.defineProperties( x, { ... })`
				const definePropertiesRecord = this.serializeValue(Object.defineProperties);
				const descriptorNodes = [];
				const assignmentNode = t.callExpression(
					definePropertiesRecord.varNode,
					[record.varNode, t.objectExpression(descriptorNodes)]
				);
				assignment = createAssignment(record, assignmentNode, assignmentNode.arguments, 0);
				createDependency(assignment, definePropertiesRecord, assignmentNode, 'callee');

				descriptorNodes.push(...createDescriptorNodes(assignments, assignment));
			}
		}

		// Set prototype
		if (protoRecord) {
			if (!protoIsCircular) {
				const setPrototypeRecord = this.serializeValue(Object.setPrototypeOf);
				node = t.callExpression(setPrototypeRecord.varNode, [node, protoRecord.varNode]);
				createDependency(record, setPrototypeRecord, node, 'callee');
				createDependency(record, protoRecord, node.arguments, 1);
			} else {
				const setPrototypeRecord = this.serializeValue(Object.setPrototypeOf);
				const assignmentNode = t.callExpression(
					setPrototypeRecord.varNode,
					[assignment ? assignment.node : record.varNode, protoRecord.varNode]
				);

				if (assignment) {
					assignment.node = assignmentNode;
				} else {
					assignment = createAssignment(record, assignmentNode, assignmentNode.arguments, 0);
				}

				createDependency(assignment, setPrototypeRecord, assignmentNode, 'callee');
				createDependency(assignment, protoRecord, assignmentNode.arguments, 1);
			}
		}

		// Wrap in `Object.freeze()` / `Object.seal()` / `Object.preventExtensions()`
		if (nonExtensibleStatus) {
			const methodRecord = this.serializeValue(Object[nonExtensibleStatus]);
			let targetRecord, wrappedNode;
			if (assignment) {
				wrappedNode = t.callExpression(methodRecord.varNode, [assignment.node]);
				assignment.node = wrappedNode;
				targetRecord = assignment;
			} else if (record.assignments) {
				wrappedNode = t.callExpression(methodRecord.varNode, [record.varNode]);
				targetRecord = createAssignment(record, wrappedNode, wrappedNode.arguments, 0);
			} else {
				wrappedNode = t.callExpression(methodRecord.varNode, [node]);
				node = wrappedNode;
				targetRecord = record;
			}

			createDependency(targetRecord, methodRecord, wrappedNode, 'callee');
		}

		return node;
	},

	serializeProperty(
		obj, key, keyRecord, keyNode, keyIsComputed, defaultProp, nonExtensibleStatus,
		props, assignments, circularAssignments, state, forceAssign, forceDescriptor
	) {
		// Serialize value, getter and setter
		const descriptor = Object.getOwnPropertyDescriptor(obj, key),
			hasValue = 'value' in descriptor,
			varName = keyRecord ? keyRecord.varNode.name : key,
			records = {};
		let isCircular = forceAssign,
			needsDescriptor = forceDescriptor || (defaultProp ? !defaultProp.writable : false);
		if (hasValue) {
			const {value} = descriptor;
			const defaultValue = defaultProp ? defaultProp.value : undefined;
			if (value !== defaultValue) {
				const valRecord = this.serializeValue(descriptor.value, varName);
				if (recordIsCircular(valRecord)) isCircular = true;
				records.value = valRecord;
			}
		} else {
			const {get: getter, set: setter} = descriptor;
			if (getter || !setter) {
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
		const nonExtensibleModifiers = DEFAULT_NON_EXTENSIBLE_MODIFIERS[nonExtensibleStatus];
		if (!needsDescriptor) {
			let defaultModifiers = defaultProp || DEFAULT_MODIFIERS;
			if (nonExtensibleModifiers) defaultModifiers = {...defaultModifiers, ...nonExtensibleModifiers};
			needsDescriptor = !!modifierNames.find(modifierName => (
				descriptor[modifierName] !== defaultModifiers[modifierName]
			));
		}

		let defaultModifiers = defaultProp
			|| ((isCircular && !forceAssign) ? DEFAULT_MODIFIERS : DEFAULT_REASSIGN_MODIFIERS);
		if (nonExtensibleModifiers) defaultModifiers = {...defaultModifiers, ...nonExtensibleModifiers};
		const modifiers = createModifiers(descriptor, modifierNames, defaultModifiers);

		// If matches default prop in every way, skip this prop
		if (Object.keys(records).length === 0 && Object.keys(modifiers).length === 0) return;

		// Add to properties/assignments
		const prop = {keyRecord, keyNode, keyIsComputed, records, modifiers};
		if (isCircular) {
			prop.descriptor = descriptor;
			defaultModifiers = defaultProp || DEFAULT_REASSIGN_MODIFIERS;
			if (nonExtensibleModifiers) defaultModifiers = {...defaultModifiers, ...nonExtensibleModifiers};
			prop.defaultProp = defaultModifiers;
			assignments.push(prop);

			if (needsDescriptor) state.assignmentsNeedDescriptors = true;
			if (!defaultProp && !forceAssign) {
				props.push({keyRecord, keyNode, keyIsComputed, records: {}, modifiers: DEFAULT_MODIFIERS});
				circularAssignments.push(prop);
			}
		} else {
			props.push(prop);
			if (needsDescriptor) state.propertiesNeedDescriptors = true;
			circularAssignments.length = 0;
		}
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
			prop.defaultProp
		);
	}

	circularAssignments.length = 0;
}

/**
 * Create modifiers object for modifiers whcih differ from default.
 * @param {Object} descriptor - Property descriptor
 * @param {Array<string>} modifierNames - Array of properties to check
 *   e.g. `['enumerable', 'configurable']`
 * @param {Object} defaultProp - Default descriptor
 * @returns {Object} - Modifiers object e.g. `{enumerable: true, configurable: true}`
 */
function createModifiers(descriptor, modifierNames, defaultProp) {
	const modifiers = {};
	for (const modifierName of modifierNames) {
		const value = descriptor[modifierName];
		if (value !== defaultProp[modifierName]) modifiers[modifierName] = value;
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
