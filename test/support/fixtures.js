/* --------------------
 * livepack
 * Tests fixtures functions
 * ------------------*/

'use strict';

// Modules
const pathJoin = require('path').join,
	{spawn} = require('child_process'),
	{isString} = require('is-it-type');

// Imports
const {getFixtures, setFixtures, clearFixtures, FIXTURES_DIR_PATH} = require('./fixturesFs.js'),
	fixturesState = require('./fixturesState.js'),
	maps = require('../../lib/register/maps.js'),
	moduleCache = require('../../lib/shared/moduleCache.js').cache,
	{globals} = require('../../lib/shared/internal.js');

// Constants
const SPAWNED_PATH = pathJoin(__dirname, 'spawned.js'),
	DEFAULT_FILENAME = 'index.js';

// Exports

module.exports = {withFixtures, serializeInNewProcess};

let fixtureNum = 0;

// Fixture files which are `require()`-ed will be added to `module.children`.
// Capture it now so they can be deleted again after finished with fixtures, to free memory.
const moduleChildren = module.children,
	moduleChildrenLength = moduleChildren.length;

/**
 * Record fixtures as virtual files in a fake temp dir.
 * `files` is a Object of form `{'index.js': 'content of index.js'}`
 * or a string containing content of a single file.
 * Returns array of full file paths.
 *
 * @param {Object|string} files - Object mapping filenames to file content, or single file content string
 * @returns {Array<string>} - Array of full file paths
 */
function createFixtures(files) {
	const fixtures = createFixturesFiles(files);
	setFixtures(fixtures);
	return [...fixtures.keys()];
}

/**
 * Create fixtures files object.
 * @param {Object|string} files - Object mapping filenames to file content, or single file content string
 * @returns {Object} - Object mapping file paths to file contents
 */
function createFixturesFiles(files) {
	// Create unique temp dir path
	const fixturePath = pathJoin(FIXTURES_DIR_PATH, `${fixtureNum++}`);

	// Create object mapping file paths to content
	files = conformFiles(files);
	const fixtures = new Map();
	for (const [filename, content] of Object.entries(files)) {
		fixtures.set(pathJoin(fixturePath, filename), content);
	}
	return fixtures;
}

/**
 * Cleanup fixtures.
 * For each fixture file:
 *   - Delete virtual file
 *   - Delete module from NodeJS module cache
 *   - Delete source map from source maps cache
 *   - Delete module object from `globals`
 * @returns {undefined}
 */
function cleanupFixtures() {
	for (const path of getFixtures().keys()) {
		const module = moduleCache[path];
		if (!module) continue;

		delete moduleCache[path];
		delete maps[path];
		globals.delete(module);
	}

	clearFixtures();

	// Remove references to fixtures modules from `module.children`
	moduleChildren.length = moduleChildrenLength;
}

/**
 * Run a function with fixtures.
 *
 * Write fixtures files to disc and `require()` first file.
 * Pass that input to function provided, along with info `{path, paths, transpiled}`:
 *   - `path` is the path to first fixture file on disc
 *   - `paths` is an array of paths to fixtures files
 *   - `transpiled` is the content of first file after instrumentation
 * Then clean up fixtures after provided function returns.
 * If provided function returns a Promise, promise is awaited before cleanup.
 *
 * @param {Object|string} files - Object mapping filenames to file content, or single file content string
 * @param {Function} fn - Function to run with fixtures
 * @returns {*} - Return value of passed-in function
 * @throws {*} - If `require()`-ing fixture throws, or passed-in function throws
 */
function withFixtures(files, fn) {
	// Create fixtures
	const paths = createFixtures(files);

	try {
		// `require()` first fixture file.
		// Capture fixture's transpiled code.
		const path = paths[0];
		let input, transpiled;
		fixturesState.isCapturingTranspiledCode = true;
		try {
			input = require(path); // eslint-disable-line global-require, import/no-dynamic-require
			transpiled = fixturesState.transpiledCode;
		} finally {
			fixturesState.isCapturingTranspiledCode = false;
			fixturesState.transpiledCode = undefined;
		}

		// Call test function
		const res = fn(input, {path, paths, transpiled});

		if (res instanceof Promise) {
			return res.then(
				(value) => {
					cleanupFixtures();
					return value;
				},
				(err) => {
					cleanupFixtures();
					throw err;
				}
			);
		}

		cleanupFixtures();
		return res;
	} catch (err) {
		cleanupFixtures();
		throw err;
	}
}

/**
 * Serialize fixture files in child process.
 * @param {Object|string} files - Files (if string, will be used as `index.js` file)
 * @returns {string} - Serialized output
 */
async function serializeInNewProcess(files) {
	// Create fixtures object
	const fixtures = createFixturesFiles(files);

	// Spawn new process `./spawned.js`, pass in fixtures to stdin, and get output from stdout
	const js = await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [SPAWNED_PATH]);

		let stdout = '',
			stderr = '';
		child.stdout.on('data', (chunk) => { stdout += chunk; });
		child.stderr.on('data', (chunk) => { stderr += chunk; });

		child.stdin.write(`${JSON.stringify([...fixtures])}\n`);

		child.on('close', () => {
			if (stderr !== '') {
				reject(new Error(`Unexpected stderr output: ${stderr}`));
			} else {
				resolve(stdout);
			}
		});
	});

	// Return output
	return js.trim();
}

/**
 * Conform `files` to an object mapping filename to file content
 * @param {Object|string} files - Object mapping filenames to file content, or single file content string
 * @returns {Object} - Object mapping filenames to file content
 */
function conformFiles(files) {
	return isString(files) ? {[DEFAULT_FILENAME]: files} : files;
}
