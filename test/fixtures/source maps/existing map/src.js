'use strict';

const message = 'foo';
module.exports = () => { throw new Error(message); };
