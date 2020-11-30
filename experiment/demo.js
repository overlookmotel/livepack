/* eslint-disable indent */
/* eslint-disable no-return-assign */
/* eslint-disable no-console */

'use strict';

function createFunctions() {
  const fns = [0, 1].map(() => {
    let x = 1;
    return {
      getX: () => x,
      setX: v => x = v
    };
  });

  const zeroOrOne = Math.round(Math.random());

  return {
    getX: fns[0].getX,
    setX: fns[zeroOrOne].setX
  };
}

const {getX, setX} = createFunctions();

debugger;

setX(2);
console.log(getX());
