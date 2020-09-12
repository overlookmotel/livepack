'use strict';

const livepack_tracker = 1; // eslint-disable-line no-unused-vars, camelcase

// eslint-disable-next-line no-eval
module.exports = eval('const livepack_tracker = 2; eval("const livepack_tracker = 3; () => livepack_tracker")');
