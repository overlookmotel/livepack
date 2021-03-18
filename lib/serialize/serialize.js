/* --------------------
 * livepack module
 * serialize methods
 * ------------------*/

'use strict';

// Imports
const {splitPoints} = require('../internal.js'),
	{createRecord} = require('./records.js'),
	{deleteLast} = require('./utils.js'),
	{
		ENTRY_POINT, SYNC_SPLIT_POINT, ASYNC_SPLIT_POINT, COMMON_POINT, COMMON_SPLIT_POINT,
		SPLIT_POINT_MASK, COMMON_MASK
	} = require('./constants'),
	assertBug = require('../shared/assertBug.js');

// Exports

module.exports = {
	/**
	 * Serialize collection of entry points to Javascript code.
	 * @param {Object} entryPoints - Map of entry point names to values
	 * @returns {Array<Object>} - Array of output objects
	 */
	serialize(entryPoints) {
		// Init set of output names
		const outputNames = new Set();
		function getNameIfUnique(name) {
			if (!name || outputNames.has(name)) return undefined;
			outputNames.add(name);
			return name;
		}

		// Serialize all entry points + split points
		const {pointOutputs, entryPointOutputs} = this.serializeEntryPointsAndSplitPoints(
			entryPoints, outputNames, getNameIfUnique
		);
		if (pointOutputs.length === 0) return [];

		// Create scopes and functions
		this.processBlocks();

		// Output files
		let files;
		if (pointOutputs.length === 1) {
			// Only one entry point and no split points, skip splitting into outputs - fast path
			const output = pointOutputs[0];
			files = this.outputOne(output, output.record);
		} else {
			// Split into outputs
			const outputs = this.splitOutputs(pointOutputs, entryPointOutputs, getNameIfUnique);

			// Output files
			files = this.output(outputs, entryPointOutputs);
		}

		// Output stats file
		if (this.options.stats) files.push(this.outputStatsFile(files));

		// Return files
		return files;
	},

	/**
	 * Serialize all entry points + split points.
	 * Creates an array of output objects.
	 * @param {Object} entryPoints - Map of entry point names to values
	 * @param {Set<string>} outputNames - Set of output names used
	 * @param {Function} getNameIfUnique - Function to get output name
	 * @returns {Object}
	 * @returns {Array<Object>} .pointOutputs - Outputs for all entry points + split points
	 * @returns {Array<Object>} .entryPointOutputs - Outputs for all entry points + async split points
	 */
	serializeEntryPointsAndSplitPoints(entryPoints, outputNames, getNameIfUnique) {
		// Init array of point outputs
		const pointOutputs = [];
		function createEntryOutput(type, name, record, requestedName) {
			// Each entry point output has an ID which is a power of 2 (i.e. 1, 2, 4, 8...).
			// Common outputs get their IDs from a bitwise OR of their constituent outputs.
			// Therefore, a record which is referenced from `1+2` and `4` will resolve to same output
			// as a record which is referenced from `1` and `2+4`.
			const index = pointOutputs.length,
				id = 1n << BigInt(index); // eslint-disable-line no-bitwise
			const output = createOutput(id, type, name, index, record, requestedName);
			pointOutputs.push(output);
			return output;
		}

		// Serialize entry point values
		const entryPointOutputs = [];
		for (const [name, val] of Object.entries(entryPoints)) {
			const record = this.serializeValue(val, name, `<${name} root>`);
			const output = createEntryOutput(ENTRY_POINT, name, record, undefined);
			entryPointOutputs.push(output);
			outputNames.add(name);
		}
		if (pointOutputs.length === 0) return {pointOutputs, entryPointOutputs};

		// Serialize used async split point values.
		// Async split points which are used within other async split points will be serialized too
		// as they get added to `splitImportFns` during serialization of previous ones.
		const splitPointsToOutputsMap = new Map(); // Keyed by split point object
		for (const {importFnRecord, val, splitPoint} of this.splitImportFns) {
			let output = splitPointsToOutputsMap.get(splitPoint);
			if (output) {
				output.importFnRecords.push(importFnRecord);
				continue;
			}

			const {name} = splitPoint;
			const varName = name || importFnRecord.varNode.name;
			const record = this.serializeValue(val, varName, `<${varName} split point root>`);

			output = createEntryOutput(ASYNC_SPLIT_POINT, getNameIfUnique(name), record, undefined);
			output.importFnRecords = [importFnRecord];

			// Add as entry point
			entryPointOutputs.push(output);
			splitPointsToOutputsMap.set(splitPoint, output);
		}

		// Serialize sync split point values.
		// Unlike entry points and async split points, which we know are going to be used,
		// sync split points are named upon use, rather than now.
		// This prevents unused splits from eating up the namespace.
		for (const [val, splitPoint] of splitPoints.entries()) {
			let output = splitPointsToOutputsMap.get(splitPoint);
			if (output) continue; // Already encountered as async split point

			const {name} = splitPoint;
			// NB The name 'x' will never appear in output, as if the value is used, it'll already be named
			const record = this.serializeValue(val, 'x', `<${name || 'unnamed'} split point root>`);
			output = createEntryOutput(SYNC_SPLIT_POINT, undefined, record, name);
		}

		return {pointOutputs, entryPointOutputs};
	},

	/**
	 * Split into outputs.
	 *
	 * The aim is for every value to be assigned to a single output.
	 * If a value is only used by a single entry point `A`, it will go in output `A`.
	 * If a value is used by entry points `A` and `B`, it goes in output `A+B`.
	 * `A` and `B` will import it from `A+B`.
	 *
	 * The graph of outputs is acyclic. `A+B` will never import from `A` or `B`.
	 *
	 * A simple splitting algorithm would be to start from each entry/split point and walk up
	 * its tree of dependencies, flagging each value as being used by that entry point.
	 * Once every entry point's tree has been walked, values can be assigned to outputs based on
	 * all the entry points that touched in during their walks. e.g. 'A', 'A+B', 'A+C, 'A+B+C'.
	 *
	 * The problem with this approach is that where a large proportion of the app is in common between
	 * different entry points (e.g. large libraries), those parts of the tree will be walked repeatedly
	 * for every entry point.
	 *
	 * The algorithm used here aims to visit each value only once, by walking down the dependents
	 * before walking up the dependencies. The entire graph will be visited.
	 *
	 * It proceeds as follows:
	 *   - Start at first entry point.
	 *   - Walk *down* tree of dependents until each branch reaches one of entry/split points.
	 *   - The furthest ends of each branch can have their output determined conclusively as the
	 *     entry point's outputs are known at the start.
	 *   - Each parent can therefore determine its output from the sum of the outputs of its dependents.
	 *   - Any value where two of its dependents have different outputs is a "join point"
	 *     and the value must be exported from the output file.
	 *   - Next, walk *up* the dependencies of each of the values visited so far.
	 *   - Repeat the same walk down procedure for each.
	 *   - When complete, repeat for the next entry point.
	 *
	 * The complication is circular dependencies.
	 * e.g. `const a = {}, b = {}; a.b = b; b.a = a;`
	 *
	 * In these cases, you start with `a` and walk down to `b`. `b`'s output cannot be determined,
	 * as it depends on `a` which also has no output determined at this point.
	 * `b` is marked as "awaiting" `a`. `b` also tells `a` that it's awaiting it.
	 * `a` can now determine it's output from adding up those of all its dependents.
	 * All values involved in the cycle will be in same output as they all depend on each other.
	 * `a` marks `b` as no longer awaiting `a`. It then re-runs the output calculation on itself,
	 * and all its dependents (`reviseOutput()`). When this completes, all the values involved in
	 * the cycle will have had their outputs determined, and the rest of the walk continues as before.
	 *
	 * Outputs are added to `outputs` array in ascending order of depth.
	 * e.g. `A`, `B`, `C`, `A+B`, `B+C`, `A+B+C`
	 * When creating the JS files for each output, the array is iterated in reverse order -
	 * `A+B+C` first, then `A+B`, then `A` and `B`.
	 * Filenames include a hash of the file content, so are not known ahead of time.
	 * So `A+B+C` is created first and then it's filename is known before processing `A+B`,
	 * so an import statement in `A+B` which imports `A+B+C` can be constructed with correct filename.
	 *
	 * @param {Array<Object>} pointOutputs - Array of outputs for entry points + split points
	 * @param {Array<Object>} entryPointOutputs - Array of outputs for entry points + async split points
	 * @param {Function} getNameIfUnique - Function to get output name
	 * @returns {Array<Object>} - Array of output objects
	 */
	splitOutputs(pointOutputs, entryPointOutputs, getNameIfUnique) {
		// Init outputs array.
		// Also maintain map of output ID -> output object.
		// `outputsMap` is keyed by `_<id>`. The `_` is to prevent keys being integers.
		const outputs = [],
			outputsMap = Object.create(null);
		function getOrCreateOutput(id, type) {
			let output = outputsMap[`_${id}`];
			if (!output) {
				output = createOutput(id, type);
				recordInOutputsMap(output);
			}
			return output;
		}

		function recordInOutputsMap(output) {
			outputsMap[`_${output.id}`] = output;
		}

		// Walk graph of dependents and dependencies.
		// For each record, traverse down dependents to determine all the points it reaches,
		// and therefore determine its output.
		// Then traverse up dependencies and assign them to outputs too.
		const traverseUpQueue = [];
		let numInProcess = 0;
		function walkGraphFrom(entryRecord) {
			// Skip primitives - they have no dependents or dependencies to traverse
			if (!entryRecord.dependencies) return;

			// Traverse down dependents to get record's output
			determineOutput(entryRecord);

			// Traverse up dependencies for all resolved records.
			// NB Queue will be added to recursively, so when queue is empty the entire graph of
			// dependents and dependencies extending from the entry record will have been visited
			// and been assigned to an output.
			while (traverseUpQueue.length > 0) {
				const record = traverseUpQueue.shift();
				visitDependencies(record, determineOutput);
			}
		}

		function determineOutput(record) {
			// If already visited, return output that was previously determined
			if (record.output) return record.output;

			// Create pseudo-output object for this record while it's being processed.
			// If a dependent has this record as it's own dependent (i.e. circular dependency),
			// it will receive this pseudo-output and deduce the circularity.
			const inProcessOutput = createOutput(0n, COMMON_POINT, undefined);
			const awaitedBy = new Set();
			inProcessOutput.awaitedBy = awaitedBy;
			record.output = inProcessOutput;
			numInProcess++;

			// Get dependents' outputs and combine into one.
			// If record is entered from different outputs, this record is a join point
			// and needs to be exported in the output.
			const awaiting = new Set();
			let isJoinPoint = false,
				isEntryPoint = false,
				isSolelySyncSplitPoint = false,
				output,
				id = 0n,
				type = COMMON_POINT;
			visitDependents(record, (dependentRecord) => {
				const dependentOutput = determineOutput(dependentRecord);

				// If dependent is a proxy, this is an entry point or split point
				if (!dependentRecord.node) {
					const dependentType = dependentOutput.type;
					if (dependentType === SYNC_SPLIT_POINT) {
						// NB Sync split point proxy dependents are added last, so we know at this point
						// all other dependents have been visited already
						if (!output) {
							// Nothing else depends on this - don't output
							isSolelySyncSplitPoint = true;
						} else if (id & dependentOutput.id) { // eslint-disable-line no-bitwise
							// Output already split on this - don't flag as a join point.
							// Can happen with circular dependencies.
							return;
						}
					} else {
						if (dependentType === ASYNC_SPLIT_POINT) {
							// Ensure imports of this end up in outputs array before this
							for (const importFnRecord of dependentOutput.importFnRecords) {
								determineOutput(importFnRecord);
							}
						}
						isEntryPoint = true;
					}
				} else {
					if (dependentOutput.awaitedBy) {
						// Circular dependent - add to list of values this record is awaiting resolution of
						awaiting.add(dependentRecord);
						return;
					}

					if (dependentOutput.awaiting) {
						// Dependent is unresolved - this record must await values dependent is awaiting too
						for (const awaitingRecord of dependentOutput.awaiting) {
							if (awaitingRecord !== record) awaiting.add(awaitingRecord);
						}
					}
				}

				// Combine output with current
				if (!output) {
					output = dependentOutput;
					id = dependentOutput.id;
				} else if (dependentOutput !== output) {
					// Join point
					id |= dependentOutput.id; // eslint-disable-line no-bitwise
					isJoinPoint = true;
				}
				// eslint-disable-next-line no-bitwise
				if (dependentOutput.type & SPLIT_POINT_MASK) type = COMMON_SPLIT_POINT;
			});

			// If other records awaiting resolution of this,
			// remove this from their lists of records they are waiting on
			let isAwaited = false;
			if (awaitedBy.size > 0) {
				isAwaited = true;
				for (const waiterRecord of awaitedBy) {
					// "You are not waiting on me any more"
					waiterRecord.output.awaiting.delete(record);
				}
			}

			// If awaiting resolution of other values, record this in `.awaiting` property.
			// Alter in progress pseudo-output object rather than collected object as it's not
			// the whole output which is in an incomplete state, just this record.
			if (awaiting.size > 0) {
				// Inform records this is awaiting that this (and any others awaiting this) are waiting on it
				for (const awaitedRecord of awaiting) {
					// "I am waiting on you"
					const awaitedAwaitedBy = awaitedRecord.output.awaitedBy;
					awaitedAwaitedBy.add(record);

					for (const waiterRecord of awaitedBy) {
						// "This guy is waiting on you too"
						awaitedAwaitedBy.add(waiterRecord);
						// "You (who was previously waiting on me) are now waiting on this guy"
						waiterRecord.output.awaiting.add(awaitedRecord);
					}
				}

				inProcessOutput.id = id;
				inProcessOutput.type = type;
				inProcessOutput.awaiting = awaiting;
				inProcessOutput.awaitedBy = undefined;
				return inProcessOutput;
			}

			// Get final output
			if (isJoinPoint || isAwaited) output = getOrCreateOutput(id, type);

			// If other records have been awaiting output resolution of this record, revise their outputs.
			// NB Need to recalculate for this record too to correctly determine if is a join point.
			if (isAwaited) {
				reviseOutput(record, output);
				return output;
			}

			// Set output for record
			record.output = output;
			numInProcess--;

			// If join point or entry point, add record to output
			if (isJoinPoint || isEntryPoint) addToExports(record, output);

			// Queue for traversal up dependencies.
			// No need to traverse up from sync split points - all dependencies used by entry points
			// or async split points will be reached by graph extending from them.
			if (!isSolelySyncSplitPoint) traverseUpQueue.push(record);

			// Return output
			return output;
		}

		function reviseOutput(record, output) {
			// Set output
			record.output = output;
			numInProcess--;

			// Revise output of dependents, and in process calculate if this is a join point
			let isJoinPoint = false;
			visitDependents(record, (dependentRecord) => {
				const dependentOutput = dependentRecord.output;
				if (dependentOutput.awaiting) {
					reviseOutput(dependentRecord, output);
				} else if (dependentOutput !== output && dependentOutput.type !== SYNC_SPLIT_POINT) {
					isJoinPoint = true;
				}
			});

			if (isJoinPoint) addToExports(record, output);

			// Queue for traversal up dependencies
			traverseUpQueue.push(record);
		}

		function addToExports(record, output) {
			const numExports = output.exports.push(record);
			if (numExports === 1) outputs.push(output);
		}

		// Create proxy records for each entry / split point.
		// The proxies are made dependents of each entry / split point's record.
		// They are the outer boundaries of the graph - their output is definitively known.
		for (const output of pointOutputs) {
			// Record output in outputs map
			recordInOutputsMap(output);

			// Output primitives immediately
			const {record} = output;
			if (!record.dependencies) {
				output.exports.push(record);
				record.output = output;
				outputs.push(output);
				continue;
			}

			// Create proxy record and set as dependent of record
			const proxyRecord = createRecord('proxy');
			record.dependents.push({record: proxyRecord, node: proxyRecord, key: 'node'});
			proxyRecord.output = output;
			output.proxyRecord = proxyRecord;
		}

		// Walk graph of dependents + dependencies from each entry point + async split point
		// and determine every record's output
		for (const output of entryPointOutputs) {
			walkGraphFrom(output.record);
		}

		// Make sure all outputs have been resolved
		assertBug(numInProcess === 0, 'Some values have unresolved outputs');

		// Ensure all entry + split points have valid outputs, and rename common outputs
		// which export only a entry/split point's record to point's name
		const {options} = this,
			entryPointsCanBeImported = !options.exec && options.format !== 'js';
		for (const pointOutput of pointOutputs) {
			const {record, proxyRecord} = pointOutput;
			pointOutput.record = undefined;
			pointOutput.proxyRecord = undefined;

			if (!record.dependencies) continue; // Primitive

			const {output} = record;
			if (!output) continue; // Unused sync split point

			if (output !== pointOutput) {
				const {exports} = output,
					pointType = pointOutput.type;
				if (
					exports.length === 1 && exports[0] === record
					&& (
						pointType === ENTRY_POINT
							? output.type === COMMON_POINT && entryPointsCanBeImported
							: output.type & COMMON_MASK // eslint-disable-line no-bitwise
					)
				) {
					// A common output exports only the point's record - make it the output for this point
					output.type = pointType;
					output.name = pointType !== SYNC_SPLIT_POINT
						? pointOutput.name
						: getNameIfUnique(pointOutput.requestedName);
					output.record = record;
					output.importFnRecords = pointOutput.importFnRecords;

					const {index} = pointOutput;
					pointOutputs[index] = output;
					if (pointType !== SYNC_SPLIT_POINT) entryPointOutputs[index] = output;
				} else if (pointOutput.type !== SYNC_SPLIT_POINT) {
					// Output will reference the common output via proxy.
					// Insert into outputs just before current output.
					outputs.splice(outputs.indexOf(output), 0, pointOutput);
					continue;
				}
			}

			// Delete proxy from record's dependents
			deleteLast(record.dependents, dependent => dependent.record === proxyRecord);
		}

		return outputs;
	}
};

/**
 * Visit record's dependents and call callback function on each.
 * @param {Object} record - Record
 * @param {Function} callback - Callback function to call with each dependent's record
 * @returns {undefined}
 */
function visitDependents(record, callback) {
	// Handle function/class prototypes, which can have no dependents.
	// e.g. `function f() {}; f.prototype.x = () => {};`
	// Act as if prototype is dependent on constructor function, creating circular dependents
	// between constructor function and prototype.
	// Callback with this first rather than last, so if a sync split point is a dependent,
	// it will remain in last place.
	if (record.prototypeOf) callback(record.prototypeOf);

	// Visit dependents
	for (const {record: dependentRecord} of record.dependents) {
		const assignmentRecord = dependentRecord.record;
		if (!assignmentRecord) {
			callback(dependentRecord);
		} else if (assignmentRecord !== record) {
			callback(assignmentRecord);
		}
	}
}

/**
 * Visit record's dependencies and call callback function on each.
 * @param {Object} record - Record
 * @param {Function} callback - Callback function to call with each dependency's record
 * @returns {undefined}
 */
function visitDependencies(record, callback) {
	visitDependenciesShallow(record, callback);

	const {assignments} = record;
	if (assignments) {
		for (const assignment of assignments) {
			visitDependenciesShallow(assignment, callback);
		}
	}
}

function visitDependenciesShallow(record, callback) {
	for (const dependency of record.dependencies) {
		callback(dependency.record);
	}
}

/**
 * Create output object.
 * @param {BigInt} id - Output ID
 * @param {number} type - Output type (one of consts imported above e.g. `ENTRY_POINT`)
 * @param {string} [name] - Output name (optional)
 * @param {number} [index] - Point index (entry / split points only)
 * @param {record} [record] - Record exported by output (entry / split points only)
 * @param {string} [requestedName] - Possible output name (sync split points only)
 * @returns {Object} - Output object
 */
function createOutput(id, type, name, index, record, requestedName) {
	return {
		id,
		type,
		name,
		requestedName,
		awaiting: undefined,
		awaitedBy: undefined,
		index,
		record,
		proxyRecord: undefined,
		importFnRecords: undefined,
		exports: [],
		filename: undefined,
		files: undefined
	};
}
