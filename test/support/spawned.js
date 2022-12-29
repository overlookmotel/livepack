/* --------------------
 * livepack
 * File that is spawned in new process by `serializeInNewProcess()`
 * ------------------*/

'use strict';

// Install register require hook
require('./register.js');

// Imports
const {setFixtures} = require('./fixturesFs.js'),
	{serialize} = require('../../index.js');

(async () => {
	// Get fixtures from stdin
	const buffers = [];
	await new Promise((resolve, reject) => {
		function onData(chunk) {
			buffers.push(chunk);

			if (chunk[chunk.length - 1] === 10) {
				end();
				resolve();
			}
		}

		function onError(err) {
			end();
			reject(err);
		}

		function end() {
			process.stdin.off('data', onData)
				.off('error', onError)
				.unref();
		}

		process.stdin.on('data', onData).on('error', onError);
	});

	// Create virtual fixtures files
	const fixtures = JSON.parse(Buffer.concat(buffers));
	setFixtures(fixtures);

	// Load first fixture file
	// eslint-disable-next-line global-require, import/no-dynamic-require
	const input = require(Object.keys(fixtures)[0]);

	// Serialize input and output result to stdout
	console.log(serialize(input)); // eslint-disable-line no-console
})();
