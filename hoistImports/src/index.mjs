import ab from './common/ab.mjs';

(async () => {
	ab('sync');

	(await import('./pages/a.mjs')).default();
	(await import('./pages/b.mjs')).default();
	(await import('./pages/c.mjs')).default();
	(await import('./pages/d.mjs')).default();

	(await import('./common/abcd.mjs')).default('direct');
})();
