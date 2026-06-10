"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useGetChatById } from "../../hooks/use-chats";
import { useAIModels } from "../../hooks/use-ai-models";
import { Spinner } from "@/components/ui/spinner";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";

import { ModelSelector } from "../chat-view/model-selector";
import { ModelRequiredModal } from "../model-required-modal";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { FileText } from "lucide-react";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { toast } from "sonner";
import Image from "next/image";


// type DBMessage = {
//   id: string;
//   content: string;
//   messageRole: "USER" | "ASSISTANT";
//   createdAt: string | Date;
// };

type MessagePartShape = {
  type: string;
  text?: string;
  url?: string;
  filename?: string;
  mediaType?: string;
  [key: string]: unknown;
};

type ParsedUIMessage = UIMessage & {
  createdAt: string | Date;
};

type ChatModel = {
  id: string;
};

function parseMessageToUI(msg: {
  id: string;
  content: string;
  messageRole: "USER" | "ASSISTANT";
  createdAt: string | Date;
}): ParsedUIMessage {
  try {
    const parts = JSON.parse(msg.content);
    return {
      id: msg.id,
      role: msg.messageRole.toLowerCase() as ParsedUIMessage["role"],
      parts: Array.isArray(parts)
        ? parts
        : [{ type: "text", text: msg.content }],
      createdAt: msg.createdAt,
    };
  } catch {
    return {
      id: msg.id,
      role: msg.messageRole.toLowerCase() as ParsedUIMessage["role"],
      parts: [{ type: "text", text: msg.content }],
      createdAt: msg.createdAt,
    };
  }
}

function MessagePart({
  part,
  messageId,
  partIndex,
  role,
  isStreaming,
}: {
  part: MessagePartShape;
  messageId: string;
  partIndex: number;
  role: UIMessage["role"];
  isStreaming: boolean;
}) {
  const key = `${messageId}-${partIndex}`;

  if (part.type === "text") {
    return (
      <Message from={role} key={key}>
        <MessageContent>
          <MessageResponse>{part.text}</MessageResponse>
        </MessageContent>
      </Message>
    );
  }

  if (part.type === "reasoning") {
    return (
      <Reasoning
        className="max-w-2xl px-4 py-4 border border-muted rounded-md bg-muted/50"
        key={key}
        isStreaming={isStreaming}
      >
        <ReasoningTrigger />
        <ReasoningContent className="mt-2 italic font-light text-muted-foreground">
          {part.text ?? ""}
        </ReasoningContent>
      </Reasoning>
    );
  }

  if (part.type === "file" && typeof part.url === "string") {
    const isPdf =
      part.mediaType === "application/pdf" ||
      part.filename?.toLowerCase().endsWith(".pdf") ||
      part.url.toLowerCase().includes(".pdf");

    if (isPdf) {
      return (
        <div
          className="max-w-2xl rounded-xl border border-border bg-muted/40 p-3"
          key={key}
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {part.filename || "PDF document"}
              </div>
              <div className="text-xs text-muted-foreground">
                PDF attachment
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className="max-w-2xl overflow-hidden rounded-xl border border-border bg-muted/40 p-2"
        key={key}
      >
        <Image
          alt={part.filename || "Uploaded image"}
          className="max-h-112 w-full rounded-lg object-contain"
          src={part.url}
        />
      </div>
    );
  }

  if (part.type === "step-start" && partIndex > 0) {
    return (
      <div key={key} className="my-4 text-gray-500">
        <hr className="border-gray-300" />
      </div>
    );
  }

  return null;
}

export const MessageViewWithForm = ({ chatId }: { chatId: string }) => {
  const { data: chatData, isPending } = useGetChatById(chatId);

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  if (!chatData?.success || !chatData?.data) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Chat Not Found
      </div>
    );
  }

  const rawMessages = chatData.data.messages ?? [];
  const initialMessages: ParsedUIMessage[] = rawMessages
    .filter((m) => m?.id && m?.content?.trim())
    .map(parseMessageToUI);

  return (
    <ChatView
      chatId={chatId}
      initialMessages={initialMessages}
      initialModel={chatData.data.model ?? undefined}
    />
  );
};

const ChatView = ({
  chatId,
  initialMessages,
  initialModel,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  initialModel?: string;
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldAutoTrigger = searchParams.get("autoTrigger") === "true";
  const hasAutoTriggered = useRef(false);

  const [selectedModel, setSelectedModel] = useState<string | undefined>(
    initialModel ?? undefined,
  );
  const [showModelRequiredModal, setShowModelRequiredModal] = useState(false);
  const { data: modelsData, isPending: isModelLoading } = useAIModels();
  const fallbackModels = useMemo(
    () =>
      ((modelsData?.models ?? []) as ChatModel[])
        .map((model) => model.id)
        .filter((id) => id && id !== selectedModel)
        .slice(0, 3),
    [modelsData?.models, selectedModel],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
      }),
    [],
  );

  const { messages, status, sendMessage, regenerate, stop, error } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    onError: (err) => {
      console.log("Chat error", err);
      toast.error(err.message);
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!shouldAutoTrigger) return;
    if (hasAutoTriggered.current) return;
    if (!selectedModel) return;
    if (messages.length === 0) return;
    if (messages.at(-1)?.role !== "user") return;

    hasAutoTriggered.current = true;

    regenerate({
      body: {
        chatId,
        model: selectedModel,
        fallbackModels,
        skipUserMessage: true,
      },
    }).catch((err) => {
      console.error("Auto-trigger failed:", err);
      toast.error("Failed to generate response");
    });

    const params = new URLSearchParams(searchParams.toString());
    params.delete("autoTrigger");
    const query = params.toString();
    router.replace(`/chat/${chatId}${query ? `?${query}` : ""}`, {
      scroll: false,
    });
  }, [
    shouldAutoTrigger,
    selectedModel,
    messages,
    chatId,
    regenerate,
    router,
    searchParams,
    fallbackModels,
  ]);

  const handleSubmit = async (
    message: PromptInputMessage,
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const text = message.text?.trim();
    if (!text) return;
    if (!selectedModel) {
      setShowModelRequiredModal(true);
      return;
    }

    if (isBusy) return;

    try {
      await sendMessage(
        {
          text,
        },
        {
          body: {
            chatId,
            model: selectedModel,
            fallbackModels,
            skipUserMessage: false,
          },
        },
      );
    } catch (error) {
      console.error("Send message failed:", error);
      toast.error("Failed to send message");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 relative size-full h-[calc(100vh-4rem)]">
      <div className="flex flex-col h-full">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState
                title="Start the conversation"
                description="Send a message to get started."
              />
            ) : (
              messages.map((message) => (
                <Fragment key={message.id}>
                  {message.parts.map((part, i) => (
                    <MessagePart
                      key={`${message.id}-${i}`}
                      part={part as MessagePartShape}
                      messageId={message.id}
                      partIndex={i}
                      role={message.role}
                      isStreaming={
                        isBusy &&
                        message === messages.at(-1) &&
                        i === message.parts.length - 1
                      }
                    />
                  ))}
                </Fragment>
              ))
            )}

            {status === "submitted" && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Spinner />
                <span className="text-sm">AI is thinking...</span>
              </div>
            )}

            {error && (
              <div className="text-sm text-destructive">
                {error.message || "Something went wrong."}
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <PromptInput onSubmit={handleSubmit} className="mt-4">
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Type your message..."
              disabled={isBusy}
            />
          </PromptInputBody>

          <PromptInputFooter>
            <PromptInputTools className="flex items-center justify-between gap-2 w-full">
              <div className="flex-1">
                {isModelLoading ? (
                  <Spinner />
                ) : (
                  <ModelSelector
                    models={modelsData?.models ?? []}
                    selectedModelId={selectedModel}
                    onModelSelect={setSelectedModel}
                    className=""
                  />
                )}
              </div>
              <PromptInputSubmit status={status} onStop={stop} />
            </PromptInputTools>
          </PromptInputFooter>
        </PromptInput>
        <ModelRequiredModal
          open={showModelRequiredModal}
          onOpenChange={setShowModelRequiredModal}
        />
      </div>
    </div>
  );
};
