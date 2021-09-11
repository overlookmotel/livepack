// eslint-disable-next-line no-return-assign
export const memoize = fn => (...args) => fn._value || (fn._value = fn(...args));

export const importModule = (id, hasNoDependencies) => (
	// Extension here would be set according to `ext` option.
	// If runtime is in a nested dir, relative path segment would be set to `../` instead of `./`.
	import(`./${id}.mjs`)
		.then((mod) => {
			mod = mod.default;
			return hasNoDependencies ? mod : memoize(mod);
		})
);

export const importMany = (...ids) => {
	const numWithNoDependencies = typeof ids[0] === 'number' ? ids.shift() : 0;
	return Promise.all(
		ids.map((id, index) => importModule(id, index < numWithNoDependencies))
	);
};

export const importValue = id => importModule(id, true);
