'use strict';

const React = require('react');
const ReactDOM = require('react-dom');
const {split} = require('livepack');

const db = require('./database.js');
const App = require('./components/App.js');
const createPages = require('./createPages.js');

// Split React + ReactDOM into a separate chunk as they won't change often
split({React, ReactDOM});

// Export a promise to allow async work to be done
// before returning app to be built.
module.exports = (async () => {
	// Get people from database
	const people = await db.getAllPeople();

	// Create array of pages
	const pages = createPages(people);

	// Return function to be executed when app starts
	return () => {
		ReactDOM.render(
			<App pages={pages} />,
			document.getElementById('root')
		);
	};
})();
