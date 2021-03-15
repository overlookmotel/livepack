'use strict';

const React = require('react');
const {splitAsync} = require('livepack');

const Person = require('./components/Person.js');

// Return array of objects, each of form `{name, component}`.
// Each component uses `React.lazy` and `splitAsync` to load it asynchronously on demand.
function createPages(people) {
	return people.map(createPage);
}

function createPage(person) {
	return {
		name: person.firstName,
		component: createPageComponent(person)
	};
}

function createPageComponent(person) {
	const {firstName, lastName, bestFilm} = person;

	return React.lazy(
		splitAsync(
			// Split into separate file. Function captures vars from upper scope.
			() => Person({firstName, lastName, bestFilm}),
			// Name each split file
			firstName.toLowerCase()
		)
	);
}

module.exports = createPages;
