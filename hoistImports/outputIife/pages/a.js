'use strict';

(window.__livepack || (window.__livepack = [])).push([ // eslint-disable-line no-sparse-arrays, no-undef
	'pages/a',,
	(abcd, createAb) => {
		const ab = createAb(abcd);
		return () => ab('a');
	}
]);
