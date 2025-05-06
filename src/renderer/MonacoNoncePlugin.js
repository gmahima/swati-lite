/**
 * A plugin to help inject CSP nonces into Monaco editor components
 * This helps maintain security with Content-Security-Policy
 */
export class MonacoNoncePlugin {
  constructor() {
    // Get nonces from the window.cspNonces (getter properties)
    this.getScriptNonce = () => window.cspNonces?.scriptNonce || '';
    this.getStyleNonce = () => window.cspNonces?.styleNonce || '';
  }

  /**
   * Apply nonce attributes to dynamically created scripts and styles
   */
  applyNoncesToDynamicElements() {
    // This may already be handled by the preload script's mutation observer,
    // but we'll keep it here for extra safety
    
    // Set up a mutation observer specific for Monaco components
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeName === 'SCRIPT' && !node.nonce) {
              const scriptNonce = this.getScriptNonce();
              if (scriptNonce) {
                node.setAttribute('nonce', scriptNonce);
              }
            }
            if (node.nodeName === 'STYLE' && !node.nonce) {
              const styleNonce = this.getStyleNonce();
              if (styleNonce) {
                node.setAttribute('nonce', styleNonce);
              }
            }
          });
        }
      });
    });

    // Start observing the monaco-editor container
    const editorContainers = document.querySelectorAll('.monaco-editor');
    editorContainers.forEach(container => {
      observer.observe(container, {
        childList: true,
        subtree: true
      });
    });

    return () => observer.disconnect(); // Return cleanup function
  }

  /**
   * To be used before Monaco mounts
   */
  beforeEditorMount(monaco) {
    console.log('Monaco CSP Nonce Plugin initialized');
    
    // Try to inject nonces into Monaco's loader script
    if (monaco && monaco.editor && monaco.editor._themableHelper) {
      const helper = monaco.editor._themableHelper;
      
      // Override or patch helper methods that create elements
      const originalCreateStyleSheet = helper._createStyleSheet;
      if (originalCreateStyleSheet) {
        helper._createStyleSheet = (...args) => {
          const styleSheet = originalCreateStyleSheet.apply(helper, args);
          const styleNonce = this.getStyleNonce();
          if (styleSheet && styleNonce) {
            styleSheet.setAttribute('nonce', styleNonce);
          }
          return styleSheet;
        };
      }
    }
  }

  /**
   * To be used after Monaco mounts
   */
  afterEditorMount(editor, monaco) {
    // Apply nonces to dynamic elements
    const cleanup = this.applyNoncesToDynamicElements();
    
    // Store cleanup function to be called when editor unmounts
    editor._nonceCleanup = cleanup;
    
    // Attempt to manually set nonces on existing Monaco elements
    const container = editor.getDomNode();
    if (container) {
      const scriptNonce = this.getScriptNonce();
      const styleNonce = this.getStyleNonce();
      
      // Apply to scripts
      container.querySelectorAll('script').forEach(script => {
        if (!script.nonce && scriptNonce) {
          script.setAttribute('nonce', scriptNonce);
        }
      });
      
      // Apply to styles
      container.querySelectorAll('style').forEach(style => {
        if (!style.nonce && styleNonce) {
          style.setAttribute('nonce', styleNonce);
        }
      });
    }
  }
}

// Create a singleton instance
const noncePlugin = new MonacoNoncePlugin();

export default noncePlugin; 