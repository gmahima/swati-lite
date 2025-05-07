import type { FC } from "react";
import {
  ThreadListItemPrimitive,
  ThreadListPrimitive,
} from "@assistant-ui/react";
import { ArchiveIcon, PlusIcon } from "lucide-react";

import { Button } from "@ui/button";
import { TooltipIconButton } from "./tooltip-icon-button";

export const ThreadList: FC = () => {
  return (
    <ThreadListPrimitive.Root className="flex h-full flex-col">
      <div className="flex flex-col gap-2 p-4">
        <ThreadListNew />
        <ThreadListItems />
      </div>
    </ThreadListPrimitive.Root>
  );
};

const ThreadListNew: FC = () => {
  return (
    <ThreadListPrimitive.New asChild>
      <Button 
        className="data-[active]:bg-muted hover:bg-muted flex items-center justify-start gap-2 rounded-lg px-3 py-2 text-start transition-colors" 
        variant="ghost"
      >
        <PlusIcon className="size-4" />
        <span className="font-medium">New Thread</span>
      </Button>
    </ThreadListPrimitive.New>
  );
};

const ThreadListItems: FC = () => {
  return (
    <div className="flex-1 overflow-y-auto">
      <ThreadListPrimitive.Items components={{ ThreadListItem }} />
    </div>
  );
};

const ThreadListItem: FC = () => {
  return (
    <ThreadListItemPrimitive.Root className="group data-[active]:bg-muted hover:bg-muted focus-visible:bg-muted focus-visible:ring-ring flex items-center gap-2 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2">
      <ThreadListItemPrimitive.Trigger className="flex-grow px-3 py-2 text-start">
        <ThreadListItemTitle />
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemArchive />
    </ThreadListItemPrimitive.Root>
  );
};

const ThreadListItemTitle: FC = () => {
  return (
    <p className="text-sm font-medium line-clamp-1">
      <ThreadListItemPrimitive.Title fallback="New Chat" />
    </p>
  );
};

const ThreadListItemArchive: FC = () => {
  return (
    <ThreadListItemPrimitive.Archive asChild>
      <TooltipIconButton
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground ml-auto mr-2 size-4 p-0 transition-opacity"
        variant="ghost"
        tooltip="Archive thread"
      >
        <ArchiveIcon />
      </TooltipIconButton>
    </ThreadListItemPrimitive.Archive>
  );
};
