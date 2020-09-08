'use strict';

const inner1 = require('./1.js'),
	{inner2, inner3} = require('./2.js');

module.exports = {inner1, inner2, inner3};
