/* --------------------
 * livepack
 * Tests fixtures functions
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, dirname} = require('path'),
	{writeFileSync, mkdirSync, rmSync} = require('fs'),
	{spawn} = require('child_process'),
	{isString} = require('is-it-type');

// Imports
const transpiledFiles = require('./transpiledFiles.js');

// Constants
const TESTS_DIR_PATH = pathJoin(__dirname, '../'),
	TEMP_DIR_PATH = pathJoin(TESTS_DIR_PATH, '_temp'),
	REGISTER_PATH = pathJoin(__dirname, '../../register.js'),
	MAIN_PATH = pathJoin(__dirname, '../../index.js'),
	DEFAULT_FILENAME = 'index.js';

// Exports

module.exports = {createFixtures, cleanupFixtures, withFixtures, serializeInNewProcess};

// `fixturesPath` will be unique for each test file
const fixturesPath = pathJoin(TEMP_DIR_PATH, require.main.filename.slice(TESTS_DIR_PATH.length));
let fixtureNum = 0;

/**
 * Write fixtures files to unique temp dir.
 * `files` is a Object of form `{'index.js': 'content of index.js'}`
 * or a string containing content of a single file.
 * Returns array of full file paths.
 *
 * @param {Object|string} files - Object mapping filenames to file content, or single file content string
 * @returns {Array<string>} - Array of full file paths
 */
function createFixtures(files) {
	// Create unique temp path
	const fixturePath = pathJoin(fixturesPath, `${fixtureNum++}`);

	// Write files to temp dir
	files = conformFiles(files);
	const paths = [];
	for (const filename of Object.keys(files)) {
		const path = pathJoin(fixturePath, filename);

		mkdirSync(dirname(path), {recursive: true});
		writeFileSync(path, files[filename]);

		paths.push(path);
	}

	// Return file paths
	return paths;
}

/**
 * Cleanup fixtures.
 * Delete files from disc, delete from `transpiledFiles`.
 * @param {Array<string>} paths - Array of fixture file paths
 * @returns {undefined}
 */
function cleanupFixtures(paths) {
	for (const path of paths) {
		rmSync(path);
		delete transpiledFiles[path];
	}
}

/**
 * Run a function with fixtures.
 *
 * Write fixtures files to disc and `require()` first file.
 * Pass that input to function provided, along with info `{fixturePath, fixturePaths, transpiled}`:
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
	const cleanup = () => cleanupFixtures(paths);

	try {
		// `require()` first fixture file
		const path = paths[0];
		const input = require(path); // eslint-disable-line global-require, import/no-dynamic-require

		// Call test function
		const res = fn(input, {path, paths, transpiled: transpiledFiles[path]});

		if (res instanceof Promise) {
			return res.then(
				(value) => {
					cleanup();
					return value;
				},
				(err) => {
					cleanup();
					throw err;
				}
			);
		}

		cleanup();
		return res;
	} catch (err) {
		cleanup();
		throw err;
	}
}

/**
 * Serialize fixture files in child process.
 * @param {Object|string} files - Files (if string, will be used as `index.js` file)
 * @returns {string} - Serialized output
 */
async function serializeInNewProcess(files) {
	files = conformFiles(files);

	files = {
		'entry.js': [
			`require(${JSON.stringify(REGISTER_PATH)})({cache: false});`,
			`const {serialize} = require(${JSON.stringify(MAIN_PATH)});`,
			`const input = require(${JSON.stringify(`./${Object.keys(files)[0]}`)});`,
			'console.log(serialize(input));'
		].join('\n'),
		...files
	};

	const path = createFixtures(files)[0];
	const js = await spawnNode(path);
	return js.trim();
}

function spawnNode(path) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [path]);

		let stdout = '',
			stderr = '';
		child.stdout.on('data', (chunk) => { stdout += chunk; });
		child.stderr.on('data', (chunk) => { stderr += chunk; });

		child.on('close', () => {
			if (stderr !== '') {
				reject(new Error(`Unexpected stderr output: ${stderr}`));
			} else {
				resolve(stdout);
			}
		});
	});
}

/**
 * Conform `files` to an object mapping filename to file content
 * @param {Object|string} files - Object mapping filenames to file content, or single file content string
 * @returns {Object} - Object mapping filenames to file content
 */
function conformFiles(files) {
	return isString(files) ? {[DEFAULT_FILENAME]: files} : files;
}
