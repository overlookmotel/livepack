import React, {useState} from 'react';
import {render} from 'react-dom';

function Hello({name}) {
	const [count, setCount] = useState(1);

	if (count === 10) throw new Error(`Well holy moley ${name}`);

	return (
		<div>
			<div>Hello {name}</div>
			<div>Counter {count}</div>
			<button onClick={() => setCount(c => c + 1)}>Increment counter</button>
		</div>
	);
}

export default () => {
	render(
		<Hello name="Burt" />,
		document.getElementById('root') // eslint-disable-line no-undef
	);
};
