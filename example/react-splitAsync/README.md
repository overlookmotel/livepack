# Livepack

## `asyncSplit()` with React

A very simple example of using `livepack.asyncSplit()` with React to code-split an app into separate files which are lazy-loaded on demand.

### Build app

```js
npm install
npm run build
```

React app will be built in the `build` folder.

### Serve app

```js
npm start
```

React app will be served at `http://localhost:5000`.

### Notes

Notice that:

* The `Person` component is in a separate chunk which is loaded on demand.
* Each person page has it's own chunk which contains the data required for that page only, again loaded on demand.
