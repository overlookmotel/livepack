/* --------------------
 * livepack module
 * Filenames methods + functions
 * ------------------*/

'use strict';

// Modules
const {createHash} = require('crypto'),
	base32Encode = require('base32.js').encode,
	assert = require('simple-invariant');

// Imports
const {
	DEFAULT_SPLIT_CHUNK_NAME, DEFAULT_COMMON_CHUNK_NAME, HASH_LENGTH, HASH_PLACEHOLDER_CHAR,
	ENTRY_POINT, SPLIT_POINT_MASK
} = require('./constants.js');

// Exports

const methods = {
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
	 * If `[hash]` placeholder is used:
	 *   - If file content is provided, it is hashed.
	 *   - Otherwise, a placeholder of form `%%%%%%%<output.index>` is used as hash.
	 * Hash is calculated from file content only if it's required.
	 * If filename is final (i.e. file content provided), filename is guaranteed to be unique
	 * (assuming no hash collisions by chance).
	 *
	 * @param {Object} output - Output object
	 * @param {string} [content] - File content (optional)
	 * @returns {string} - Filename
	 * @throws {Error} - If unable to create unique filename
	 */
	getOutputFilenameAndHash(output, content) {
		// Get template for filename
		const {options} = this,
			typeName = getOutputTypeName(output),
			template = options[`${typeName}ChunkName`];

		// Calculate hash only if required
		let hash;
		if (template.includes('[hash]')) {
			if (content) {
				hash = hashFileContent(content);
			} else {
				hash = `${output.index}`.padStart(HASH_LENGTH, HASH_PLACEHOLDER_CHAR);
			}
		}

		// Get filename
		const {ext} = options;
		let filename = createFilename(output, template, hash, ext);

		// Check filename is unique
		if (content || !hash) {
			const {usedFilenames} = this,
				numUses = usedFilenames[filename] || 0;
			usedFilenames[filename] = numUses + 1;
			if (numUses > 0) {
				// Filename is not unique - amend hash
				assert(hash, `options.${typeName}ChunkName must include '[hash]' if filenames are not unique`);
				hash = hashFileContent(`${hash}-${numUses}`);
				filename = createFilename(output, template, hash, ext);
			}
		}

		return {filename, hash};
	}
};

module.exports = {
	methods,
	getOutputTypeName,
	hashFileContent
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
 * Get output type name
 * @param {Object} output - Output object
 * @returns {string} - Type name ('entry', 'split' or 'common')
 */
function getOutputTypeName(output) {
	const {type} = output;
	return type === ENTRY_POINT // eslint-disable-line no-nested-ternary
		? 'entry'
		: type & SPLIT_POINT_MASK // eslint-disable-line no-bitwise
			? 'split'
			: 'common';
}

/**
 * Hash file content.
 * Uses SHA1 hash, Base32-encoded and truncated to 8 characters. This is the same as ESBuild uses.
 * @param {string} content - File content
 * @returns {string} - Hash
 */
function hashFileContent(content) {
	const buf = createHash('sha1').update(content).digest();
	return base32Encode(buf).slice(0, HASH_LENGTH);
}
