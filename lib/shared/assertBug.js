/* --------------------
 * livepack module
 * Assertion function for bugs
 * ------------------*/

'use strict';

// Modules
const {isFunction} = require('is-it-type');

// Exports

/**
 * Assert with error message including request to file an issue in Livepack repo.
 * Use this function for sanity checks - conditions which should never arise if everything is working.
 * @param {*} condition - Condition - if falsy, error will be thrown
 * @param {string} [message] - Error message
 * @param {string} [explanation] - Further context for error
 * @param {Function} [getDiagnostics] - Function to run to get diagnostic details
 * @throws {Error} - If assertion fails
 * @returns {undefined}
 */
module.exports = function assertBug(condition, message, explanation, getDiagnostics) {
	if (condition) return;

	if (!message) message = 'Unknown error';
	if (isFunction(explanation)) {
		getDiagnostics = explanation;
		explanation = null;
	}

	let helpMsg = `${message}.\n`;
	if (explanation) helpMsg += `${explanation}.\n`;
	helpMsg += 'This is likely a bug in Livepack.\nPlease raise an issue at https://github.com/overlookmotel/livepack/issues';
	if (getDiagnostics) {
		helpMsg += ' including the following details:\n';
		helpMsg += getDiagnostics();
	}

	console.error(helpMsg); // eslint-disable-line no-console

	const err = new Error(message);
	Error.captureStackTrace(err, assertBug);
	throw err;
};
