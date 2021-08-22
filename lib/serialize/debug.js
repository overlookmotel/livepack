/* --------------------
 * livepack module
 * Debug utilities
 * ------------------*/

/* eslint-disable no-console */

'use strict';

// Exports

module.exports = {debugDependencies};

/**
 * Log all dependency relations between records and assignments.
 * @param {Map} records - `serializer.records`
 * @returns {undefined}
 */
function debugDependencies(records) {
	// Create list of dependency relations
	const deps = new Map(),
		queue = [...records.values()],
		processed = new Set(),
		usedNames = Object.create(null),
		nonExistentRecord = {_name: '<no record>'};
	while (queue.length > 0) {
		const record = queue.shift();
		if (processed.has(record)) continue;
		processed.add(record);

		getName(record);

		for (const dependency of record.dependencies || []) {
			const depRecord = dependency.record;
			getOrCreateDep(record, depRecord || nonExistentRecord).numDependencies++;
			if (depRecord) queue.push(depRecord);
		}

		for (const dependent of record.dependents || []) {
			const depRecord = dependent.record;
			getOrCreateDep(depRecord || nonExistentRecord, record).numDependents++;
			if (depRecord) queue.push(depRecord);
		}

		for (const assignment of record.assignments || []) {
			queue.push(assignment);
		}
	}

	// Sort dependencies list
	const depsArr = [...deps.entries()];
	depsArr.sort(([record1], [record2]) => {
		if (record1._name < record2._name) return -1;
		if (record1._name > record2._name) return 1;
		return 0;
	});

	// Output dependencies list
	console.log('--------------------');
	console.log('DEBUG DEPENDENCIES:');

	for (const [record, dep] of depsArr) {
		const name = record._name;
		for (const [targetRecord, {numDependencies, numDependents}] of dep) {
			const targetName = targetRecord._name;
			console.log(
				`${name} -> ${targetName}${
					numDependencies !== numDependents
						? ` (${numDependencies} vs ${numDependents})`
						: numDependencies > 1
							? ` (${numDependencies})`
							: ''
				}`
			);
		}
	}

	console.log('--------------------');
	console.log('');

	// Helper functions
	function getOrCreateDep(record, targetRecord) {
		let dep = deps.get(record);
		if (!dep) {
			dep = new Map();
			deps.set(record, dep);
		}

		let dep2 = dep.get(targetRecord);
		if (!dep2) {
			dep2 = {numDependencies: 0, numDependents: 0};
			dep.set(targetRecord, dep2);
		}
		return dep2;
	}

	function getName(record) {
		if (record._name) return record._name;

		let name;
		if (record.dependencies && !record.dependents) {
			// Assignment
			const parent = record.record;
			name = `${getName(parent)} assignment ${parent.assignments.indexOf(record)}`;
		} else {
			// Record
			name = record.varNode ? record.varNode.name : 'unknown';
		}

		// Ensure name is unique
		if (usedNames[name]) {
			name += `[${++usedNames[name]}]`;
		} else {
			usedNames[name] = 1;
		}

		record._name = name;
		return name;
	}
}
