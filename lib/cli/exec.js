/* --------------------
 * livepack module
 * CLI child process
 * ------------------*/

/* eslint-disable import/order, import/newline-after-import */

'use strict';

// Use internal module cache
const {useInternalModuleCache} = require('../shared/moduleCache.js');
const revertModuleCache = useInternalModuleCache();

// Catalog globals etc
require('../init/index.js');

// Throw unhandled rejections
process.on('unhandledRejection', (err) => {
	throw err;
});

// Import dependencies required for serialize.
// `fs-extra` must be imported after cataloging globals as `fs-extra` uses `graceful-fs` internally,
// which monkey-patches `fs` module. Need to catalog globals before `graceful-fs`'s patches are applied.
const {resolve: pathResolve, join: pathJoin, dirname} = require('path'),
	{writeFile, mkdirs} = require('fs-extra'),
	{serializeEntries} = require('../serialize/index.js');

// Switch back to global module cache
revertModuleCache();

// Run

(async () => {
	// Get options from parent via IPC
	process.send('ready');
	const {outPath, inputs, options} = await new Promise(resolve => process.on('message', resolve));
	process.disconnect();

	// Load sources
	const entries = {};
	await Promise.all(
		Object.entries(inputs).map(async ([name, pathOriginal]) => {
			const path = pathResolve(pathOriginal);

			let entry;
			try {
				entry = (await import(path)).default;
			} catch (err) {
				if (
					err && err.code === 'ERR_MODULE_NOT_FOUND'
					&& err.message === `Cannot find module '${path}' imported from ${__filename}`
				) {
					throw new Error(`Cannot load input file '${pathOriginal}'`);
				}
				throw err;
			}

			// Await Promise value
			entry = await entry;

			entries[name] = entry;
		})
	);

	// Serialize
	const files = serializeEntries(entries, options);

	// Output files
	for (const {filename, content} of files) {
		const path = pathJoin(outPath, filename);
		await mkdirs(dirname(path));
		await writeFile(path, content);
	}
})();
