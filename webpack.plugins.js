const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = [
  // Enable Monaco Editor webpack plugin with optimized settings
  new MonacoWebpackPlugin({
    // Include only the languages we need
    languages: ['javascript', 'typescript', 'html', 'css', 'json', 'markdown', 'python', 'java'],
    // Disable features we don't need to improve CSP compliance
    features: ['!gotoSymbol', '!quickOutline'],
  }),
]; 