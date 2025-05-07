import { useLocalRuntime } from '@assistant-ui/react';
import { chatModelAdapter } from './chat-model-adapter';

export function useAssistantRuntime() {
  return useLocalRuntime(chatModelAdapter);
} 