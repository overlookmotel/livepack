/* --------------------
 * livepack module
 * Filenames methods
 * ------------------*/

'use strict';

// Modules
const {createHash} = require('crypto'),
	base32Encode = require('base32.js').encode,
	assert = require('simple-invariant');

// Imports
const {
	DEFAULT_SPLIT_CHUNK_NAME, DEFAULT_COMMON_CHUNK_NAME, SPLIT_POINT_MASK
} = require('./constants.js');

// Exports

module.exports = {
	/**
	 * Init used filenames map.
	 * @returns {undefined}
	 */
	initFilenames() {
		this.usedFilenames = Object.create(null);
	},

	/**
	 * Create filename for output, based on template.
	 * Template can include placeholders `[name]` and `[hash]`.
	 * Hash is calculated from file content only if it's required.
	 * Filenames guaranteed to be unique.
	 * @param {Object} output - Output object
	 * @param {string} content - File content
	 * @returns {string} - Filename
	 * @throws {Error} - If unable to create unique filename
	 */
	getOutputFilename(output, content) {
		// Get template for filename
		const typeName = this.getOutputTypeName(output),
			template = this.getFilenameTemplate(typeName);

		// Calculate hash only if required
		let hash = template.includes('[hash]') ? sha1Base32(content) : '';

		// Get filename
		const {ext} = this.options;
		const filename = createFilename(output, template, hash, ext);

		// Check filename is unique
		const {usedFilenames} = this,
			numUses = usedFilenames[filename] || 0;
		usedFilenames[filename] = numUses + 1;
		if (numUses === 0) return filename;

		// Filename is not unique - amend hash
		assert(hash, `options.${typeName}ChunkName must include '[hash]' if filenames are not unique`);
		hash = sha1Base32(`${hash}-${numUses}`);
		return createFilename(output, template, hash, ext);
	},

	/**
	 * Create temp filename for output, based on template.
	 * Differences from `getOutputFilename()` are:
	 *   1. Filenames not guaranteed to be unique
	 *   2. Dummy hash '--------' is used
	 * Filename is guaranteed to be same directory as eventual filename, and same length.
	 * @param {Object} output - Output object
	 * @returns {string} - Filename
	 */
	getTempOutputFilename(output) {
		const template = this.getFilenameTemplate(this.getOutputTypeName(output));
		return createFilename(output, template, '--------', this.options.ext);
	},

	/**
	 * Get filename template.
	 * @param {string} typeName - Output type name ('entry', 'split' or 'common')
	 * @returns {string} - Filename template
	 */
	getFilenameTemplate(typeName) {
		return this.options[`${typeName}ChunkName`];
	}
};

/**
 * Create filename using template.
 * @param {Object} output - Output object
 * @param {string} template - Filename template
 * @param {string} hash - Hash of file
 * @param {string} ext - File extension
 * @returns {string} - Filename
 */
function createFilename(output, template, hash, ext) {
	const name = template
		.replace(/\[hash\]/g, hash)
		.replace(
			/\[name\]/g,
			output.name
			// eslint-disable-next-line no-bitwise
			|| (output.type & SPLIT_POINT_MASK ? DEFAULT_SPLIT_CHUNK_NAME : DEFAULT_COMMON_CHUNK_NAME)
		);
	return `${name}.${ext}`;
}

/**
 * Hash file contents.
 * Uses SHA1 hash, Base32-encoded and truncated to 8 characters. This is the same as ESBuild uses.
 * @param {string} content - File content
 * @returns {string} - Hash
 */
function sha1Base32(content) {
	const buf = createHash('sha1').update(content).digest();
	return base32Encode(buf).slice(0, 8);
}
