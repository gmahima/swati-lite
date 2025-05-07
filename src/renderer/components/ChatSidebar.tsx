import React, { useState } from "react";
import { Button } from "@ui/button";
import { ChevronLeft, ChevronRight, MessageSquare, Send } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function ChatSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "assistant",
      content: "👋 Hi there! I'm your coding assistant. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");

  const handleSendMessage = () => {
    if (!input.trim()) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // Simulate assistant response after a short delay
    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I'm a simulated response. In a real implementation, this would call an AI API to generate a helpful response.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }, 1000);
  };

  // Handle Enter key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (isCollapsed) {
    return (
      <div className="h-full w-[50px] border-l border-gray-200 flex flex-col items-center py-4">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setIsCollapsed(false)}
          className="h-10 w-10 bg-red-500"
        >
          <MessageSquare size={20} />
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full w-[350px] flex flex-col border-l border-gray-200">
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <h3 className="text-sm font-medium">Assistant</h3>
        <Button 
          variant="ghost" 
          size="sm"
          className="p-1 h-auto"
          onClick={() => setIsCollapsed(true)}
        >
          <ChevronRight size={16} />
        </Button>
      </div>
      
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map((message) => (
          <div 
            key={message.id} 
            className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}
          >
            <div 
              className={`max-w-[85%] rounded-lg p-3 ${
                message.role === "assistant" 
                  ? "bg-gray-100 text-gray-800" 
                  : "bg-blue-600 text-white"
              }`}
            >
              <p className="text-sm">{message.content}</p>
              <div 
                className={`text-xs mt-1 ${
                  message.role === "assistant" ? "text-gray-500" : "text-blue-200"
                }`}
              >
                {message.timestamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="p-3 border-t border-gray-200">
        <div className="flex items-end gap-2">
          <div className="flex-1 border rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-blue-500">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              className="w-full p-2 text-sm outline-none resize-none min-h-[60px] max-h-[150px]"
              rows={2}
            />
          </div>
          <Button 
            size="icon"
            onClick={handleSendMessage}
            disabled={!input.trim()}
            className="h-8 w-8"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
} 