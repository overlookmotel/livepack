'use strict';

const React = require('react');

function Person({firstName, lastName, bestFilm}) {
	return (
		<div>
			<h2>{firstName} {lastName}</h2>
			<div>First name: {firstName}</div>
			<div>Last name: {lastName}</div>
			<div>Best film: {bestFilm}</div>
		</div>
	);
}

module.exports = Person;
