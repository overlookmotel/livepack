/* --------------------
 * livepack module
 * serialize methods
 * ------------------*/

'use strict';

// Exports

module.exports = {
	/**
	 * Serialize value to Javascript code.
	 * @param {*} val - Value to serialize
	 * @returns {Array<Object>} - Array of file objects
	 */
	serialize(val) {
		// Serialize value to record
		const record = this.serializeValue(val, 'exports', '<root>');

		// Output as files
		return this.output(record);
	}
};
