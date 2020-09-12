'use strict';

const livepack_tracker = 1; // eslint-disable-line no-unused-vars, camelcase

// eslint-disable-next-line no-eval
module.exports = eval('const livepack1_tracker = 2; eval("const livepack2_tracker = 3; () => [livepack_tracker, livepack1_tracker, livepack2_tracker]")');
