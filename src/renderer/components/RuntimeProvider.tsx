import React, { ReactNode } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "../hooks/useChatRuntime";

type RuntimeProviderProps = {
    children: ReactNode;
};

export function RuntimeProvider({ children }: RuntimeProviderProps) {
    const runtime = useChatRuntime();
    return (
        <AssistantRuntimeProvider runtime={runtime}>
            {children}
        </AssistantRuntimeProvider>
    )
}