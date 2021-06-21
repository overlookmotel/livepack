/* --------------------
 * livepack module
 * Function to get unique scope ID
 * ------------------*/

'use strict';

// Exports

let nextScopeId = 1;

module.exports = () => nextScopeId++;
