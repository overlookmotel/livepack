/* --------------------
 * livepack module
 * Serialize objects
 * ------------------*/

'use strict';

// Modules
const {isNumber} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const {isIntegerKey, isNumberKey, isJsIdentifier} = require('./utils.js'),
	{FUNCTION_TYPE, METHOD_TYPE, OBJECT_TYPE, GLOBAL_TYPE, registerSerializer} = require('./types.js');

// Constants
const MODIFIER_NAMES = ['writable', 'enumerable', 'configurable'],
	EXTENSIBLE = 0,
	NOT_EXTENSIBLE = 1,
	SEALED = 2,
	FROZEN = 3,
	EXTENSIBLE_METHODS = ['', Object.preventExtensions, Object.seal, Object.freeze],
	INTEGER_KEY = 0,
	STRING_KEY = 1,
	SYMBOL_KEY = 2,
	NO_KEY = 3;

// Exports

module.exports = {
	/**
	 * Trace Object.
	 * @param {Object} obj - Object
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceObject(obj, record) {
		this.traceProperties(obj, record, undefined);
		return OBJECT_TYPE;
	},

	traceProperties,

	/**
	 * Wrap node with additional properties.
	 * @param {Object} node - AST node
	 * @param {Object} record - Record
	 * @param {Object} record.protoRecord - Record for prototype
	 * @param {number} record.extensibility - Extensibility (e.g. `FROZEN`)
	 * @param {Object} defaultProtoRecord - Record for default prototype
	 * @param {Array} [existingProps] - Array of default properties (or `null` if none)
	 * @returns {Object} - AST node wrapped
	 */
	wrapWithProperties(node, record, defaultProtoRecord, existingProps) {
		// TODO: Alter all callers for changed params
		return this.serializeProperties(record, defaultProtoRecord, existingProps, node, false);
	},

	// TODO: Write a long comment here explaining how `serializeProperties()` works
	/**
	 * Serialize properties.
	 * @param {Object} record - Record
	 * @param {Object} record.protoRecord - Record for prototype
	 * @param {number} record.extensibility - Extensibility (e.g. `FROZEN`)
	 * @param {Object} defaultProtoRecord - Record for default prototype
	 * @param {Array} [existingProps] - Array of existing properties (or `null` if none)
	 * @param {Object} [node] - AST node to be wrapped with properties
	 * @param {boolean} forceAssignment - `true` to force late assignment
	 * @returns {Object} - AST node
	 */
	serializeProperties(record, defaultProtoRecord, existingProps, node, forceAssignment) {
		// TODO: Revise to match changes to `traceProperties`
		// TODO: Alter all callers for changed params

		// Serialize prototype
		const {protoRecord} = record;
		let protoNode,
			protoIsCircular,
			protoSetters;
		if (protoRecord !== defaultProtoRecord) {
			protoNode = this.serializeValue(protoRecord);
			protoIsCircular = protoRecord.isCircular;
			if (protoIsCircular) {
				// Prototype should be set before any properties, to avoid assignments which hit setters
				// on prototype chain. If prototype is circular, this is not possible.
				// In this case, use setters on default proto.
				// Then set prototype last, after all properties are added.
				// TODO: This correctly detects if prototype is circular, but not if *its* prototype
				// is circular. So list of setters may not be accurate in that case.
				protoSetters = getSetters.call(this, defaultProtoRecord);
			} else {
				if (node) {
					// Wrapping node - set prototype
					node = this.createObjectMethodCallNode(Object.setPrototypeOf, [node, protoNode]);
					protoNode = undefined;
				}
				protoSetters = getSetters.call(this, protoRecord);
			}
		} else {
			// Prototype will be set before any properties
			protoSetters = getSetters.call(this, protoRecord);
		}

		// Init existing prop tracker
		let nextExistingProp, nextExistingKey, nextExistingKeyType,
			existingPropIndex = 0;
		if (existingProps && existingProps.length > 0) {
			nextExistingProp = existingProps[0];
			nextExistingKey = nextExistingProp.key;
			nextExistingKeyType = getKeyType(nextExistingKey);
		} else {
			nextExistingKeyType = NO_KEY;
		}

		function getNextExistingProp() {
			existingPropIndex++;
			if (existingPropIndex === existingProps.length) {
				nextExistingProp = undefined;
				nextExistingKey = undefined;
				nextExistingKeyType = NO_KEY;
			} else {
				nextExistingProp = existingProps[existingPropIndex];
				nextExistingKey = nextExistingProp.key;
				nextExistingKeyType = getKeyType(nextExistingKey);
			}
		}

		const deletedKeys = new Set(),
			keyTypesDeleted = [false, false, false];
		function deleteExistingProp() {
			deletedKeys.add(nextExistingKey);
			keyTypesDeleted[nextExistingKeyType] = true;

			// If key is a Symbol, create dependency for its use in `delete ...` statement
			// TODO: If existing Symbol keys are always globals, don't need this because
			// whether to inline or not will be decided later on for globals, based on how many times
			// it's serialized, not based on number of dependencies.
			// On the other hand, if existing Symbol keys can be non-globals, this won't work where
			// the same prop is deleted from more than 1 object. At the time of serializing the first object,
			// there'll only be a single dependency on the Symbol, so it'll be inlined,
			// and then when the 2nd object is serialized, it won't be inlined.
			// I think probably existing Symbol keys *are* always globals, so this is fine. But check.
			// Not sure about output of `require('util').promisify()`.
			if (nextExistingKeyType === SYMBOL_KEY) nextExistingKey.usageCount++;

			getNextExistingProp();
		}

		// Serialize keys and values, identify circular references, and determine if properties
		// or circular properties require definition with `Object.defineProperties()`
		const mainProps = [],
			circularProps = [],
			undefinedProps = [],
			{extensibility} = record;
		let mainPropsRequireDefine = false,
			circularPropsRequireDefine = false;

		const flushUndefinedProps = () => {
			if (undefinedProps.length === 0) return;

			mainProps.push(...undefinedProps.map((prop) => {
				// If requires define due to setter on prototype chain, main props requires define.
				// If key is '__proto__' and wrapping an object, also require define to avoid
				// `Object.assign(x, {__proto__: undefined})` which does nothing.
				if (prop.requiresDefineDueToSetter || (prop.key === '__proto__' && node)) {
					mainPropsRequireDefine = true;
				}

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

				// If key is a Symbol, increment usage count for its 2nd use here
				if (prop.keyType === SYMBOL_KEY) prop.key.usageCount++;

				return {
					key: prop.key,
					keyType: prop.keyType,
					keyNode: undefined,
					valNode: undefined,
					valRecord: this.undefinedRecord,
					getNode: undefined,
					setNode: undefined,
					writable: true,
					enumerable: true,
					configurable: true,
					requiresDefineDueToSetter: prop.requiresDefineDueToSetter
				};
			}));

			undefinedProps.length = 0;
		};

		function discardUndefinedProps() {
			if (undefinedProps.length === 0) return;

			for (const prop of undefinedProps) {
				if (removeDefaultModifiers(prop)) circularPropsRequireDefine = true;
				if (prop.requiresDefineDueToSetter) circularPropsRequireDefine = true;
			}
			undefinedProps.length = 0;
		}

		let haveFoundSymbolKey = false;
		for (const prop of record.props) {
			const {key} = prop,
				keyType = getKeyType(key);

			let {valRecord, getRecord, setRecord, writable, enumerable, configurable} = prop;
			const isValueProperty = !!valRecord;

			// If object is sealed or frozen, value of `configurable` is irrelevant.
			// If object is frozen, value of `writable` is irrelevant.
			// `Object.seal()` / `Object.freeze()` will set them to `false` anyway.
			if (extensibility >= SEALED) {
				configurable = undefined;
				if (extensibility === FROZEN) writable = undefined;
			}

			// Check if existing prop
			let hasExistingProp = false,
				requiresDefineDueToSetter = false;
			if (nextExistingProp) {
				// Delete any existing props which have been deleted
				if (nextExistingKey !== key) {
					// Properties are always ordered with integer keys first, then string keys, then Symbol keys.
					// If this is e.g. a string key, and there are existing integer keys, they must be deleted.
					while (keyType > nextExistingKeyType) {
						deleteExistingProp();
					}

					if (keyType === nextExistingKeyType && nextExistingKey !== key) {
						// Same key type but different key
						if (keyType === INTEGER_KEY) {
							// Integer keys are always in order, regardless of order they're defined in.
							// Delete existing props with integer keys which should be before this, but aren't there.
							while (nextExistingKey < key) {
								deleteExistingProp();
								if (nextExistingKeyType !== INTEGER_KEY) break;
							}
						} else {
							// String and symbol keys must be defined in order.
							// Any existing props with a different key of this key must be deleted to maintain order.
							do {
								deleteExistingProp();
							} while (nextExistingKeyType === keyType && nextExistingKey !== key);
						}
					}
				}

				// If there's an existing prop, compare actual prop to existing.
				// Set aspects which are unaltered to `undefined`.
				// If not altered in any way, skip this property.
				if (nextExistingKey === key) {
					const existingProp = nextExistingProp;
					getNextExistingProp();
					hasExistingProp = true;

					/* eslint-disable no-unused-expressions */
					let isDifferent = false;
					if (existingProp.valRecord) {
						// Existing prop has value. Check if value or `writable` is altered.
						// NB: If prop altered to a getter/setter, this will set `isDifferent` to true.
						valRecord === existingProp.valRecord ? valRecord = undefined : isDifferent = true;
						if (extensibility !== FROZEN) {
							writable === existingProp.writable ? writable = undefined : isDifferent = true;
						}
					} else if (isValueProperty) {
						// Existing prop has getter/setter, but actual prop has value. Requires define.
						requiresDefineDueToSetter = true;
						isDifferent = true;
						if (writable === false) writable = undefined;
					} else {
						// Existing prop and actual prop both have getter/setter. Check if altered.
						getRecord === existingProp.getRecord ? getRecord = undefined : isDifferent = true;
						setRecord === existingProp.setRecord ? setRecord = undefined : isDifferent = true;
					}

					enumerable === existingProp.enumerable ? enumerable = undefined : isDifferent = true;
					if (extensibility < SEALED) {
						configurable === existingProp.configurable ? configurable = undefined : isDifferent = true;
					}
					/* eslint-enable no-unused-expressions */

					if (!isDifferent) continue;
				}
			}

			// If a setter on prototype chain for this property, must use `Object.defineProperty()`
			if (!hasExistingProp && protoSetters.has(key)) requiresDefineDueToSetter = true;

			const propOut = {
				key,
				keyType,
				keyNode: undefined,
				valNode: undefined,
				valRecord,
				getNode: undefined,
				setNode: undefined,
				writable,
				enumerable,
				configurable,
				requiresDefineDueToSetter
			};

			// When hit first Symbol key, clear `undefinedProps`.
			// Symbol keys always are added at end, so no need for trailing `undefined` placeholders for
			// string properties which only have Symbol keys after them.
			if (!haveFoundSymbolKey && keyType === SYMBOL_KEY) {
				haveFoundSymbolKey = true;
				discardUndefinedProps();
			}

			// TODO: Doesn't re-writing a property which was previously deleted require define too?

			// If property has been deleted, it and all other props of its kind (string or symbol)
			// must be assigned late so assignment comes after property is deleted.
			// Does not apply to integer keys as they can be defined in any order.
			let isCircular = forceAssignment || (keyType !== INTEGER_KEY && keyTypesDeleted[keyType]);

			// Serialize value, getter, setter + determine if requires define (`Object.defineProperties()`)
			// and whether is circular so requires late assignment.
			let requiresDefine = !isValueProperty;
			if (isValueProperty) {
				if (valRecord && (hasExistingProp || valRecord !== this.undefinedRecord)) {
					propOut.valNode = this.serializeValue(valRecord);
					if (valRecord.isCircular) isCircular = true;
				}
			} else {
				// Skip `undefined`, unless both getter and setter are `undefined`, in which case
				// set setter explicitly as `undefined` so property isn't defined as a value property.
				// NB: Only circumstance where no `getRecord` is where this is an existing prop being altered.
				if (getRecord && (
					hasExistingProp || getRecord !== this.undefinedRecord || setRecord === this.undefinedRecord
				)) {
					propOut.getNode = this.serializeValue(getRecord);
					if (getRecord.isCircular) isCircular = true;
				}
				if (setRecord && (hasExistingProp || setRecord !== this.undefinedRecord)) {
					propOut.setNode = this.serializeValue(setRecord);
					if (setRecord.isCircular) isCircular = true;
				}
			}

			// If `__proto__` prop is not circular, require define, otherwise will result in
			// `Object.assign(..., {__proto__: ...})` which has no effect.
			// Doesn't apply for circular properties, because they don't use `Object.assign()`.
			if (!isCircular && key === '__proto__') requiresDefine = true;

			if (hasExistingProp) {
				// TODO: This could be done earlier
				if (
					requiresDefineDueToSetter
					|| (writable !== undefined || enumerable !== undefined || configurable !== undefined)
				) requiresDefine = true;
			} else if (isCircular && keyType !== INTEGER_KEY) {
				// Create placeholder `undefined` property.
				// `mainPropsRequireDefine` or `circularPropsRequireDefine` will be set later
				// when it becomes clear if `undefined` property is created or not (flushed or discarded).
				// `circularPropsRequireDefine` will be set if necessary due to modifiers later.
				undefinedProps.push(propOut);
			} else {
				// If one of `writable`, `enumerable` or `configurable` is not the default, requires define
				if (removeDefaultModifiers(propOut)) requiresDefine = true;
				if (requiresDefineDueToSetter) requiresDefine = true;
			}

			if (!isCircular) {
				flushUndefinedProps();
				mainProps.push(propOut);
				if (requiresDefine) mainPropsRequireDefine = true;
			} else {
				circularProps.push(propOut);
				if (requiresDefine) circularPropsRequireDefine = true;
			}
		}

		// Delete any remaining pre-existing properties
		while (nextExistingProp) {
			deleteExistingProp();
		}

		// Set property modifiers to undefined where default for circular properties
		// with no undefined placeholder
		discardUndefinedProps();

		// Serialize keys.
		// Cannot do this earlier as key may be used twice for circular properties -
		// once for undefined placeholder, and again for assignment of the final value.
		// This needs to be determined before serializing Symbol keys so the number of dependencies
		// on that Symbol is set first.
		for (const prop of mainProps.concat(circularProps)) {
			prop.keyNode = prop.keyType === SYMBOL_KEY
				? this.serializeValue(prop.key)
				: createKeyNode(prop.key);
		}

		// Assemble object definition
		if (!mainPropsRequireDefine) {
			// Main props do not require defining props.
			// Define as plain object or, if wrapping, use `Object.assign()`.
			const objNode = t.objectExpression(mainProps.map(prop => createObjectPropNode(
				prop.keyNode,
				prop.keyType === SYMBOL_KEY ? prop.key : undefined,
				prop.valNode || this.serializeValue(this.undefinedRecord),
				prop.valRecord
			)));

			if (!node && protoNode && !protoIsCircular) {
				node = this.createObjectMethodCallNode(Object.create, [protoNode]);
				protoNode = undefined;
			}

			if (!node) {
				node = objNode;
			} else if (mainProps.length > 0) {
				node = this.createObjectMethodCallNode(Object.assign, [node, objNode]);
			}
		} else if (!node && protoNode && !protoIsCircular) {
			// Main props require defining props.
			// No node to be wrapped and needs prototype defined - use `Object.create()`
			// TODO: Why only `mainProps[0]`?
			if (mainProps[0].key === '__proto__') {
				node = this.createDefinitionNode(
					mainProps,
					this.createObjectMethodCallNode(Object.create, [protoNode]),
					Object.defineProperties
				);
			} else {
				node = this.createDefinitionNode(mainProps, protoNode, Object.create);
			}
			protoNode = undefined;
		} else {
			// Main props require defining props, and no prototype
			if (!node) node = t.objectExpression([]);
			node = this.createDefinitionNode(mainProps, node, Object.defineProperties);
		}

		// Delete props
		let hasLateAssignments = false;

		const {varNode} = record;
		if (deletedKeys.size > 0) {
			hasLateAssignments = true;
			record.usageCount += deletedKeys.size;

			for (const key of deletedKeys) {
				const keyType = getKeyType(key);
				this.assignmentNodes.push(
					t.expressionStatement(
						t.unaryExpression(
							'delete',
							// NB: Existing prop keys are always valid identifiers so no need to test for that
							keyType === SYMBOL_KEY ? t.memberExpression(varNode, this.serializeValue(key), true)
								: keyType === INTEGER_KEY ? t.memberExpression(varNode, t.numericLiteral(key), true)
									: t.memberExpression(varNode, t.identifier(key))
						)
					)
				);
			}
		}

		// Add assignments for circular props
		let assignmentNode;
		if (circularProps.length > 0) {
			hasLateAssignments = true;

			if (!circularPropsRequireDefine) {
				record.usageCount += circularProps.length;

				this.assignmentNodes.push(...circularProps.map(
					prop => t.expressionStatement(
						t.assignmentExpression(
							'=',
							t.memberExpression(
								varNode, prop.keyNode, prop.keyType === SYMBOL_KEY || !t.isIdentifier(prop.keyNode)
							),
							prop.valNode || this.serializeValue(this.undefinedRecord)
						)
					)
				));
			} else {
				assignmentNode = this.createDefinitionNode(circularProps, varNode, Object.defineProperties);
			}
		}

		// Add prototype
		if (protoNode) {
			hasLateAssignments = true;
			assignmentNode = this.createObjectMethodCallNode(
				Object.setPrototypeOf, [assignmentNode || varNode, protoNode]
			);
		}

		// Add extensibility wrapper
		if (extensibility !== EXTENSIBLE) {
			const method = EXTENSIBLE_METHODS[extensibility];
			if (hasLateAssignments) {
				assignmentNode = this.createObjectMethodCallNode(method, [assignmentNode || varNode]);
			} else {
				node = this.createObjectMethodCallNode(method, [node]);
			}
		}

		if (assignmentNode) {
			record.usageCount++;
			this.assignmentNodes.push(t.expressionStatement(assignmentNode));
		}

		// Return main node
		return node;
	},

	/**
	 * Create AST node for an Object static method call e.g. `Object.create(...)`.
	 * @param {Function} method - Method e.g. `Object.create`
	 * @param {Array<Object>} argNodes - Array of AST nodes for function call arguments
	 * @returns {Object} - AST node
	 */
	createObjectMethodCallNode(method, argNodes) {
		return t.callExpression(this.traceAndSerializeGlobal(method), argNodes);
	},

	/**
	 * Create AST node for call to `Object.create()` or `Object.defineProperties()`
	 * to define properties on object.
	 * Special handling for `__proto__` property which needs a separate
	 * `Object.defineProperty(obj, '__proto__', ...)` call.
	 * @param {Array<Object>} props - Array of props
	 * @param {Object} node - Base object node for `Object.defineProperties()`
	 *   or prototype node for `Object.create()`
	 * @param {Function} method - Either `Object.defineProperties` or `Object.create`
	 * @returns {Object} - AST node
	 */
	createDefinitionNode(props, node, method) {
		const propNodes = [],
			postProtoPropNodes = [];
		let protoObjNode;
		for (const prop of props) {
			const attrNodes = [];
			if (prop.valNode) addObjectPropNode(attrNodes, 'value', prop.valNode, prop.valRecord);
			if (prop.getNode) addObjectPropNode(attrNodes, 'get', prop.getNode, prop.getRecord);
			if (prop.setNode) addObjectPropNode(attrNodes, 'set', prop.setNode, prop.setRecord);

			for (const modifierName of MODIFIER_NAMES) {
				const modifier = prop[modifierName];
				if (modifier !== undefined) {
					attrNodes.push(t.objectProperty(t.identifier(modifierName), t.booleanLiteral(modifier)));
				}
			}

			const objNode = t.objectExpression(attrNodes);

			if (prop.key === '__proto__') {
				protoObjNode = objNode;
			} else {
				const propNode = t.objectProperty(prop.keyNode, objNode, prop.keyType === SYMBOL_KEY);
				if (protoObjNode) {
					postProtoPropNodes.push(propNode);
				} else {
					propNodes.push(propNode);
				}
			}
		}

		if (propNodes.length > 0) {
			node = this.createObjectMethodCallNode(method, [node, t.objectExpression(propNodes)]);
		}

		if (protoObjNode) {
			node = this.createObjectMethodCallNode(
				Object.defineProperty, [node, t.stringLiteral('__proto__'), protoObjNode]
			);

			if (postProtoPropNodes.length > 0) {
				node = this.createObjectMethodCallNode(
					Object.defineProperties, [node, t.objectExpression(postProtoPropNodes)]
				);
			}
		}

		return node;
	}
};

/**
 * Trace properties - values, getters, setters, descriptor modifiers (`enumerable` etc).
 *
 * Records:
 *   - properties as `record.props` (Array)
 *   - prototype record as `record.protoRecord` (`undefined` if default)
 *   - extensibility (e.g. sealed, frozen) as `record.extensibility` (number)
 *
 * `records.props` is array of Objects of with properties:
 *   `key` {string|number|Object} - Property key (record object if key is a Symbol)
 *   `val` {Object|undefined} - Record for value if has value
 *   `get` {Object|undefined} - Record for getter if has getter
 *   `set` {Object|undefined} - Record for setter if has setter
 *   `writable` {boolean|undefined} - Value of `writable` descriptor modifier if prop has value
 *   `enumerable` {boolean|undefined} - Value of `enumerable` descriptor modifier
 *   `configurable` {boolean|undefined} - Value of `configurable` descriptor modifier
 *
 * Only `val` or `get` + `set` will be defined.
 *
 * @this {Object} Serializer
 * @param {Object|Function} val - Value
 * @param {Object} record - Record
 * @param {Function} [shouldSkipKey] - Function to determine if key should be skipped
 * @returns {undefined}
 */
function traceProperties(val, record, shouldSkipKey) {
	// Get extensibility
	record.extensibility = Object.isFrozen(val) ? FROZEN
		: Object.isSealed(val) ? SEALED
			: Object.isExtensible(val) ? EXTENSIBLE
				: NOT_EXTENSIBLE;

	// Get prototype
	const varName = record.name;
	record.protoRecord = this.traceDependency(
		Object.getPrototypeOf(val), `${varName}Prototype`, '[prototype]', record
	);

	// Trace properties
	const props = record.props = [],
		descriptors = Object.getOwnPropertyDescriptors(val);
	for (const [keyStr, descriptor] of Object.entries(descriptors)) {
		const key = isIntegerKey(keyStr) ? keyStr * 1 : keyStr;
		if (shouldSkipKey?.(key)) continue;
		props.push(traceProperty.call(this, record, key, descriptor, keyStr, `.${keyStr}`));
	}

	Object.getOwnPropertySymbols(descriptors).forEach((key, index) => {
		if (shouldSkipKey?.(key)) return;
		const keyName = `${varName}SymbolKeys_${index}`;
		const keyRecord = this.traceDependency(key, keyName, `[SymbolKeys ${index}]`, record);
		props.push(
			traceProperty.call(this, record, keyRecord, descriptors[key], keyName, `[${key.toString()}]`)
		);
	});
}

/**
 * Trace object property.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {string|number|Object} key - Property key
 * @param {Object} descriptor - Property descriptor
 * @param {string} keyName - Key name (used for var name)
 * @param {string} keyDescription - Key description (used for trace stack entry)
 * @returns {Object} - Property object
 */
function traceProperty(record, key, descriptor, keyName, keyDescription) {
	let valRecord, getRecord, setRecord;
	if (Object.hasOwn(descriptor, 'value')) {
		// Property has value
		valRecord = this.traceDependency(descriptor.value, keyName, keyDescription, record);
	} else {
		// Property has getter/setter.
		// NB: If getter or setter is `undefined`, `getRecord` / `setRecord` contains record for undefined.
		getRecord = this.traceDependency(
			descriptor.get, `${keyName}Getter`, `${keyDescription}[getter]`, record
		);
		setRecord = this.traceDependency(
			descriptor.set, `${keyName}Setter`, `${keyDescription}[setter]`, record
		);
	}

	return {
		key,
		valRecord,
		getRecord,
		setRecord,
		writable: valRecord ? descriptor.writable : undefined,
		enumerable: descriptor.enumerable,
		configurable: descriptor.configurable
	};
}

/**
 * Serialize Object.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Array<Object>} record.props - Properties
 * @param {Object} record.protoRecord - Record for prototype
 * @param {number} record.extensibility - Extensibility (e.g. `FROZEN`)
 * @returns {Object} - AST node
 */
function serializeObject(record) {
	return this.serializeProperties(record, this.objectPrototypeRecord, null, null, false);
}
registerSerializer(OBJECT_TYPE, serializeObject);

/**
 * Get type of key.
 * @param {string|number|object} key - Property key (object if key is Symbol)
 * @returns {number} - Key type
 */
function getKeyType(key) {
	switch (typeof key) {
		case 'number': return INTEGER_KEY;
		case 'string': return STRING_KEY;
		default: return SYMBOL_KEY;
	}
}

/**
 * Set prop modifiers to `undefined` where they're the default.
 * Return `true` if property will require definition (`Object.defineProperties()`).
 * Should only be used on previously non-existent properties.
 * @param {Object} prop - Prop object
 * @returns {boolean} - `true` if requires define
 */
function removeDefaultModifiers(prop) {
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
 * Create AST node for object property with string key, and add to object properties.
 * Key must be a valid JS identifier.
 * @param {Array<Object>} nodes - Array of object property nodes
 * @param {string} key - Property key
 * @param {Object} valNode - AST node for value
 * @param {Object} valRecord - Record for value
 * @returns {undefined}
 */
function addObjectPropNode(nodes, key, valNode, valRecord) {
	nodes.push(createObjectPropNode(t.identifier(key), undefined, valNode, valRecord));
}

/**
 * Create AST node for object property.
 * If value is an unnamed function, wraps in `(0, ...)` to prevent it getting named.
 * If value is a method wrapped in an object with name name as property name, unwraps it
 * i.e. `x: {x() {}}.x` to `x() {}`, `[sym]: {'[symbolName]'() {}}['[symbolName]']` to `[sym]() {}`.
 * @param {Object} keyNode - AST node for key
 * @param {Object} [keyRecord] - Record for key (only if Symbol)
 * @param {Object} valNode - AST node for value
 * @param {Object} valRecord - Record for value
 * @returns {Object} - AST node for object property
 */
function createObjectPropNode(keyNode, keyRecord, valNode, valRecord) {
	const {type} = valRecord;
	if (type === FUNCTION_TYPE) {
		// Wrap unnamed function in `(0, ...)`
		if ((t.isClass(valNode) || t.isFunction(valNode)) && !valNode.id) {
			valNode = t.sequenceExpression([t.numericLiteral(0), valNode]);
		}
	} else if (type === METHOD_TYPE) {
		// Unwrap `x: {x() {}}.x` to `x() {}`
		const methodNode = getWrappedMethod(valNode, keyNode, keyRecord);
		if (methodNode) return methodNode;
	}

	return t.objectProperty(keyNode, valNode, !!keyRecord, true);
}

/**
 * Determine if a node is an object method wrapped in an object with stated key.
 * e.g. `{x() {}}.x`, `{'0a'() {}}['0a']`, `{0() {}}[0]`
 * If so, return method AST node.
 * @param {Object} node - Method AST node
 * @param {Object} keyNode - Key node for property
 * @param {Object} [keyRecord] - Key record for property if is symbol
 * @returns {Object|undefined} - Method AST node, or `undefined` if cannot be unwrapped
 */
function getWrappedMethod(node, keyNode, keyRecord) {
	const methodKeyNode = getWrappedMethodKey(node);
	if (!methodKeyNode) return;

	if (keyRecord) {
		if (!t.isStringLiteral(methodKeyNode)) return;
		const {description} = keyRecord.extra;
		if (methodKeyNode.value !== (description === undefined ? '' : `[${description}]`)) return;
	} else if (!keyNodesAreSame(methodKeyNode, keyNode, false, false)) {
		return;
	}

	return node.object.properties[0]; // eslint-disable-line consistent-return
}

/**
 * Check if node is an object-wrapped method (e.g. `{x() {}}.x`, `{'0a'() {}}['0a']`, `{0() {}}[0]`).
 * If so, return key node. Otherwise, return undefined.
 * @param {Object} node - Babel node
 * @returns {Object|undefined} - Key node if input is object-wrapped method
 */
function getWrappedMethodKey(node) {
	if (!t.isMemberExpression(node)) return;

	const objNode = node.object;
	if (!t.isObjectExpression(objNode)) return;

	const propNodes = objNode.properties;
	if (propNodes.length !== 1) return;
	const propNode = propNodes[0];
	if (!t.isObjectMethod(propNode)) return;

	const keyNode = propNode.key;
	// eslint-disable-next-line consistent-return
	if (keyNodesAreSame(keyNode, node.property, propNode.computed, node.isComputed)) return keyNode;
}

/**
 * Compare 2 keys and return `true` if they're the same.
 * Only compares string, number, or identifier keys.
 * @param {Object} keyNode1 - Key 1 AST node
 * @param {Object} keyNode2 - Key 2 AST node
 * @param {boolean} key1IsComputed - `true` if key 1 is computed
 * @param {boolean} key2IsComputed - `true` if key 2 is computed
 * @returns {boolean} - `true` if same
 */
function keyNodesAreSame(keyNode1, keyNode2, key1IsComputed, key2IsComputed) {
	const keyType = keyNode1.type;
	if (keyType === 'Identifier') {
		return !key1IsComputed && !key2IsComputed && keyNode2.type === 'Identifier'
			&& keyNode2.name === keyNode1.name;
	}
	if (keyType === 'StringLiteral' || keyType === 'NumericLiteral') {
		return keyNode2.type === keyType && keyNode2.value === keyNode1.value;
	}
	return false;
}

/**
 * Get keys of properties which have a setter on prototype chain.
 * These are keys which an instance of this class would need properties set with
 * `Object.defineProperty()` rather than assignment to avoid triggering the setter,
 * or throwing an error if there's only a getter.
 * @this Serializer
 * @param {Object} record - Record for object, function, or `null`
 * @returns {Set<string|number|Object>} - Set of properties which have setters on prototype chain
 *   (record objects for symbol keys)
 */
function getSetters(record) {
	// Used cached value.
	// NB: This always catches `null`.
	if (record.setters) return record.setters;

	// Determine setters.
	// Avoid cloning `setters` from prototype, unless this object's setters are different.
	let setters,
		settersIsCloned = false;
	function cloneSetters() {
		if (settersIsCloned) return;
		setters = new Set(setters);
		settersIsCloned = true;
	}
	function addSetter(key) {
		if (setters.has(key)) return;
		cloneSetters();
		setters.add(key);
	}
	function deleteSetter(key) {
		if (!setters.has(key)) return;
		cloneSetters();
		setters.delete(key);
	}

	if (record.type & GLOBAL_TYPE) { // eslint-disable-line no-bitwise
		// Global.
		// Get setters for prototype.
		const {val} = record.extra;
		setters = getSetters.call(this, this.traceValue(Object.getPrototypeOf(val), null, null));

		const processKey = (key, descriptor) => {
			if (Object.hasOwn(descriptor, 'value')) {
				deleteSetter(key);
			} else {
				addSetter(key);
			}
		};

		// String keys
		const descriptors = Object.getOwnPropertyDescriptors(val);
		for (const [key, descriptor] of Object.entries(descriptors)) {
			processKey(isIntegerKey(key) ? key * 1 : key, descriptor);
		}

		// Symbol keys
		// TODO: Avoid tracing all Symbol keys - only trace if need to
		for (const key of Object.getOwnPropertySymbols(descriptors)) {
			processKey(this.traceValue(key, null, null), descriptors[key]);
		}
	} else {
		// Non-global.
		// Get setters for prototype.
		setters = getSetters.call(this, record.protoRecord);

		// Find any differences from prototype
		for (const {key, val} of record.props) {
			if (val) {
				deleteSetter(key);
			} else {
				addSetter(key);
			}
		}
	}

	// Cache calculated setters
	record.setters = setters;

	return setters;
}
