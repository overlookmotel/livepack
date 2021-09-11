export default (abcd, createAb) => {
	const ab = createAb(abcd);
	return () => ab('b');
};
