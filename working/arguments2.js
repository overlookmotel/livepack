/* eslint-disable strict */
/* eslint-disable prefer-rest-params */
/* eslint-disable no-console */

// 'use strict';

function x(a, b, c) {
	arguments[0] = 11;
	arguments = [];

	console.log('arguments:', arguments);
	console.log('vars:', {a, b, c});
}

x(1, 2, 3);
