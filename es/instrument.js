/* --------------------
 * livepack module
 * Instrument code ESM entry point
 * ------------------*/

// Imports
import instrument from '../lib/instrument/index.js';

// Exports

export default instrument;
export const {parse, instrumentCode, instrumentAst} = instrument;
