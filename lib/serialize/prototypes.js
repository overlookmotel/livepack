/* --------------------
 * livepack module
 * Convert existing function prototype
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	t = require('@babel/types');

// Imports
const {GeneratorPrototype, AsyncGeneratorPrototype} = require('../shared.js'),
	{createDependency, createAssignment} = require('./records.js'),
	{serializeUndefined} = require('./primitives.js');

// Exports

module.exports = {
	convertPrototype(fn, fnRecord, fnNode, proto, protoRecord, protoNode, isGenerator, protoIsReferenced) {
		// TODO
		/*
		console.log('convertPrototype:', {
			fn, fnRecord, fnNode, proto, protoRecord, protoNode, isGenerator, protoIsReferenced
		});

		console.log('protoNode:');
		console.dir(protoNode, {depth: 5});

		console.log('fnNode:');
		console.dir(fnNode, {depth: 8});
		*/

		// Remove prototype from function
		const {records} = this;
		const definePropertiesRecord = records.get(Object.defineProperties);

		let removeFnAssignment;
		if (t.isIdentifier(fnNode)) {
			// Function does not have added props at definition - prototype must be assigned later
			removeFnAssignment = true;
		} else {
			assert(t.isCallExpression(fnNode));
			if (definePropertiesRecord && fnNode.callee === definePropertiesRecord.varNode) {
				// `Object.defineProperties(x, { ... })`
				const args = fnNode.arguments,
					{properties} = args[1];
				const protoIsDeleted = deletePrototypeProperty(properties, fnRecord, protoRecord, true);
				if (protoIsDeleted) {
					// `prototype` was deleted from properties
					assert(properties.length > 0); // If prototype was only prop, it wouldn't need descriptor

					// Convert to `Object.assign()` if all remaining props have standard descriptors
					const descriptorsAreNotRequired = !properties.find((propNode) => {
						const keyNode = propNode.key;
						if (
							t.isIdentifier(keyNode) && !propNode.computed
							&& (keyNode.name === 'name' || keyNode.name === 'length')
						) return true;

						const descriptorPropNodes = propNode.value.properties;
						return descriptorPropNodes.length !== 1
							|| descriptorPropNodes[0].key.name !== 'value';
					});

					if (descriptorsAreNotRequired) {
						// Replace `Object.defineProperties` with `Object.assign`
						const objectAssignRecord = this.serializeValue(Object.assign);
						fnNode.callee = objectAssignRecord.varNode;

						deleteGlobalDependency(
							Object.defineProperties, fnRecord, definePropertiesRecord, fnNode, 'callee', records
						);
						createDependency(fnRecord, objectAssignRecord, fnNode, 'callee');

						// Convert `{x: {value: foo}, y: {value: bar}}` to `{x: foo, y: bar}`
						const fnDependencies = fnRecord.dependencies;
						for (const propNode of properties) {
							const descriptorPropNode = propNode.value.properties[0],
								valNode = descriptorPropNode.value;
							propNode.value = valNode;

							if (t.isIdentifier(valNode)) {
								const dependency = fnDependencies.find(({record: {varNode}}) => varNode === valNode);
								const dependent = dependency.record.dependents.find(
									({node, key}) => node === descriptorPropNode && key === 'value'
								);
								dependent.node = propNode;
							}
						}
					}

					removeFnAssignment = false;
				} else {
					// `prototype` was not deleted from properties - must be in assignments
					removeFnAssignment = true;
				}
			} else {
				// `Object.assign(x, { ... })` - placeholder for `prototype`, assigned later
				const objectAssignRecord = records.get(Object.assign);
				assert(objectAssignRecord && fnNode.callee === objectAssignRecord.varNode);

				const propNodes = fnNode.arguments[1].properties;
				const protoIsDeleted = deletePrototypeProperty(propNodes, fnRecord, protoRecord, false);

				if (protoIsDeleted) {
					if (propNodes.length === 0) {
						deleteGlobalDependency(
							Object.assign, fnRecord, objectAssignRecord, fnNode, 'callee', records
						);
						fnNode = fnNode.arguments[0];
					}

					removeFnAssignment = false;
				} else {
					removeFnAssignment = true;
				}
			}
		}

		// Remove `prototype`'s later assignment
		if (removeFnAssignment) {
			// Find first assignment which is not `delete ...`
			const {assignments} = fnRecord,
				index = assignments.findIndex(assignment => !t.isUnaryExpression(assignment.node)),
				assignment = assignments[index],
				assignmentNode = assignment.node;
			if (t.isCallExpression(assignmentNode)) {
				// `Object.defineProperties(fn, { ... })`
				assert(assignmentNode.callee === definePropertiesRecord.varNode);

				const {properties} = assignmentNode.arguments[1];
				const protoIsDeleted = deletePrototypeProperty(properties, assignment, protoRecord, true);
				assert(protoIsDeleted);
				assert(properties.length > 0); // If prototype was only prop, it wouldn't need descriptor
			} else {
				// `fn.prototype = proto`
				assert(t.isAssignmentExpression(assignmentNode));
				const leftNode = assignmentNode.left;
				assert(
					t.isMemberExpression(leftNode)
					&& leftNode.object === fnRecord.varNode
					&& isNamedIdentifier(leftNode.property, 'prototype')
					&& !leftNode.computed
					&& assignmentNode.right === protoRecord.varNode
				);

				deleteDependency(assignment, fnRecord, assignmentNode.left, 'object');
				deleteDependency(assignment, protoRecord, assignmentNode, 'right');

				assignments.splice(index, 1);
				if (assignments.length === 0) fnRecord.assignments = undefined;
			}
		}

		if (!isGenerator) {
			// Remove constructor from prototype
			let removeProtoAssignment;
			if (t.isObjectExpression(protoNode)) {
				const propNodes = protoNode.properties;
				if (propNodes.length > 0) {
					// `{constructor: fn, ...}` - must have other props and this is a placeholder
					const ctorPropNode = propNodes.shift();
					assert(propIsNamedIdentifier(ctorPropNode, 'constructor'));
					assert(ctorPropNode.value === serializeUndefined());
					assert(propNodes.length > 0);

					// Move other props into assignment
					const assignment = protoRecord.assignments[0],
						assignmentPropNodes = assignment.node.arguments[1].properties;
					assert(propIsNamedIdentifier(assignmentPropNodes[0], 'constructor'));
					let assignmentPropIndex = 1,
						assignmentPropNode = assignmentPropNodes[1];
					for (const propNode of propNodes) {
						// If this prop is a placeholder for a later assignment, update descriptor modifiers
						const {key: keyNode, computed: isComputed} = propNode;
						if (
							assignmentPropNode && assignmentPropNode.key === keyNode
							&& assignmentPropNode.computed === isComputed
						) {
							// Update descriptor modifiers
							// `{enumerable: false}` -> `{writable: true, configurable: true}`
							const descriptorPropNodes = assignmentPropNode.value.properties;
							const modifierNames = [
								...(descriptorPropNodes[0].key.name === 'value' ? ['writable'] : []),
								'enumerable', 'configurable'
							];

							for (let index = 1; index < descriptorPropNodes.length; index++) {
								const modifierName = descriptorPropNodes[index].key.value;
								const modifierIndex = modifierNames.indexOf(modifierName);
								if (modifierIndex === -1) continue;

								descriptorPropNodes.splice(index, 1);
								modifierNames.splice(modifierIndex, 1);
								index--;
							}

							descriptorPropNodes.push(...modifierNames.map(
								modifierName => t.objectProperty(t.identifier(modifierName), t.booleanLiteral(true))
							));

							// If key is symbol, remove dependency on symbol
							if (isComputed && t.isIdentifier(keyNode)) {
								const dependency = deleteFirst(
									protoRecord.dependencies,
									dependency => dependency.record.varNode === keyNode // eslint-disable-line no-shadow
								);

								deleteFirst(
									dependency.record.dependents,
									dependent => dependent.node === propNode && dependent.key === 'key'
								);
							}

							assignmentPropIndex++;
							assignmentPropNode = assignmentPropNodes[assignmentPropIndex];
							continue;
						}

						// Move prop to assignment
						const valNode = propNode.value,
							valuePropNode = t.objectProperty(t.identifier('value'), valNode);
						propNode.value = t.objectExpression([
							valuePropNode,
							...['writable', 'enumerable', 'configurable'].map(
								modifierName => t.objectProperty(t.identifier(modifierName), t.booleanLiteral(true))
							)
						]);
						assignmentPropNodes.splice(assignmentPropIndex, 0, propNode);
						assignmentPropIndex++;

						// Transfer dependencies to assignment
						if (isComputed && t.isIdentifier(keyNode)) {
							transferDependency(
								protoRecord, assignment, keyNode, propNode, 'key', propNode, 'key'
							);
						}

						if (t.isIdentifier(valNode)) {
							transferDependency(
								protoRecord, assignment, valNode, propNode, 'value', valuePropNode, 'value'
							);
						}
					}
				}

				removeProtoAssignment = true;
			} else {
				assert(t.isCallExpression(protoNode));
				const objectAssignRecord = records.get(Object.assign);
				const {callee} = protoNode;
				if (objectAssignRecord && callee === objectAssignRecord.varNode) {
					// `Object.assign()`
					// TODO I don't think it's possible to ever get here.
					// Would require all props have all-true descriptor modifiers, including `constructor`.
					// But when `constructor` has non-standard descriptor, `convertPrototype()` will not be called.
					// So I think this block can be removed.
					throw new Error('Not implemented yet');
				} else {
					// `Object.create()`
					const objectCreateRecord = records.get(Object.create);
					assert(objectCreateRecord && callee === objectCreateRecord.varNode);

					// Delete `constructor` from `prototype` definition
					const args = protoNode.arguments,
						propNodes = args[1].properties,
						ctorPropNode = propNodes.shift();
					assert(propIsNamedIdentifier(ctorPropNode, 'constructor'));
					const valuePropNode = ctorPropNode.value.properties[0];
					assert(propIsNamedIdentifier(valuePropNode, 'value'));

					if (valuePropNode.value === serializeUndefined()) {
						// Placeholder
						removeProtoAssignment = true;
					} else {
						assert(valuePropNode.value === fnRecord.varNode);
						deleteDependency(protoRecord, fnRecord, valuePropNode, 'value');
						removeProtoAssignment = false;
					}

					// Move other props into assignment
					// TODO
					assert(propNodes.length === 0); // TODO Will fail if proto has other props

					// Remove dependencies for prototype creation
					const objectPrototypeRecord = records.get(Object.prototype);
					// TODO This could be another value if prototype inherits from another prototype
					assert(objectPrototypeRecord && args[0] === objectPrototypeRecord.varNode);
					deleteGlobalDependency(Object.prototype, protoRecord, objectPrototypeRecord, args, 0, records);

					deleteGlobalDependency(
						Object.create, protoRecord, objectCreateRecord, protoNode, 'callee', records
					);
				}
			}

			if (removeProtoAssignment) {
				const {assignments} = protoRecord,
					assignment = assignments[0],
					assignmentNode = assignment.node;
				assert(assignments.length === 1);
				assert(
					t.isCallExpression(assignmentNode)
					&& definePropertiesRecord && assignmentNode.callee === definePropertiesRecord.varNode
				);

				const propNodes = assignmentNode.arguments[1].properties;
				deleteConstructorProperty(propNodes, assignment, fnRecord);

				if (propNodes.length === 0) {
					protoRecord.assignments = undefined;
				} else {
					// If all remaining props have no descriptors, convert to simple assignments
					const descriptorsAreNotRequired = !propNodes.find((propNode) => {
						const descriptorPropNodes = propNode.value.properties;
						if (descriptorPropNodes.length !== 4) return true;
						if (descriptorPropNodes[0].key.name !== 'value') return true;
						for (let i = 1; i < 4; i++) {
							if (!descriptorPropNodes[i].value.value) return true;
						}
						return false;
					});

					if (descriptorsAreNotRequired) {
						protoRecord.assignments = undefined;

						for (const propNode of propNodes) {
							const keyNode = propNode.key,
								propValueNode = propNode.value.properties[0],
								valNode = propValueNode.value;
							const memberNode = t.memberExpression(protoRecord.varNode, keyNode, propNode.computed);
							const newAssignmentNode = t.assignmentExpression('=', memberNode, valNode);
							const newAssignment = createAssignment(
								protoRecord, newAssignmentNode, memberNode, 'object'
							);

							if (propNode.computed && t.isIdentifier(keyNode)) {
								transferDependency(
									assignment, newAssignment, keyNode, propNode, 'key', memberNode, 'property'
								);
							}

							if (t.isIdentifier(valNode)) {
								transferDependency(
									assignment, newAssignment, valNode, propValueNode, 'value', newAssignmentNode, 'right'
								);
							}
						}

						propNodes.length = 0;
					}
				}

				if (propNodes.length === 0) {
					deleteGlobalDependency(
						Object.defineProperties, assignment, definePropertiesRecord,
						assignmentNode, 'callee', records
					);
					deleteDependency(assignment, protoRecord, assignmentNode.arguments, 0);
				}
			}
		}

		// Substitute `fn.prototype` for current definition of prototype
		if (!protoIsReferenced && protoRecord.dependents.length === 0) {
			// Prototype is not referenced - delete its record
			records.delete(proto);

			// Record in `prototypes` so if prototype is accessed later, it will be created as `fn.prototype`
			this.prototypes.set(proto, {fn, record: fnRecord});
		} else {
			protoNode = this.createPrototypeNode(fnRecord, protoRecord);

			const assignment = createAssignment(fnRecord, null);
			assignment.dependencies.push({record: protoRecord});
		}

		/*
		// TODO Delete this code - no longer used.
		let ctorDependentNode, ctorDependentKey; // eslint-disable-line no-unreachable

		let removeProtoAssignment, protoHasOtherProps;
		if (t.isObjectExpression(protoNode)) {
			const {properties} = protoNode;
			properties.shift();
			protoHasOtherProps = properties.length !== 0;
			removeProtoAssignment = true;
		} else {
			assert(t.isCallExpression(protoNode), 'Unexpected node type for prototype');
			if (protoNode.callee === (records.get(Object.assign) || {}).varNode) {
				// `Object.assign()`
				// TODO
				throw new Error('No implemented yet');
			} else {
				// `Object.create`
				// TODO
				throw new Error('No implemented yet');
			}
		}

		// Remove constructor from assignments
		let protoHasOtherAssignments;
		if (removeProtoAssignment) {
			const assignment = protoRecord.assignments[0];
			const assignmentNode = assignment.node;
			assert(
				t.isCallExpression(assignmentNode)
				&& assignmentNode.callee === (records.get(Object.defineProperties) || {}).varNode
			);

			const [arg1, arg2] = assignmentNode.arguments;
			assert(arg1 === protoRecord.varNode);
			assert(t.isObjectExpression(arg2));
			const {properties} = arg2;
			assert(t.isIdentifier(properties[0].key) && properties[0].key.name === 'constructor');
			ctorDependentNode = properties[0].value.properties[0];
			ctorDependentKey = 'value';
			assert(ctorDependentNode.value === fnRecord.varNode);
			properties.shift();
			protoHasOtherAssignments = properties.length !== 0;

			const {dependencies} = assignment;
			assert(dependencies[1].record === fnRecord);
			dependencies.splice(1, 1);
		}

		deleteFirst(
			fnRecord.dependents,
			dependent => dependent.node === ctorDependentNode && dependent.key === ctorDependentKey
		);
		*/

		return {fnNode, protoNode};
	},

	createPrototypeNode(fnRecord, protoRecord) {
		const protoNode = t.memberExpression(fnRecord.varNode, t.identifier('prototype'));
		createDependency(protoRecord, fnRecord, protoNode, 'object');
		return protoNode;
	},

	setPrototypeVarName(protoRecord, fnRecord) {
		protoRecord.varNode.name = `${fnRecord.varNode.name}Prototype`;
	}
};

function propIsNamedIdentifier(propNode, name) {
	return !propNode.computed && isNamedIdentifier(propNode.key, name);
}

function isNamedIdentifier(node, name) {
	return t.isIdentifier(node) && node.name === name;
}

function deletePrototypeProperty(properties, dependencyRecord, protoRecord, isDescriptor) {
	const index = properties.findIndex(propNode => propIsNamedIdentifier(propNode, 'prototype'));
	if (index === -1) return false;

	const propNode = properties.splice(index, 1)[0];

	const protoDependentNode = isDescriptor ? propNode.value.properties[0] : propNode;
	assert(protoDependentNode.value === protoRecord.varNode);
	deleteDependency(dependencyRecord, protoRecord, protoDependentNode, 'value');

	return true;
}

function deleteConstructorProperty(properties, dependencyRecord, fnRecord) {
	const propNode = properties.shift();
	assert(propIsNamedIdentifier(propNode, 'constructor'));

	const fnDependentNode = propNode.value.properties[0];
	assert(fnDependentNode.value === fnRecord.varNode);
	deleteDependency(dependencyRecord, fnRecord, fnDependentNode, 'value');
}

function deleteGlobalDependency(global, srcRecord, globalRecord, node, key, records) {
	// Delete dependency on global
	deleteDependency(srcRecord, globalRecord, node, key);

	// If this global is no longer used, disconnect it from parent and delete record.
	// e.g. if `Object.assign` no longer used, remove `dependent` on `Object`'s record
	// and delete `Object.assign`'s record.
	if (globalRecord.dependents.length === 0) {
		const globalNode = globalRecord.node;
		deleteFirst(
			globalRecord.dependencies[0].record.dependents,
			dependent => dependent.node === globalNode && dependent.key === 'object'
		);

		records.delete(global);
	}
}

function deleteDependency(srcRecord, dependencyRecord, node, key) {
	deleteFirst(srcRecord.dependencies, dependency => dependency.record === dependencyRecord);
	deleteFirst(
		dependencyRecord.dependents,
		dependent => dependent.node === node && dependent.key === key
	);
}

function transferDependency(oldSrcRecord, newSrcRecord, varNode, oldNode, oldKey, newNode, newKey) {
	const dependency = deleteFirst(
		oldSrcRecord.dependencies,
		dependency => dependency.record.varNode === varNode // eslint-disable-line no-shadow
	);
	newSrcRecord.dependencies.push(dependency);

	const dependent = dependency.record.dependents.find( // eslint-disable-next-line no-shadow
		dependent => dependent.node === oldNode && dependent.key === oldKey
	);
	dependent.record = newSrcRecord;
	dependent.node = newNode;
	dependent.key = newKey;
}

function deleteFirst(arr, fn) {
	const index = arr.findIndex(fn);
	assert(index >= 0);
	return arr.splice(index, 1)[0];
}

/**
 * Determine if function has an unaltered prototype.
 * TODO Delete this function - no longer used.
 * @param {Function} fn - Function
 * @param {boolean} isClass - `true` if is a class
 * @returns {boolean} - `true` if prototype is unaltered
 */
function functionHasUnalteredPrototype(fn, isClass) { // eslint-disable-line no-unused-vars
	// Check prototype is defined and plain object
	// NB `prototype` cannot be deleted, so its existence doesn't need to be checked for
	const prototypeDescriptor = Object.getOwnPropertyDescriptor(fn, 'prototype');
	const prototype = prototypeDescriptor.value;
	if (!prototype || Object.getPrototypeOf(prototype) !== Object.prototype) return false;

	// Check prototype descriptor has unaltered `writable` prop
	// NB `enumerable` + `configurable` cannot be changed
	if (prototypeDescriptor.writable === isClass) return false;

	// Check prototype has no properties other than `constructor`
	const protoPropNames = Object.getOwnPropertyNames(prototype);
	if (protoPropNames.length !== 1 || protoPropNames[0] !== 'constructor') return false;
	if (Object.getOwnPropertySymbols(prototype).length !== 0) return false;

	// Check constructor refers back to function
	const ctorDescriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
	const ctor = ctorDescriptor.value;
	if (ctor !== fn) return false;

	// Check constructor has unaltered descriptor props
	if (
		!ctorDescriptor.writable || ctorDescriptor.enumerable || !ctorDescriptor.configurable
	) return false;

	return true;
}

/**
 * Determine if generator function has an unaltered prototype.
 * TODO Delete this function - no longer used.
 * @param {Function} fn - Function
 * @param {boolean} isAsync - `true` if is an async generator
 * @returns {boolean} - `true` if prototype is unaltered
 */
function generatorHasUnalteredPrototype(fn, isAsync) { // eslint-disable-line no-unused-vars
	// Check has prototype
	const prototypeDescriptor = Object.getOwnPropertyDescriptor(fn, 'prototype');
	if (!prototypeDescriptor) return false;

	// Check prototype is defined and inherits GeneratorPrototype / AsyncGeneratorPrototype
	const prototype = prototypeDescriptor.value;
	if (!prototype) return false;
	if (
		Object.getPrototypeOf(prototype) !== (isAsync ? AsyncGeneratorPrototype : GeneratorPrototype)
	) return false;

	// Check prototype has unaltered descriptor props
	if (
		!prototypeDescriptor.writable || prototypeDescriptor.enumerable || prototypeDescriptor.configurable
	) return false;

	// Check prototype has no properties
	if (Object.getOwnPropertyNames(prototype).length !== 0) return false;
	if (Object.getOwnPropertySymbols(prototype).length !== 0) return false;

	return true;
}