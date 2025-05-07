import type { ChatModelAdapter, ChatModelRunOptions, ChatModelRunResult, ThreadMessage, ThreadAssistantContentPart } from '@assistant-ui/react';

export const chatModelAdapter: ChatModelAdapter = {
  async run(options: ChatModelRunOptions): Promise<ChatModelRunResult> {
    try {
      // Convert ThreadMessages to simple objects for IPC
      const serializedMessages = options.messages.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: typeof msg.content === 'string' 
          ? msg.content 
          : msg.content
              .filter(c => 'text' in c)
              .map(c => (c as { text: string }).text)
              .join(' ')
      }));

      return new Promise((resolve, reject) => {
        let responseText = '';

        // Listen for streaming tokens
        const tokenHandler = (_event: any, token: string) => {
          responseText += token;
          // You can optionally emit partial updates here
        };

        // Listen for errors
        const errorHandler = (_event: any, error: string) => {
          window.electronAPI.ipcRenderer.removeListener('chat:token', tokenHandler);
          window.electronAPI.ipcRenderer.removeListener('chat:error', errorHandler);
          reject(new Error(error));
        };

        // Set up listeners
        window.electronAPI.ipcRenderer.on('chat:token', tokenHandler);
        window.electronAPI.ipcRenderer.on('chat:error', errorHandler);

        // Start the stream
        window.electronAPI.ipcRenderer.send('chat:stream', serializedMessages);

        // Clean up listeners when done
        window.electronAPI.ipcRenderer.once('chat:done', () => {
          window.electronAPI.ipcRenderer.removeListener('chat:token', tokenHandler);
          window.electronAPI.ipcRenderer.removeListener('chat:error', errorHandler);
          resolve({
            content: [{
              type: 'text',
              text: responseText
            }] as readonly ThreadAssistantContentPart[],
          });
        });
      });
    } catch (error) {
      console.error('Error in chat model adapter:', error);
      throw error;
    }
  },
}; 