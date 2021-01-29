/* --------------------
 * livepack
 * Function to create fixtures from inline definitions
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, dirname} = require('path'),
	{writeFileSync, mkdirsSync} = require('fs-extra'),
	{spawn} = require('child_process'),
	{isString} = require('is-it-type');

// Constants
const TESTS_DIR_PATH = pathJoin(__dirname, '../'),
	TEMP_DIR_PATH = pathJoin(TESTS_DIR_PATH, '_temp'),
	REGISTER_PATH = pathJoin(__dirname, '../../register.js'),
	MAIN_PATH = pathJoin(__dirname, '../../index.js'),
	DEFAULT_FILENAME = 'index.js';

// Exports

let fixtureNum = 0;

/**
 * Create fixtures functions for use in a test file.
 * Takes test file's path as argument and creates a temp dir path which is unique for this test file.
 * This ensures that fixtures paths do not clash when test files are run in parallel.
 * @param {string} testPath - Path to test file
 * @returns {Object} - Fixtures functions
 */
module.exports = function createFixturesFunctions(testPath) {
	// Create temp dir path, incorporating test file's filename
	const tempPath = pathJoin(TEMP_DIR_PATH, testPath.slice(TESTS_DIR_PATH.length));

	// Return fixtures functions
	return {
		createFixtures: files => createFixtures(tempPath, files),
		createFixture: code => createFixture(tempPath, code),
		requireFixtures: files => requireFixtures(tempPath, files),
		requireFixture: code => requireFixture(tempPath, code),
		serializeInNewProcess: files => serializeInNewProcess(tempPath, files)
	};
};

/**
 * Write fixtures files to unique temp dir.
 * `files` is a Object of form `{'index.js': 'content of index.js'}`.
 * Returns Object mapping filenames to paths
 * e.g. `{'index.js': '/path/to/livepack/test/_temp/testName/0/index.js'}`
 *
 * @param {string} tempPath - Temp dir path
 * @param {Object} files - Files
 * @returns {Object} - Mapping of names to full paths
 */
function createFixtures(tempPath, files) {
	// Create unique temp path
	tempPath = pathJoin(tempPath, `${fixtureNum++}`);

	// Write files to temp dir
	const paths = Object.create(null);
	for (const filename of Object.keys(files)) {
		const filePath = pathJoin(tempPath, filename);

		mkdirsSync(dirname(filePath));
		writeFileSync(filePath, files[filename]);

		paths[filename] = filePath;
	}

	// Return file paths
	return paths;
}

/**
 * Write a single fixture file to temp dir and return path to file.
 * @param {string} tempPath - Temp dir path
 * @param {string} code - File content
 * @return {string} - File path
 */
function createFixture(tempPath, code) {
	return createFixtures(tempPath, {[DEFAULT_FILENAME]: code})[DEFAULT_FILENAME];
}

/**
 * Write fixtures files to unique temp dir and `require()` first file.
 * @param {string} tempPath - Temp dir path
 * @param {Object} files - Files
 * @returns {*} - Result of `require()`-ing first file
 */
function requireFixtures(tempPath, files) {
	const fixturesPaths = createFixtures(tempPath, files);
	const path = fixturesPaths[Object.keys(fixturesPaths)[0]];
	return require(path); // eslint-disable-line global-require, import/no-dynamic-require
}

/**
 * Write a single fixture file to temp dir and `require()` it.
 * @param {string} tempPath - Temp dir path
 * @param {string} code - File content
 * @returns {*} - Result of `require()`-ing file
 */
function requireFixture(tempPath, code) {
	return requireFixtures(tempPath, {[DEFAULT_FILENAME]: code});
}

/**
 * Serialize fixture files in child process.
 * @param {string} tempPath - Temp dir path
 * @param {Object|string} files - Files (if string, will be used as `index.js` file)
 * @returns {string} - Serialized output
 */
async function serializeInNewProcess(tempPath, files) {
	if (isString(files)) files = {[DEFAULT_FILENAME]: files};

	files = {
		'entry.js': [
			`require(${JSON.stringify(REGISTER_PATH)})({cache: false});`,
			`const {serialize} = require(${JSON.stringify(MAIN_PATH)});`,
			`const input = require(${JSON.stringify(`./${Object.keys(files)[0]}`)});`,
			'console.log(serialize(input));'
		].join('\n'),
		...files
	};

	const path = createFixtures(tempPath, files)['entry.js'];
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
