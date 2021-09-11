export default (abcd, createCd) => {
	const cd = createCd(abcd);
	return () => cd('d');
};
