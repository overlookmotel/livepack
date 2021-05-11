/* --------------------
 * livepack module
 * `isNumber()` runtime function
 * ------------------*/

'use strict';

// Exports

/**
 * Test if value is a number.
 * @param {*} val - Value to be tested
 * @returns {boolean} - `true` if is number
 */
module.exports = val => typeof val === 'number';
