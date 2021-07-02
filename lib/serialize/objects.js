/* --------------------
 * livepack module
 * Serialize objects
 * ------------------*/

'use strict';

// Modules
const {isSymbol, isNumber} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const {createDependency, createAssignment} = require('./records.js'),
	{recordIsCircular, isIntegerKey, isJsIdentifier} = require('./utils.js'),
	{PRIMITIVE_TYPE, FUNCTION_TYPE, METHOD_TYPE} = require('./types.js');

// Constants
const DEFAULT_MODIFIERS = {writable: true, enumerable: true, configurable: true},
	DEFAULT_REASSIGN_MODIFIERS = {writable: false, enumerable: false, configurable: false},
	DEFAULT_NON_EXTENSIBLE_MODIFIERS = {
		freeze: {writable: false, configurable: false},
		seal: {configurable: false}
	},
	MODIFIER_NAMES = ['writable', 'enumerable', 'configurable'],
	VALUELESS_MODIFIER_NAMES = ['enumerable', 'configurable'],
	EXTENSIBLE = 0,
	NOT_EXTENSIBLE = 1,
	SEALED = 2,
	FROZEN = 3,
	EXTENSIBLE_METHODS = ['', 'preventExtensions', 'seal', 'freeze'];

// Exports

module.exports = {
	/**
	 * Trace Object.
	 * @param {Object} obj - Object
	 * @param {Object} record - Record
	 * @returns {Function} - Serializer function
	 */
	traceObject(obj, record) {
		this.traceProperties(obj, record, Object.prototype, undefined, undefined);
		return this.serializeObject;
	},

	/**
	 * Trace properties - values, getters, setters, descriptor modifiers (`enumerable` etc).
	 *
	 * Records:
	 *   - properties as `record.props` (Array)
	 *   - prototype record as `record.extra.protoRecord`
	 *   - extensibility (e.g. sealed, frozen) as `record.extra.extensibility` (number)
	 *   - deleted keys as `record.extra.deletedKeys` (Map)
	 *
	 * `records.props` is array of Objects of with properties:
	 *   `key` {string|number|Symbol} - Property key
	 *   `keyRecord` {Object|undefined} - Record for key if key is a Symbol
	 *   `valRecord` {Object|undefined} - Record for value if has value
	 *   `getRecord` {Object|undefined} - Record for getter if has getter
	 *   `setRecord` {Object|undefined} - Record for setter if has setter
	 *   `writable` {boolean|undefined} - Value of `writable` descriptor modifier if prop has value
	 *   `enumerable` {boolean|undefined} - Value of `enumerable` descriptor modifier
	 *   `configurable` {boolean|undefined} - Value of `configurable` descriptor modifier
	 *   `isExisting` {boolean} - `true` if is existing property
	 *   `requiresDefine` {boolean} - `true` if requires define not assignment
	 *
	 * `valRecord`, `getRecord`, `setRecord` are `undefined` if not defined or if unchanged from
	 * default property.
	 * `writable`, `enumerable`, `configurable` are `undefined` if unchanged from default property
	 * or, if no default property, unchanged from default
	 * (`true` usually but may be `false` if object is frozen/sealed).
	 *
	 * @param {*} val - Value
	 * @param {Object} record - Record
	 * @param {Object|null} defaultProto - Default prototype
	 * @param {Array} [defaultProps] - Default props array
	 * @param {Function} [shouldSkipKey] - Function to determine if key should be skipped
	 * @returns {undefined}
	 */
	traceProperties(val, record, defaultProto, defaultProps, shouldSkipKey) {
		// Get extensibility
		const extensibility = Object.isFrozen(val) ? FROZEN
			: Object.isSealed(val) ? SEALED
				: Object.isExtensible(val) ? EXTENSIBLE
					: NOT_EXTENSIBLE;
		const isNotFrozen = extensibility !== FROZEN,
			isNotSealedOrFrozen = isNotFrozen && extensibility !== SEALED;

		// Get prototype
		let protoRecord;
		const proto = Object.getPrototypeOf(val),
			varName = record.name;
		if (proto !== defaultProto) {
			protoRecord = this.traceValue(proto, `${varName}Prototype`, '[prototype]');
			createDependency(record, protoRecord);
		}

		// Init default prop tracker
		let nextDefaultProp, defaultPropIndex;
		if (defaultProps) {
			nextDefaultProp = defaultProps[0];
			defaultPropIndex = 0;
		}

		const deletedKeys = new Map();
		const deleteDefaultProps = (nextKey) => {
			while (nextDefaultProp && nextDefaultProp.key !== nextKey) {
				const {key} = nextDefaultProp;
				let keyRecord;
				if (isSymbol(key)) {
					// NB Key will be a global signal, so no need to provide name
					keyRecord = this.traceValue(key, '', `[SymbolKeys ${defaultPropIndex}]`);
					createDependency(record, keyRecord);
				}
				deletedKeys.set(key, keyRecord);

				defaultPropIndex++;
				if (defaultPropIndex === defaultProps.length) {
					defaultPropIndex = undefined;
					nextDefaultProp = undefined;
				} else {
					nextDefaultProp = defaultProps[defaultPropIndex];
				}
			}
		};

		// Trace properties
		const props = [];
		const processProp = (key, symbolKeyIndex, descriptor, keyName, keyDescription) => {
			// Skip key if not needed
			if (shouldSkipKey && shouldSkipKey(key)) return;

			// If default props are missing, delete them.
			// Integer keys always come first even if assigned later, so no need to maintain order for them,
			// except against other integer keys.
			let defaultProp;
			if (nextDefaultProp) {
				const nextDefaultKey = nextDefaultProp.key;
				if (nextDefaultKey === key) {
					defaultProp = nextDefaultProp;
				} else if (!isNumber(key) || (isNumber(nextDefaultKey) && nextDefaultKey < key)) {
					deleteDefaultProps(key);
					defaultProp = nextDefaultProp;
				}
			}

			const isExisting = !!defaultProp;
			let needProp = !isExisting,
				requiresDefine = false,
				valRecord, getRecord, setRecord, writable;
			if ('value' in descriptor) {
				// Property has value
				const {value} = descriptor;
				if (!defaultProp || defaultProp.val !== value) {
					valRecord = this.traceValue(value, keyName, keyDescription);
					createDependency(record, valRecord);
					needProp = true;

					if (defaultProp && !defaultProp.writable) {
						// Existing prop which is not writable - needs define not assign to set
						requiresDefine = true;
					} else {
						// Check if setter for property on prototype chain.
						// If so, requires define rather than assign.
						let currentProto = proto;
						while (currentProto) {
							const protoDescriptor = Object.getOwnPropertyDescriptor(currentProto, key);
							if (protoDescriptor && !('value' in protoDescriptor)) {
								requiresDefine = true;
								break;
							}
							currentProto = Object.getPrototypeOf(currentProto);
						}
					}
				}

				if (isNotFrozen) {
					if (!defaultProp) {
						writable = descriptor.writable;
						if (!writable) needProp = true;
					} else if (descriptor.writable !== defaultProp.writable) {
						writable = descriptor.writable;
						needProp = true;
					}
				}
			} else {
				// Property has getter/setter
				const {get, set} = descriptor,
					{get: defaultGet, set: defaultSet} = defaultProp || {get: undefined, set: undefined};
				if (get !== defaultGet) {
					getRecord = this.traceValue(get, `${keyName}Getter`, `${keyDescription}[getter]`);
					createDependency(record, getRecord);
					needProp = true;
				}
				if (set !== defaultSet) {
					getRecord = this.traceValue(set, `${keyName}Setter`, `${keyDescription}[setter]`);
					createDependency(record, setRecord);
					needProp = true;
				}
			}

			let enumerable, configurable;
			if (!defaultProp) {
				enumerable = descriptor.enumerable;
				if (!enumerable) needProp = true;
			} else if (descriptor.enumerable !== defaultProp.enumerable) {
				enumerable = descriptor.enumerable;
				needProp = true;
			}

			if (isNotSealedOrFrozen) {
				if (!defaultProp) {
					configurable = descriptor.configurable;
					if (!configurable) needProp = true;
				} else if (descriptor.configurable !== defaultProp.configurable) {
					configurable = descriptor.configurable;
					needProp = true;
				}
			}

			if (!needProp) return;

			let keyRecord;
			if (symbolKeyIndex !== undefined) {
				keyRecord = this.traceValue(key, keyName, `[SymbolKeys ${symbolKeyIndex}]`);
				createDependency(record, keyRecord);
			}

			props.push({
				key,
				keyRecord,
				valRecord,
				getRecord,
				setRecord,
				writable,
				enumerable,
				configurable,
				isExisting,
				requiresDefine
			});
		};

		const descriptors = Object.getOwnPropertyDescriptors(val);
		for (const [keyStr, descriptor] of Object.entries(descriptors)) {
			const key = isIntegerKey(keyStr) ? keyStr * 1 : keyStr;
			processProp(key, undefined, descriptor, keyStr, `.${keyStr}`);
		}

		Object.getOwnPropertySymbols(descriptors).forEach((key, index) => {
			processProp(key, index, descriptors[key], `${varName}SymbolKeys_${index}`, `[${key.toString()}]`);
		});

		deleteDefaultProps(undefined);

		// Record details
		record.props = props;
		record.extra = {protoRecord, extensibility, deletedKeys};
	},

	/**
	 * Serialize Object.
	 * @param {Object} record - Record
	 * @returns {Object} - AST node
	 */
	serializeObject(record) {
		return this.serializeProperties(record, undefined, false);
	},

	/**
	 * Wrap node with additional properties.
	 * @param {Object} record - Record
	 * @param {Object} node - AST node
	 * @returns {Object} - AST node wrapped
	 */
	wrapWithProperties(record, node) {
		return this.serializeProperties(record, node, false);
	},

	/**
	 * Serialize properties.
	 * @param {Object} record - Record
	 * @param {Object} [node] - AST node to be wrapped with properties
	 * @param {boolean} forceAssignment - `true` to force late assignment
	 * @returns {Object} - AST node
	 */
	serializeProperties(record, node, forceAssignment) {
		// Serialize prototype
		const {extra} = record,
			{protoRecord, deletedKeys} = extra;
		let protoNode,
			protoIsCircular,
			ignoreRequiresDefineFlags = false;
		if (protoRecord) {
			protoNode = this.serializeValue(protoRecord);
			protoIsCircular = protoRecord.isCircular;
			if (protoIsCircular) {
				// Prototype should be set before any properties, to avoid assignments which hit setters
				// on prototype chain. If prototype is circular, this is not possible.
				// In this case, if wrapping a node, force all properties to be late assignments,
				// so they can be made after `Object.setPrototypeOf()`.
				// If not wrapping a node, initial prototype will be `Object.prototype` so ignore
				// `prop.requiresDefine` flags so `__proto__` is treated as only property with a setter.
				if (node) {
					forceAssignment = true;
				} else {
					ignoreRequiresDefineFlags = true;
				}
			} else if (node) {
				// Wrapping node - set prototype
				node = this.createObjectMethodCallNode('setPrototypeOf', [node, protoNode], record);
				protoNode = undefined;
			}
		}

		// Serialize keys and values, identify circular references, and determine if properties
		// or circular properties require definition with `Object.defineProperties()`
		const mainProps = [],
			circularProps = [],
			undefinedProps = [];
		let mainPropsRequireDefine = false,
			circularPropsRequireDefine = false;

		const undefinedRecord = this.traceValue(undefined, 'undefined');
		const flushUndefinedProps = () => {
			if (undefinedProps.length === 0) return;

			mainProps.push(...undefinedProps.map((prop) => {
				// If requires define due to setter on prototype chain, main props requires define
				if (prop.requiresDefine) mainPropsRequireDefine = true;

				const undefinedNode = this.serializeValue(undefinedRecord);
				createDependency(record, undefinedRecord);

				return {
					key: prop.key,
					keyRecord: prop.keyRecord,
					valRecord: undefinedRecord,
					getRecord: undefined,
					setRecord: undefined,
					writable: true,
					enumerable: true,
					configurable: true,
					isExisting: false,
					requiresDefine: prop.requiresDefine,
					keyNode: prop.keyNode,
					valNode: undefinedNode,
					getNode: undefined,
					setNode: undefined
				};
			}));

			undefinedProps.length = 0;
		};

		let haveFoundSymbolKey = false,
			stringPropHasBeenDeleted = false,
			symbolPropHasBeenDeleted = false;
		for (const prop of record.props) {
			const {keyRecord, valRecord, key} = prop;
			prop.keyNode = keyRecord ? this.serializeValue(keyRecord) : createKeyNode(key);
			prop.valNode = undefined;
			prop.getNode = undefined;
			prop.setNode = undefined;

			// When hit first Symbol key, clear `undefinedProps`.
			// Symbol keys always are added at end, so no need for trailing `undefined` placeholders for
			// properties which only have Symbol keys after them.
			if (!haveFoundSymbolKey && keyRecord) {
				haveFoundSymbolKey = true;
				undefinedProps.length = 0;
			}

			// If prototype defined after all properties, override `prop.requiresDefine`
			let requiresDefine;
			if (ignoreRequiresDefineFlags) {
				requiresDefine = key === '__proto__';
				prop.requiresDefine = requiresDefine;
			} else {
				requiresDefine = prop.requiresDefine;
			}

			// If property has been deleted, it and all other props of its kind (string, symbol)
			// must be assigned late so assignment comes after property is deleted
			const isNumberKey = isNumber(key);
			let isCircular = forceAssignment;
			if (keyRecord) {
				if (deletedKeys.has(key)) symbolPropHasBeenDeleted = true;
				if (symbolPropHasBeenDeleted) isCircular = true;
			} else if (!isNumberKey) {
				if (deletedKeys.has(key)) stringPropHasBeenDeleted = true;
				if (stringPropHasBeenDeleted) isCircular = true;
			}

			// Serialize value, getter, setter + determine if requires define (`Object.defineProperties()`)
			// and whether is circular so requires late assignment.
			if (valRecord) {
				prop.valNode = this.serializeValue(valRecord);
				if (valRecord.isCircular) isCircular = true;
			} else {
				requiresDefine = true;
				const {getRecord, setRecord} = prop;
				if (getRecord) {
					prop.getNode = this.serializeValue(getRecord);
					if (getRecord.isCircular) isCircular = true;
				}
				if (setRecord) {
					prop.getNode = this.serializeValue(setRecord);
					if (setRecord.isCircular) isCircular = true;
				}
			}

			if (prop.isExisting) {
				if (!requiresDefine) requiresDefine = MODIFIER_NAMES.some(name => prop[name] !== undefined);
			} else if (isCircular && !isNumberKey) {
				undefinedProps.push(prop);
				for (const modifierName of MODIFIER_NAMES) {
					const modifier = prop[modifierName];
					if (modifier === true) {
						prop[modifierName] = undefined;
					} else if (modifier === false) {
						requiresDefine = true;
					}
				}
			} else {
				for (const modifierName of MODIFIER_NAMES) {
					if (prop[modifierName] === false) {
						prop[modifierName] = undefined;
						requiresDefine = true;
					}
				}
			}

			if (!isCircular) {
				flushUndefinedProps();
				mainProps.push(prop);
				if (requiresDefine) mainPropsRequireDefine = true;
			} else {
				circularProps.push(prop);
				if (requiresDefine) circularPropsRequireDefine = true;
			}
		}

		// Assemble object definition
		if (!mainPropsRequireDefine) {
			// Main props do not require defining props.
			// Define as plain object or, if wrapping, use `Object.assign()`.
			const objNode = t.objectExpression(mainProps.map(
				prop => createObjectPropNode(prop.keyNode, prop.valNode, prop.valRecord, !!prop.keyRecord)
			));

			if (!node && protoNode && !protoIsCircular) {
				node = this.createObjectMethodCallNode('create', [protoNode], record);
				protoNode = undefined;
			}

			if (!node) {
				node = objNode;
			} else if (mainProps.length > 0) {
				node = this.createObjectMethodCallNode('assign', [node, objNode], record);
			}
		} else if (!node && protoNode && !protoIsCircular) {
			// No node to be wrapped and needs prototype defined - use `Object.create()`
			if (mainProps[0].key === '__proto__') {
				node = this.createDefinitionNode(
					mainProps,
					this.createObjectMethodCallNode('create', [protoNode], record),
					'defineProperties',
					record
				);
			} else {
				node = this.createDefinitionNode(mainProps, protoNode, 'create', record);
			}
			protoNode = undefined;
		} else {
			// No prototype
			if (!node) node = t.objectExpression([]);
			node = this.createDefinitionNode(mainProps, node, 'defineProperties', record);
		}

		// Delete props
		const {varNode} = record;
		for (const [key, keyRecord] of deletedKeys) {
			this.assignmentNodes.push(
				t.expressionStatement(
					t.unaryExpression(
						'delete',
						// NB Default prop keys are always valid identifiers so no need to test for that
						keyRecord ? t.memberExpression(varNode, this.serializeValue(keyRecord), true)
							: isNumber(key) ? t.memberExpression(record.varNode, t.numericLiteral(key), true)
								: t.memberExpression(record.varNode, t.identifier(key))
					)
				)
			);
		}

		// Add assignments for circular props
		let assignmentNode;
		if (!circularPropsRequireDefine) {
			this.assignmentNodes.push(...circularProps.map(prop => (
				t.expressionStatement(
					t.assignmentExpression(
						'=',
						t.memberExpression(varNode, prop.keyNode, prop.keyRecord || !t.isIdentifier(prop.keyNode)),
						prop.valNode
					)
				)
			)));
		} else {
			assignmentNode = this.createDefinitionNode(circularProps, varNode, 'defineProperties', record);
		}

		// Add prototype
		if (protoNode) {
			if (!assignmentNode) assignmentNode = varNode;

			assignmentNode = this.createObjectMethodCallNode(
				'setPrototypeOf', [assignmentNode, this.serializeValue(protoRecord)], record
			);
		}

		// Add extensibility wrapper
		const {extensibility} = extra;
		if (extensibility !== EXTENSIBLE) {
			if (!assignmentNode && circularProps.length > 0) assignmentNode = varNode;
			const wrappedNode = this.createObjectMethodCallNode(
				EXTENSIBLE_METHODS[extensibility], [assignmentNode || node], record
			);
			if (assignmentNode) {
				assignmentNode = wrappedNode;
			} else {
				node = wrappedNode;
			}
		}

		if (assignmentNode) this.assignmentNodes.push(t.expressionStatement(assignmentNode));

		// Return main node
		return node;
	},

	createObjectMethodCallNode(methodName, argNodes, record) {
		const methodRecord = this.traceValue(Object[methodName]);
		createDependency(record, methodRecord);
		return t.callExpression(this.serializeValue(methodRecord), argNodes);
	},

	createDefinitionNode(props, node, methodName, record) {
		const propNodes = [],
			postProtoPropNodes = [];
		let protoObjNode;
		for (const prop of props) {
			const attrNodes = [];
			if (prop.valNode) {
				attrNodes.push(createStringObjectPropNode('value', prop.valNode, prop.valRecord));
			}
			if (prop.getNode) {
				attrNodes.push(createStringObjectPropNode('get', prop.getNode, prop.getRecord));
			}
			if (prop.setNode) {
				attrNodes.push(createStringObjectPropNode('set', prop.setNode, prop.setRecord));
			}

			for (const modifier of MODIFIER_NAMES) {
				if (prop[modifier] !== undefined) {
					attrNodes.push(createStringObjectPropNode(
						modifier, t.booleanLiteral(prop[modifier]), {type: PRIMITIVE_TYPE}
					));
				}
			}

			const objNode = t.objectExpression(attrNodes);

			if (prop.key === '__proto__') {
				protoObjNode = objNode;
			} else {
				const propNode = t.objectProperty(prop.keyNode, objNode);
				if (protoObjNode) {
					postProtoPropNodes.push(propNode);
				} else {
					propNodes.push(propNode);
				}
			}
		}

		if (propNodes.length > 0) {
			node = this.createObjectMethodCallNode(methodName, [node, t.objectExpression(propNodes)], record);
		}

		if (protoObjNode) {
			node = this.createObjectMethodCallNode(
				'defineProperty', [node, t.stringLiteral('__proto__'), protoObjNode], record
			);

			if (postProtoPropNodes.length > 0) {
				node = this.createObjectMethodCallNode(
					'defineProperties', [node, t.objectExpression(postProtoPropNodes)], record
				);
			}
		}

		return node;
	}
};

function createKeyNode(key) {
	if (isNumber(key)) return t.numericLiteral(key);
	if (isJsIdentifier(key)) return t.identifier(key);
	return t.stringLiteral(key);
}

function createObjectPropNode(keyNode, valNode, valRecord, isComputed) {
	// Wrap unnamed functions in `(0, ...)` to prevent them getting named.
	// Unwrap `x: {x() {}}.x` to `x() {}`.
	const {type} = valRecord;
	if (type === FUNCTION_TYPE) {
		if ((t.isClass(valNode) || t.isFunction(valNode)) && !valNode.id) {
			valNode = t.sequenceExpression([t.numericLiteral(0), valNode]);
		}
	} else if (!isComputed && type === METHOD_TYPE) {
		const methodNode = getWrappedMethod(valNode, keyNode);
		if (methodNode) return methodNode;
	}

	return t.objectProperty(keyNode, valNode, isComputed, true);
}

function createStringObjectPropNode(key, valNode, valRecord) {
	return createObjectPropNode(t.identifier(key), valNode, valRecord, false);
}

/**
 * Determine if a node is an object method wrapped in an object with stated key.
 * e.g. `{x() {}}.x`, `{'0a'() {}}['0a']`, `{0() {}}[0]`
 * If so, return method AST node.
 * @param {Object} node - Method AST node
 * @param {Object} keyNode - Key node for property
 * @returns {Object} - Method AST node or `undefined` if cannot be unwrapped
 */
function getWrappedMethod(node, keyNode) {
	if (!t.isMemberExpression(node)) return;

	const methodNode = node.object.properties[0];
	if (methodNode.computed) return;

	const methodKeyNode = methodNode.key,
		methodKeyType = methodKeyNode.type;
	if (methodKeyType !== keyNode.type) return;

	const valueKey = methodKeyType === 'Identifier' ? 'name' : 'value';
	if (methodKeyNode[valueKey] !== keyNode[valueKey]) return;

	return methodNode; // eslint-disable-line consistent-return
}

/*
 * Everything below is old.
 */

const oldExports = { // eslint-disable-line no-unused-vars
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
				// NB Default prop keys are always valid identifiers
				const key = nextDefaultProp.name;
				const memberNode = isIntegerKey(key)
					? t.memberExpression(record.varNode, t.numericLiteral(key * 1), true)
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
					|| (isIntegerKey(nextDefaultKey) && nextDefaultKey * 1 < key * 1)
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
			const {value} = descriptor;
			const defaultValue = defaultProp ? defaultProp.value : undefined;
			if (value !== defaultValue) {
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
