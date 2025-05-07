import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function handleChat(messages: Message[]) {
  try {
    const model = new ChatOpenAI({
      streaming: true,
      callbacks: [{
        handleLLMNewToken(token) {
          // Return each token as it comes
          return token;
        },
      }],
    });

    // Convert messages to Langchain format
    const langchainMessages = messages.map(msg => {
      switch (msg.role) {
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        case 'system':
          return new SystemMessage(msg.content);
        default:
          throw new Error(`Unknown message role: ${msg.role}`);
      }
    });

    const response = await model.invoke(langchainMessages);
    return response.content;
  } catch (error) {
    console.error('Error in chat handler:', error);
    throw error;
  }
} 