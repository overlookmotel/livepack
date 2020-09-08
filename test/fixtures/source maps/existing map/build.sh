# Script to transpile `src.js`
npx babel src.js -o inline/index.js --source-maps inline --presets=@babel/preset-env
npx babel src.js -o external/index.js --source-maps --presets=@babel/preset-env
