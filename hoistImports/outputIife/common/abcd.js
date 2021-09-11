'use strict';

(window.__livepack || (window.__livepack = [])).push([ // eslint-disable-line no-undef
	'common/abcd',
	(name) => {
		console.log(`hello there ${name}`); // eslint-disable-line no-console
	}
]);
