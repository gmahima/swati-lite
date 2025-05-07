const rules = require('./webpack.rules');
const plugins = require('./webpack.plugins');
const path = require('path');

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
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@ui': path.resolve(__dirname, 'src/renderer/components/ui'),
      '@components': path.resolve(__dirname, 'src/renderer/components'),
      '@lib': path.resolve(__dirname, 'src/lib'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
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
