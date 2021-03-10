'use strict';

const React = require('react');

function App({pages}) {
	const [Component, setComponent] = React.useState();

	return (
		<>
			<h1>People!</h1>

			<ul>{
				pages.map(({name, component}) => (
					<li key={name}>
						<a href="#" onClick={ () => setComponent(component) }>{name}</a>
					</li>
				))
			}</ul>

			<hr />

			<React.Suspense fallback="Loading...">
				{ Component && <Component /> }
			</React.Suspense>
		</>
	);
}

module.exports = App;
