/* --------------------
 * livepack module
 * Serialize objects
 * ------------------*/

'use strict';

// Modules
const {isSymbol, isNumber} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const {createDependency, deleteDependency} = require('./records.js'),
	{isIntegerKey, isNumberKey, isJsIdentifier} = require('./utils.js'),
	{PRIMITIVE_TYPE, FUNCTION_TYPE, METHOD_TYPE, UNDEFINED_TYPE} = require('./types.js');

// Constants
const MODIFIER_NAMES = ['writable', 'enumerable', 'configurable'],
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

				getNextDefaultProp();
			}
		};

		function getNextDefaultProp() {
			defaultPropIndex++;
			if (defaultPropIndex === defaultProps.length) {
				defaultPropIndex = undefined;
				nextDefaultProp = undefined;
			} else {
				nextDefaultProp = defaultProps[defaultPropIndex];
			}
		}

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
					getNextDefaultProp();
				} else if (!isNumber(key) || (isNumber(nextDefaultKey) && nextDefaultKey < key)) {
					// TODO Will this result in default props with integer keys getting deleted?
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
				if (get !== defaultGet || (!defaultProp && set === undefined)) {
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
	 * @param {Array<Object>} record.props - Properties
	 * @param {Object} [record.extra.protoRecord] - Record for prototype if it's not default
	 * @param {number} record.extra.extensibility - Extensibility (e.g. `FROZEN`)
	 * @param {Map} record.extra.deletedKeys - Map of deleted keys (key mapped to keyRecord)
	 * @returns {Object} - AST node
	 */
	serializeObject(record) {
		return this.serializeProperties(record, record.props, undefined, false);
	},

	/**
	 * Wrap node with additional properties.
	 * @param {Object} record - Record
	 * @param {Object} [record.extra.protoRecord] - Record for prototype if it's not default
	 * @param {number} record.extra.extensibility - Extensibility (e.g. `FROZEN`)
	 * @param {Map} record.extra.deletedKeys - Map of deleted keys (key mapped to keyRecord)
	 * @param {Array} props - Array of properties
	 * @param {Object} node - AST node
	 * @returns {Object} - AST node wrapped
	 */
	wrapWithProperties(record, props, node) {
		return this.serializeProperties(record, props, node, false);
	},

	/**
	 * Serialize properties.
	 * @param {Object} record - Record
	 * @param {Object} [record.extra.protoRecord] - Record for prototype if it's not default
	 * @param {number} record.extra.extensibility - Extensibility (e.g. `FROZEN`)
	 * @param {Map} record.extra.deletedKeys - Map of deleted keys (key mapped to keyRecord)
	 * @param {Array} props - Array of properties
	 * @param {Object} [node] - AST node to be wrapped with properties
	 * @param {boolean} forceAssignment - `true` to force late assignment
	 * @returns {Object} - AST node
	 */
	serializeProperties(record, props, node, forceAssignment) {
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

		const flushUndefinedProps = () => {
			if (undefinedProps.length === 0) return;

			mainProps.push(...undefinedProps.map((prop) => {
				// If requires define due to setter on prototype chain, main props requires define
				if (prop.requiresDefine) mainPropsRequireDefine = true;

				// Alter modifiers for circular assignment to reflect they will be over-writing
				// undefined placeholder with all modifiers true
				for (const modifierName of MODIFIER_NAMES) {
					const modifier = prop[modifierName];
					if (modifier === true) {
						prop[modifierName] = undefined;
					} else if (modifier === false) {
						circularPropsRequireDefine = true;
					}
				}

				const undefinedRecord = this.traceValue(undefined);
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
					valNode: this.serializeValue(undefinedRecord),
					getNode: undefined,
					setNode: undefined
				};
			}));

			undefinedProps.length = 0;
		};

		function discardUndefinedProps() {
			if (undefinedProps.length === 0) return;

			for (const prop of undefinedProps) {
				if (removePropDefaultModifiers(prop)) circularPropsRequireDefine = true;
			}
			undefinedProps.length = 0;
		}

		let haveFoundSymbolKey = false,
			stringPropHasBeenDeleted = false,
			symbolPropHasBeenDeleted = false;
		for (const prop of props) {
			const {keyRecord, valRecord, key} = prop;
			prop.keyNode = keyRecord ? this.serializeValue(keyRecord) : createKeyNode(key);
			prop.valNode = undefined;
			prop.getNode = undefined;
			prop.setNode = undefined;

			// When hit first Symbol key, clear `undefinedProps`.
			// Symbol keys always are added at end, so no need for trailing `undefined` placeholders for
			// string properties which only have Symbol keys after them.
			if (!haveFoundSymbolKey && keyRecord) {
				haveFoundSymbolKey = true;
				discardUndefinedProps();
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
			const isIntKey = isNumber(key);
			let isCircular = forceAssignment;
			if (keyRecord) {
				if (deletedKeys.has(key)) symbolPropHasBeenDeleted = true;
				if (symbolPropHasBeenDeleted) isCircular = true;
			} else if (!isIntKey) {
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

			// If `__proto__` prop is not circular, require define, otherwise will result in
			// `Object.assign(..., {__proto__: ...})` which has no effect
			if (!isCircular && key === '__proto__') requiresDefine = true;

			if (prop.isExisting) {
				if (!requiresDefine) requiresDefine = MODIFIER_NAMES.some(name => prop[name] !== undefined);
			} else if (isCircular && !isIntKey) {
				// Create placeholder `undefined` property.
				// NB `circularPropsRequireDefine` will be set if necessary due to modifiers later
				// when it becomes clear if `undefined` property is created or not (flushed or discarded).
				undefinedProps.push(prop);
			} else if (removePropDefaultModifiers(prop)) {
				requiresDefine = true;
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

		// Set property modifiers to undefined where default for circular properties
		// with no undefined placeholder
		discardUndefinedProps();

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
			createDependency(record, record);

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
		if (circularProps.length > 0) {
			if (!circularPropsRequireDefine) {
				this.assignmentNodes.push(...circularProps.map((prop) => {
					createDependency(record, record);

					return t.expressionStatement(
						t.assignmentExpression(
							'=',
							t.memberExpression(
								varNode, prop.keyNode, !!prop.keyRecord || !t.isIdentifier(prop.keyNode)
							),
							prop.valNode
						)
					);
				}));
			} else {
				createDependency(record, record);
				assignmentNode = this.createDefinitionNode(circularProps, varNode, 'defineProperties', record);
			}
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

	/**
	 * Create AST node for an Object static method call e.g. `Object.create(...)`.
	 * @param {string} methodName - Method name e.g. 'create'
	 * @param {Array<Object>} argNodes - Array of AST nodes for function call arguments
	 * @param {Object} record - Record
	 * @returns {Object} - AST node
	 */
	createObjectMethodCallNode(methodName, argNodes, record) {
		const methodRecord = this.traceValue(Object[methodName]);
		createDependency(record, methodRecord);
		return t.callExpression(this.serializeValue(methodRecord), argNodes);
	},

	/**
	 * Create AST node for call to `Object.create()` or `Object.defineProperties()`
	 * to define properties on object.
	 * Special handling for `__proto__` property which needs a separate
	 * `Object.defineProperty(obj, '__proto__', ...)` call.
	 * @param {Array<Object>} props - Array of props
	 * @param {Object} node - Base object node for `Object.defineProperties()`
	 *   or prototype node for `Object.create()`
	 * @param {string} methodName - Either 'defineProperties' or 'create'
	 * @param {Object} record - Record for base object
	 * @returns {Object} - AST node
	 */
	createDefinitionNode(props, node, methodName, record) {
		const propNodes = [],
			postProtoPropNodes = [];
		let protoObjNode;
		for (const prop of props) {
			const attrNodes = [];
			if (prop.valNode) {
				if (!prop.isExisting && prop.valRecord.type === UNDEFINED_TYPE) {
					// No need for `value: undefined` if not overwriting existing value
					deleteDependency(record, prop.valRecord);
				} else {
					attrNodes.push(createStringObjectPropNode('value', prop.valNode, prop.valRecord));
				}
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
				const propNode = t.objectProperty(prop.keyNode, objNode, !!prop.keyRecord);
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

/**
 * Set prop modifiers to `undefined` where they're the default.
 * Return `true` if property will require definition (`Object.defineProperties()`).
 * Should only be used on previously non-existent properties.
 * @param {Object} prop - Prop object
 * @returns {boolean} - `true` if requires define
 */
function removePropDefaultModifiers(prop) {
	let requiresDefine = false;
	for (const modifierName of MODIFIER_NAMES) {
		if (prop[modifierName] === false) {
			prop[modifierName] = undefined;
			requiresDefine = true;
		}
	}
	return requiresDefine;
}

/**
 * Create property key node.
 * @param {string|number} key - Property key
 * @returns {Object} - AST node for key
 */
function createKeyNode(key) {
	if (isNumber(key)) return t.numericLiteral(key);
	if (isNumberKey(key)) return t.numericLiteral(key * 1);
	if (isJsIdentifier(key)) return t.identifier(key);
	return t.stringLiteral(key);
}

/**
 * Create AST node for object property with string key.
 * Key must be a valid JS identifier.
 * @param {string} key - Property key
 * @param {Object} valNode - AST node for value
 * @param {Object} valRecord - Record for value
 * @returns {Object} - AST node for object property
 */
function createStringObjectPropNode(key, valNode, valRecord) {
	return createObjectPropNode(t.identifier(key), valNode, valRecord, false);
}

/**
 * Create AST node for object property.
 * If value is an unnamed function, wraps in `(0, ...)` to prevent it getting named.
 * If value is a method wrapped in an object with name name as property name, unwraps it
 * (i.e. `x: {x() {}}.x` to `x() {}`).
 * @param {Object} keyNode - AST node for key
 * @param {Object} valNode - AST node for value
 * @param {Object} valRecord - Record for value
 * @param {boolean} isComputed - `true` if key is computed
 * @returns {Object} - AST node for object property
 */
function createObjectPropNode(keyNode, valNode, valRecord, isComputed) {
	const {type} = valRecord;
	if (type === FUNCTION_TYPE) {
		// Wrap unnamed function in `(0, ...)`
		if ((t.isClass(valNode) || t.isFunction(valNode)) && !valNode.id) {
			valNode = t.sequenceExpression([t.numericLiteral(0), valNode]);
		}
	} else if (!isComputed && type === METHOD_TYPE) {
		// Unwrap `x: {x() {}}.x` to `x() {}`
		const methodNode = getWrappedMethod(valNode, keyNode);
		if (methodNode) return methodNode;
	}

	return t.objectProperty(keyNode, valNode, isComputed, true);
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
