"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import UserButton from "@/modules/authentication/components/user-button";
import { PlusIcon, SearchIcon, EllipsisIcon, Trash } from "lucide-react";
import Link from "next/link";
import { useState, useMemo } from "react";
import { isToday, isYesterday, isWithinInterval, subDays } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname } from "next/navigation";
import DeleteChatModel from "@/components/delete-chat-model";
import { useGetChats } from "../hooks/use-chats";
import { Spinner } from "@/components/ui/spinner";

type ChatItemType = {
  id: string;
  title: string;
  createdAt: string | Date;
  messages?: Array<{ content?: string }>;
};

type ChatGroups = {
  today: ChatItemType[];
  yesterday: ChatItemType[];
  lastWeek: ChatItemType[];
  older: ChatItemType[];
};

function groupChatsByDate(chats: ChatItemType[]): ChatGroups {
  const groups: ChatGroups = {
    today: [],
    yesterday: [],
    lastWeek: [],
    older: [],
  };
  const now = new Date();

  chats.forEach((chat) => {
    try {
      const chatDate = chat.createdAt;
      const date = typeof chatDate === "string" ? new Date(chatDate) : chatDate;

      console.log(
        "Processing chat:",
        chat.id,
        "Date:",
        date,
        "createdAt:",
        chatDate,
      );

      if (isToday(date)) {
        groups.today.push(chat);
      } else if (isYesterday(date)) {
        groups.yesterday.push(chat);
      } else if (isWithinInterval(date, { start: subDays(now, 7), end: now })) {
        groups.lastWeek.push(chat);
      } else {
        groups.older.push(chat);
      }
    } catch (error) {
      console.error("Error processing chat date:", error, chat);
      groups.older.push(chat);
    }
  });

  return groups;
}

const DATE_GROUPS: Array<{ key: keyof ChatGroups; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "lastWeek", label: "Last 7 Days" },
  { key: "older", label: "Older" },
];

function ChatItem({
  chat,
  isActive,
  onDelete,
}: {
  chat: ChatItemType;
  isActive: boolean;
  onDelete: (e: React.MouseEvent, chatId: string) => void;
}) {
  return (
    <Link
      href={`/chat/${chat.id}`}
      className={cn(
        "flex items-center justify-between rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
        isActive && "bg-sidebar-accent",
      )}
    >
      <span className="truncate flex-1">{chat.title}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 hover:bg-sidebar-accent-foreground/10"
            onClick={(e) => e.preventDefault()}
          >
            <EllipsisIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-red-500 cursor-pointer"
            onClick={(e) => onDelete(e, chat.id)}
          >
            <Trash className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Link>
  );
}

function ChatGroup({
  label,
  chats,
  activeChatId,
  onDelete,
}: {
  label: string;
  chats: ChatItemType[];
  activeChatId: string | null;
  onDelete: (e: React.MouseEvent, chatId: string) => void;
}) {
  if (chats.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="mb-2 px-2 text-xs font-semibold text-muted-foreground">
        {label}
      </div>
      {chats.map((chat) => (
        <ChatItem
          key={chat.id}
          chat={chat}
          isActive={chat.id === activeChatId}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

const ChatSidebar = ({ user }: { user: { email: string } }) => {
  const { data: chats = [], isPending } = useGetChats() as {
    data?: ChatItemType[];
    isPending: boolean;
  };

  console.log("Fetched chats:", chats);
  const pathname = usePathname();
  const activeChatId = pathname?.startsWith("/chat/")
    ? pathname.split("/")[2]
    : null;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const filteredChats = useMemo(() => {
    if (!searchQuery) return chats;
    const query = searchQuery.toLowerCase();

    return chats.filter(
      (chat: ChatItemType) =>
        chat.title?.toLowerCase().includes(query) ||
        chat.messages?.some((msg) =>
          msg.content?.toLowerCase().includes(query),
        ),
    );
  }, [searchQuery, chats]);

  const groupedChats = useMemo(() => {
    const result = groupChatsByDate(filteredChats);
    console.log("Filtered chats:", filteredChats);
    console.log("Grouped chats:", result);
    return result;
  }, [filteredChats]);

  const handleDelete = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedChatId(chatId);
    setIsModalOpen(true);
  };

  if (isPending) {
    return <Spinner className="m-auto" />;
  }
  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-sidebar">
      {/* Header */}
      <div className="flex items-center border-b border-sidebar-border px-4 py-3">
        <Link href="/">
          <span className="text-2xl font-bold text-foreground">
            Devchat<span className="text-2xl text-primary">AI</span>
          </span>
        </Link>
      </div>

      <div className="p-4">
        <Button asChild className="w-full">
          <Link href="/">
            <PlusIcon className="h-4 w-4" />
            New Chat
          </Link>
        </Button>
      </div>

      <div className="px-4 pb-4">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search your threads..."
            className="pl-9 pr-8 bg-sidebar-accent border-sidebar-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {filteredChats.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            {searchQuery ? "No chats found" : "No chats yet"}
          </div>
        ) : (
          DATE_GROUPS.map((group) => (
            <ChatGroup
              key={group.key}
              label={group.label}
              chats={groupedChats[group.key]}
              activeChatId={activeChatId}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Footer */}

      <div className="p-4 flex items-center gap-3 border-t border-sidebar-border">
        <UserButton user={user} />
        <span className="flex-1 text-sm text-sidebar-foreground truncate">
          {user.email}
        </span>
      </div>

      <DeleteChatModel
        chatId={selectedChatId ?? ""}
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
      />
    </div>
  );
};

export default ChatSidebar;
