export let x = 1;

export function getX() {
	return eval('x');
}

export function setX(v) {
	eval('x = v');
};
