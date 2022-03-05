/* --------------------
 * livepack module
 * Register ESM entry point
 * ------------------*/

// Imports
import register from '../lib/register/index.js';

const {revert} = register;

// Exports

export default register;
export {revert};
