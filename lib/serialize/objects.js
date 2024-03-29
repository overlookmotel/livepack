/* --------------------
 * livepack module
 * Serialize objects
 * ------------------*/

'use strict';

// Modules
const {isSymbol} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const {createDependency, createAssignment} = require('./records.js'),
	{createKeyNode, recordIsCircular, isIntegerKey} = require('./utils.js');

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
		let nextDefaultProp, defaultPropIndex;
		if (defaultProps) {
			nextDefaultProp = defaultProps[0];
			defaultPropIndex = 0;
		}

		const deletedPropNames = new Set();
		function deleteDefaultProps(nextKey) {
			while (nextDefaultProp && nextDefaultProp.name !== nextKey) {
				// NB: Default prop keys are always valid identifiers
				const key = nextDefaultProp.name;
				const memberNode = isIntegerKey(key)
					? t.memberExpression(record.varNode, t.numericLiteral(+key), true)
					: t.memberExpression(record.varNode, t.identifier(key));
				const assignmentNode = t.unaryExpression('delete', memberNode);
				createAssignment(record, assignmentNode, memberNode, 'object', true);

				deletedPropNames.add(key);

				getNextDefaultProp();
			}
		}

		function getNextDefaultProp() {
			defaultPropIndex++;
			if (defaultPropIndex === defaultProps.length) {
				defaultPropIndex = undefined;
				nextDefaultProp = undefined;
			} else {
				nextDefaultProp = defaultProps[defaultPropIndex];
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
		let stringKeysForceAssign = forceAssign;
		for (const key of Object.getOwnPropertyNames(val)) {
			if (shouldSkipKey && shouldSkipKey(key)) continue;

			// If default props are missing, delete them.
			// Integer keys always come first even if assigned later, so no need to maintain order for them,
			// except against other integer keys.
			let defaultProp;
			if (nextDefaultProp) {
				const nextDefaultKey = nextDefaultProp.name;
				if (nextDefaultKey === key) {
					defaultProp = nextDefaultProp;
				} else if (
					!isIntegerKey(key)
					|| (isIntegerKey(nextDefaultKey) && +nextDefaultKey < +key)
				) {
					deleteDefaultProps(key);
					defaultProp = nextDefaultProp;
				}
			}

			const keyNode = createKeyNode(key),
				keyIsComputed = !t.isIdentifier(keyNode);
			const propWasDeleted = deletedPropNames.has(key);
			const forceDescriptor = propWasDeleted
				|| key === '__proto__'
				|| (shouldForceDescriptor && shouldForceDescriptor(key))
				|| needsDefine(val, key);
			const isCircular = this.serializeProperty(
				val, key, null, keyNode, keyIsComputed, defaultProp, nonExtensibleStatus,
				props, assignments, circularAssignments, state,
				stringKeysForceAssign || propWasDeleted, forceDescriptor
			);

			// If `__proto__` prop is circular, force all following props to be assigned later too.
			// Otherwise end up with a placeholder prop `{__proto__: void 0}` which wrongly sets
			// prototype to `null`.
			if (isCircular && key === '__proto__') stringKeysForceAssign = true;

			if (defaultProp) getNextDefaultProp();
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
			protoRecord = this.serializeValue(proto, 'prototype', '<prototypeOf>');
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
					const {keyRecord} = prop;
					const valRecord = prop.records.value || this.serializeValue(undefined);
					const propNode = t.objectProperty(prop.keyNode, valRecord.varNode, !!keyRecord, true);
					if (keyRecord) createDependency(record, keyRecord, propNode, 'key');
					createDependency(record, valRecord, propNode, 'value');
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
			let method, targetRecord, targetNode;
			if (!inputNode) {
				// New object
				if (protoRecord && !protoIsCircular) {
					// Object with prototype - `Object.create(proto, { ... })`
					method = Object.create;
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
				method = Object.defineProperties;
				targetNode = inputNode;
			}

			node = this.createDescriptorsNode(targetNode, method, props, record);

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
				assignment = createAssignment(record, null);

				const assignmentNode = this.createDescriptorsNode(
					record.varNode, Object.defineProperties, assignments, assignment
				);
				assignment.node = assignmentNode;

				createDependency(assignment, record, assignmentNode.arguments, 0);
			}
		}

		// Set prototype
		if (protoRecord) {
			const setPrototypeRecord = this.serializeValue(Object.setPrototypeOf);
			if (!protoIsCircular) {
				node = t.callExpression(setPrototypeRecord.varNode, [node, protoRecord.varNode]);
				createDependency(record, setPrototypeRecord, node, 'callee');
				createDependency(record, protoRecord, node.arguments, 1);
			} else {
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
			records = {},
			traceKey = isSymbol(key) ? `[${key.toString()}]` : `.${key}`;
		let isCircular = forceAssign,
			needsDescriptor = forceDescriptor || (defaultProp ? !defaultProp.writable : false);
		if (hasValue) {
			if (descriptor.value !== defaultProp?.value) {
				const valRecord = this.serializeValue(descriptor.value, varName, traceKey);
				if (recordIsCircular(valRecord)) isCircular = true;
				records.value = valRecord;
			}
		} else {
			const {get: getter, set: setter} = descriptor;
			if (getter || !setter) {
				const getterRecord = this.serializeValue(getter, `${varName}Getter`, `<getter> ${traceKey}`);
				if (recordIsCircular(getterRecord)) isCircular = true;
				records.get = getterRecord;
			}
			if (setter) {
				const setterRecord = this.serializeValue(setter, `${varName}Setter`, `<setter> ${traceKey}`);
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
		if (Object.keys(records).length === 0 && Object.keys(modifiers).length === 0) return false;

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

		return isCircular;
	},

	/**
	 * Create node for descriptors.
	 * e.g. `Object.defineProperties(x, { a: { value: 1, enumerable: true }, b: { get: () => {} } })`
	 * A property named '__proto__' requires special treatment - use `Object.defineProperty()`
	 * for '__proto__' property only.
	 * @param {Object} targetNode - Node to be wrapped with descriptors
	 * @param {Function} method - `Object.defineProperties` / `Object.create`
	 * @param {Array} props - Array of prop objects
	 * @param {Object} record - Record to create dependencies of
	 * @returns {Object} - Node for descriptors
	 */
	createDescriptorsNode(targetNode, method, props, record) {
		const propNodes = [];
		for (const prop of props) {
			const {keyRecord, keyNode} = prop;
			if (!keyRecord && t.isIdentifier(keyNode) && keyNode.name === '__proto__') break;

			const descriptorPropsNode = this.createDescriptorPropsNode(prop, record);

			const node = t.objectProperty(keyNode, descriptorPropsNode, !!keyRecord, true);
			if (keyRecord) createDependency(record, keyRecord, node, 'key');
			propNodes.push(node);
		}

		let node = targetNode;
		if (propNodes.length > 0 || method === Object.create) {
			const methodRecord = this.serializeValue(method);
			node = t.callExpression(
				methodRecord.varNode,
				[node, ...(propNodes.length > 0 ? [t.objectExpression(propNodes)] : [])]
			);

			createDependency(record, methodRecord, node, 'callee');
		}

		if (propNodes.length < props.length) {
			// `__proto__` property encountered
			const index = propNodes.length;
			const definePropertyRecord = this.serializeValue(Object.defineProperty);
			node = t.callExpression(
				definePropertyRecord.varNode,
				[node, t.stringLiteral('__proto__'), this.createDescriptorPropsNode(props[index], record)]
			);
			createDependency(record, definePropertyRecord, node, 'callee');

			if (index + 1 < props.length) {
				// Further props after `__proto__`
				node = this.createDescriptorsNode(node, Object.defineProperties, props.slice(index + 1), record);
			}
		}

		return node;
	},

	createDescriptorPropsNode(prop, record) {
		const propNodes = Object.entries(prop.records).map(
			([key, valueRecord]) => {
				const propNode = t.objectProperty(t.identifier(key), valueRecord.varNode, false, true);
				createDependency(record, valueRecord, propNode, 'value');
				return propNode;
			}
		);

		for (const [modifierName, value] of Object.entries(prop.modifiers)) {
			propNodes.push(t.objectProperty(t.identifier(modifierName), t.booleanLiteral(value)));
		}

		return t.objectExpression(propNodes);
	}
};

function needsDefine(obj, key) {
	let proto = obj;
	while (true) { // eslint-disable-line no-constant-condition
		proto = Object.getPrototypeOf(proto);
		if (proto === null) return false;
		const descriptor = Object.getOwnPropertyDescriptor(proto, key);
		if (descriptor) return !('value' in descriptor);
	}
}

/**
 * Delete trailing placeholder props which will be set later by assignment.
 * As assignment will add these props on the end, placeholders can be removed
 * without disrupting key order.
 * @param {Array<Object>} circularAssignments - Array of assignments
 * @param {Array<Object>} props - Array of props
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
