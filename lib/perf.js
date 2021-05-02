/* --------------------
 * livepack module
 * Performance tracking
 * ------------------*/

/* eslint-disable no-console */

'use strict';

// Modules
const {PerformanceObserver, performance} = require('perf_hooks');

// Exports

// `LIVEPACK_PERF` env var enables performance tracking
module.exports = process.env.LIVEPACK_PERF ? getCreateMeasure() : getNoopCreateMeasure();

/**
 * Create `createMeasure()` function.
 * @returns {Function}
 */
function getCreateMeasure() {
	// Init performance hook
	const obs = new PerformanceObserver((items) => {
		console.log('-----------');
		console.log('Performance');
		console.log('-----------');
		for (const entry of items.getEntries()) {
			console.log(`${entry.name}:`, Math.floor(entry.duration));
		}
		console.log('-----------');

		performance.clearMarks();
	});
	obs.observe({entryTypes: ['measure'], buffered: true});

	// Create function to create measure function
	function createMeasure(name) {
		let previousMarkName = `${name}: Start`;
		performance.mark(previousMarkName);

		function measure(eventName) {
			const markName = `${name}: ${eventName}`;
			performance.mark(markName);
			performance.measure(markName, previousMarkName);
			previousMarkName = markName;
		}

		measure.child = childName => createMeasure(`${name}: ${childName}`);

		return measure;
	}

	createMeasure('Perf')('Init');

	return createMeasure;
}

/**
 * Create no-op `createMeasure()` function.
 * @returns {Function}
 */
function getNoopCreateMeasure() {
	return function createMeasure() {
		function measure() {}
		measure.child = createMeasure;
		return measure;
	};
}
