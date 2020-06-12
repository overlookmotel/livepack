/* eslint-disable strict */
/* eslint-disable prefer-rest-params */
/* eslint-disable no-console */

// 'use strict';

const {slice} = Array.prototype;

function makeX() {
	// 'use strict';

	function x(a, b, c) {
		// 'use strict';

		console.log('start');

		console.log('args1:', slice.call(arguments));
		console.log('vars1:', {a, b, c});

		a = 11;
		c = 33;

		console.log('args2:', slice.call(arguments));
		console.log('vars2:', {a, b, c});

		arguments[1] = 22;

		console.log('args3:', slice.call(arguments));
		console.log('vars3:', {a, b, c});
	}

	return x;
}

const x = makeX();

x(1, 2, 3);
