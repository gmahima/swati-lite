const rules = require('./webpack.rules');
const plugins = require('./webpack.plugins');

// Add CSS rule
rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }, { loader: 'postcss-loader' }],
});

// Configure webpack to handle Monaco Editor properly
module.exports = {
  // Put your normal webpack config below here
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    fallback: {
      path: false,
      fs: false,
    },
  },
  // The Monaco Editor requires special handling
  ignoreWarnings: [
    {
      // Ignore warnings about missing source maps
      module: /@monaco-editor/,
    },
  ],
};
