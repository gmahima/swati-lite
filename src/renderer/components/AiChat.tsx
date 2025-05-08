import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  FormEvent,
  ChangeEvent,
  useRef,
} from "react";
import {
  ChatInput,
  ChatMessage,
  ChatMessages,
  ChatSection,
  type Message,
} from "@llamaindex/chat-ui";
import { nanoid } from 'nanoid';
import { useAppContext } from "../contexts/AppContext";

// Create a custom context to handle chat state with our backend
type MessageType = {
  id: string;
  role: "system" | "user" | "assistant" | "data";
  content: string;
};

interface ChatContextType {
  messages: MessageType[];
  input: string;
  isLoading: boolean;
  setInput: (input: string) => void;
  append: (
    message: Omit<MessageType, "id">
  ) => Promise<string | null | undefined>;
  setMessages: (messages: MessageType[]) => void;
  reload?: () => void;
  stop?: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Track all active provider instances for debugging/reference - use regular variable, not useRef
const activeProviderInstances = new Set<string>();

// Create a custom chat provider
export const ChatProvider: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  // Track whether the component is mounted to prevent state updates after unmount
  const isMounted = useRef(true);
  const instanceId = useRef(nanoid(6));
  
  // Add this instance to the tracking set on mount
  useEffect(() => {
    console.log(`[ChatProvider ${instanceId.current}] Mounting, adding to active instances`);
    activeProviderInstances.add(instanceId.current);
    
    // Mark as mounted
    isMounted.current = true;
    
    // Cleanup on unmount
    return () => {
      console.log(`[ChatProvider ${instanceId.current}] Unmounting, removing from active instances`);
      activeProviderInstances.delete(instanceId.current);
      
      // Mark as unmounted to prevent further state updates
      isMounted.current = false;
    };
  }, []);

  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { filePath } = useAppContext();

  // We can use the filePath to add context to our messages
  useEffect(() => {
    if (filePath) {
      // You could add a system message with current file context
      console.log(`AI Chat is aware of current file: ${filePath}`);
    }
  }, [filePath]);

  // Set up one-time IPC listener - but only if we're the primary instance
  useEffect(() => {
    if (!isMounted.current) return;
    
    // Only the first instance should handle events
    const isPrimaryInstance = Array.from(activeProviderInstances)[0] === instanceId.current;
    
    // Skip if we're not the primary instance
    if (!isPrimaryInstance) {
      console.log(`[ChatProvider ${instanceId.current}] Not primary instance, skipping listener setup`);
      return;
    }
    
    console.log(`[ChatProvider ${instanceId.current}] PRIMARY INSTANCE - Setting up listener`);
    
    // Add extra debugging to see if IPC is registered multiple times
    let responseCount = 0;
    
    // Create the handler directly in the effect to avoid stale closures
    const handleChatResponse = (event: any, content: string) => {
      if (!isMounted.current) return; // Safety check
      
      responseCount++;
      console.log(`[ChatProvider ${instanceId.current}] Received response #${responseCount}`);
      
      // Process the response
      const newMessage = {
        id: nanoid(),
        role: "assistant" as const,
        content,
      };
      setMessages(prev => [...prev, newMessage]);
      setIsLoading(false);
    };
    
    // Debug IPC setup
    console.log(`[ChatProvider ${instanceId.current}] About to add IPC listener`);
    
    // Add the event listener
    window.electronAPI.ipcRenderer.on("chat:response", handleChatResponse);
    
    // Clean up on unmount
    return () => {
      console.log(`[ChatProvider ${instanceId.current}] Removing chat response listener on unmount`);
      window.electronAPI.ipcRenderer.removeListener("chat:response", handleChatResponse);
    };
  }, [instanceId]);

  const append = async (message: Omit<MessageType, "id">) => {
    // Skip if we're not mounted anymore
    if (!isMounted.current) return null;
    
    // Only the first instance should handle events 
    const isPrimaryInstance = Array.from(activeProviderInstances)[0] === instanceId.current;
    
    // Skip if we're not the primary instance
    if (!isPrimaryInstance) {
      console.log(`[ChatProvider ${instanceId.current}] Not primary instance, skipping append`);
      return null;
    }
    
    console.log(`[ChatProvider ${instanceId.current}] Appending message:`, message);
    const newMessage = {
      id: nanoid(),
      ...message,
    };

    setMessages(prev => [...prev, newMessage]);

    if (message.role === "user") {
      setIsLoading(true);

      try {
        // Ensure messages is an array before mapping
        let messagesToSend = messages;
        if (!Array.isArray(messagesToSend)) {
          console.error(`[ChatProvider ${instanceId.current}] messages is not an array:`, messages);
          // Use an empty array as fallback
          messagesToSend = [];
        }

        // Add current file context if available
        const contextualMessages = [
          ...messagesToSend.map(msg => ({
            role: msg.role,
            content: msg.content,
          }))
        ];

        // Add file context if available
        if (filePath) {
          contextualMessages.unshift({
            role: "system" as const,
            content: `User is currently viewing file: ${filePath}`
          });
        }

        // Add the user message
        contextualMessages.push({
          role: message.role,
          content: message.content,
        });

        // Send to the backend without request ID
        console.log(`[ChatProvider ${instanceId.current}] Sending message`);
        window.electronAPI.ipcRenderer.send("chat:send", contextualMessages);
      } catch (error) {
        console.error(`[ChatProvider ${instanceId.current}] Error preparing messages:`, error);
        setIsLoading(false);
      }
    }

    return newMessage.id;
  };

  const stop = () => {
    setIsLoading(false);
    // If we had streaming, we would implement a way to stop it here
  };

  const reload = () => {
    // Could implement chat regeneration if needed
  };

  const value = {
    messages,
    input,
    isLoading,
    setInput,
    append,
    setMessages,
    reload,
    stop,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

// Custom hook to use our chat context
export const useCustomChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useCustomChat must be used within a ChatProvider");
  }
  return context;
};

function CustomChatMessages() {
  const {messages, isLoading, append} = useCustomChat();

  return (
    <ChatMessages>
      <ChatMessages.List>
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            message={message}
            isLast={index === messages.length - 1}
            className="items-start"
          >
            <ChatMessage.Avatar>
              {message.role === "assistant" ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white">
                  AI
                </div>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
                  You
                </div>
              )}
            </ChatMessage.Avatar>
            <ChatMessage.Content
              isLoading={isLoading && index === messages.length - 1}
            >
              <ChatMessage.Content.Markdown />
            </ChatMessage.Content>
          </ChatMessage>
        ))}
      </ChatMessages.List>
      {isLoading && messages.length === 0 && (
        <ChatMessages.Loading className="py-6">
          <p className="text-center text-gray-500">Thinking...</p>
        </ChatMessages.Loading>
      )}
      {!isLoading && messages.length === 0 && (
        <ChatMessages.Empty className="py-6">
          <h3 className="text-center text-lg font-medium">
            Welcome to AI Assistant
          </h3>
          <p className="text-center text-gray-500">
            Ask me anything about your project!
          </p>
        </ChatMessages.Empty>
      )}
    </ChatMessages>
  );
}

const AiChat: React.FC = () => {
  return (
    <ChatProvider>
      <div className="h-full flex flex-col">
        <div className="p-2 border-b bg-gray-100">
          <h2 className="text-lg font-medium">AI Assistant</h2>
        </div>
        <CustomChat />
      </div>
    </ChatProvider>
  );
};

function CustomChat() {
  const handler = useCustomChat();
  const {input, setInput, isLoading, append} = handler;
  const { filePath } = useAppContext();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    await append({role: "user", content: input});
    setInput("");
  };

  return (
    <ChatSection handler={handler} className="flex-grow flex flex-col">
      <CustomChatMessages />
      <ChatInput className="border-t p-2">
        <div className="w-full">
          <form
            className="bg-white p-2 rounded flex items-center"
            onSubmit={handleSubmit}
          >
            <input
              type="text"
              placeholder="Ask a question..."
              className="border rounded p-2 flex-grow"
              value={input}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setInput(e.target.value)
              }
              disabled={isLoading}
            />
            <button
              type="submit"
              className="ml-2 bg-blue-500 text-white rounded px-3 py-1"
              disabled={isLoading}
            >
              {isLoading ? "Sending..." : "Send"}
            </button>
          </form>
        </div>
      </ChatInput>
      {filePath && (
        <div className="px-2 py-1 text-xs text-gray-500 border-t">
          Current file: {filePath}
        </div>
      )}
    </ChatSection>
  );
}

export default AiChat;
