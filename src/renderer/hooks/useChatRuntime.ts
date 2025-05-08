import { useEffect, useRef } from "react";
const {ipcRenderer} = window.require("electron");
type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};
type ChatListeners = {
  onToken?: (token: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
};
export const useChatRuntime = () => {
  const listenersRef = useRef<ChatListeners>({});
  useEffect(() => {
    function onToken(_: any, token: string) {
      listenersRef.current.onToken?.(token);
    }
    function onDone() {
      listenersRef.current.onDone?.();
    }
    function onError(_: any, error: string) {
      listenersRef.current.onError?.(error);
    }

    ipcRenderer.on("chat:token", onToken);
    ipcRenderer.on("chat:done", onDone);
    ipcRenderer.on("chat:error", onError);

    return () => {
      ipcRenderer.removeListener("chat:token", onToken);
      ipcRenderer.removeListener("chat:done", onDone);
      ipcRenderer.removeListener("chat:error", onError);
    };
  }, []);
  function sendMessage(messages: ChatMessage[], listeners: ChatListeners) {
    listenersRef.current = listeners;
    ipcRenderer.send("chat:stream", messages);
  }

  return {sendMessage};
};
