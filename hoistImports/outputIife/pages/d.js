'use strict';

(window.__livepack || (window.__livepack = [])).push([ // eslint-disable-line no-sparse-arrays, no-undef
	'pages/d',,
	(abcd, createCd) => {
		const cd = createCd(abcd);
		return () => cd('d');
	}
]);
