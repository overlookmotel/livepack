'use strict';

async function getAllPeople() {
	return [
		{firstName: 'Harrison', lastName: 'Ford', bestFilm: 'Raiders of the Lost Ark'},
		{firstName: 'Marlon', lastName: 'Brando', bestFilm: 'Apocalypse Now'},
		{firstName: 'Orson', lastName: 'Welles', bestFilm: 'Citizen Kane'},
		{firstName: 'Peewee', lastName: 'Herman', bestFilm: 'n/a'},
		{firstName: 'Sylvester', lastName: 'Stallone', bestFilm: 'Cobra'}
	];
}

module.exports = {getAllPeople};
