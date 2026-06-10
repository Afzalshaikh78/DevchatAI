import {
  convertToModelMessages,
  generateText,
  streamText,
  createIdGenerator,
  type UIMessage,
} from "ai";
import { CHAT_SYSTEM_PROMPT } from "@/lib/prompt";
import { prisma } from "@/lib/db";
import { MessageRole } from "@/lib/generated/prisma/enums";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { NextRequest } from "next/server";
import { searchSimilarChunks } from "@/modules/chat/actions";

const openRouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const generateMessageId = createIdGenerator({ prefix: "msg", size: 16 });

function partsToJSON(message: { parts?: unknown; content?: string }) {
  if (Array.isArray(message.parts)) {
    return JSON.stringify(message.parts);
  }
  return JSON.stringify([{ type: "text", text: message.content ?? "" }]);
}

const REASONING_MODELS = [
  "deepseek/deepseek-r1",
  "deepseek/deepseek-r1-zero",
  "qwen/qwq-32b",
  "openai/o1",
  "openai/o1-mini",
  "openai/o3-mini",
];

function supportsReasoning(model: string) {
  return REASONING_MODELS.some((m) => model.includes(m.split("/")[1]));
}

function isRateLimitedError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { statusCode?: number; message?: string };
  const message = (maybeError.message ?? "").toLowerCase();
  return (
    maybeError.statusCode === 429 ||
    message.includes("rate-limit") ||
    message.includes("rate limited") ||
    message.includes("too many requests")
  );
}

function isRetryableModelError(error: unknown) {
  if (isRateLimitedError(error)) return true;
  if (!error || typeof error !== "object") return false;
  const maybeError = error as {
    statusCode?: number;
    code?: number;
    message?: string;
  };
  const message = (maybeError.message ?? "").toLowerCase();
  return (
    maybeError.statusCode === 402 ||
    maybeError.statusCode === 403 ||
    maybeError.code === 402 ||
    maybeError.code === 403 ||
    message.includes("insufficient credit") ||
    message.includes("insufficient credits") ||
    message.includes("never purchased credits") ||
    message.includes("quota") ||
    message.includes("payment required") ||
    message.includes("balance")
  );
}

type ChatRequestMessage = UIMessage & {
  content?: string;
};

function getTextFromMessage(message?: {
  content?: string;
  parts?: unknown;
}) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.parts)) return "";

  return message.parts
    .map((part) => {
      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        "text" in part &&
        part.type === "text" &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

async function buildStream({
  model,
  messages,
  ragContext,
}: {
  model: string;
  messages: ChatRequestMessage[];
  ragContext?: string;
}) {
  const systemPrompt = ragContext
    ? `${CHAT_SYSTEM_PROMPT}\n\nThe user has uploaded a document. Use the following context to answer their question. If the answer isn't in the context, say so.\n\n---\n${ragContext}\n---`
    : CHAT_SYSTEM_PROMPT;

  return streamText({
    model: openRouter.chat(model),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    ...(supportsReasoning(model) && {
      providerOptions: {
        openrouter: { reasoning: { effort: "high" } },
      },
    }),
    experimental_telemetry: { isEnabled: false },
  });
}

async function probeModelAvailability({
  model,
  messages,
}: {
  model: string;
  messages: ChatRequestMessage[];
}) {
  await generateText({
    model: openRouter.chat(model),
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 1,
    experimental_telemetry: { isEnabled: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const {
      chatId,
      messages,
      model,
      fallbackModels,
      skipUserMessage,
    }: {
      chatId: string;
      messages: ChatRequestMessage[];
      model: string;
      fallbackModels?: string[];
      skipUserMessage?: boolean;
    } = await req.json();

    if (!chatId || !messages || !model) {
      return Response.json(
        { error: "Missing required fields: chatId, messages, or model" },
        { status: 400 },
      );
    }

    if (messages.length === 0) {
      return Response.json(
        { error: "Messages array cannot be empty" },
        { status: 400 },
      );
    }

    // RAG context injection
    let ragContext: string | undefined;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const userQuestion = getTextFromMessage(lastUserMsg);
    const searchQuestion =
      userQuestion.split("\n\nPDF context from ")[0]?.trim() ||
      userQuestion.slice(0, 1000);

    console.log("RAG - chatId:", chatId);
    console.log("RAG - userQuestion:", searchQuestion);

    if (searchQuestion && chatId) {
      const ragResult = await searchSimilarChunks(chatId, searchQuestion);
      console.log("RAG - result:", ragResult);
      console.log("RAG - chunks found:", ragResult.data?.length);
      if (ragResult.success && ragResult.data.length > 0) {
        ragContext = ragResult.data.map((c) => c.content).join("\n\n");
        console.log("RAG - context injected, length:", ragContext.length);
      }
    }

    const candidateModels = [
      model,
      ...(fallbackModels ?? []).filter(
        (candidate) => candidate && candidate !== model,
      ),
    ];

    let result: Awaited<ReturnType<typeof buildStream>> | undefined;
    let activeModel = model;
    let lastError: unknown;

    for (const candidate of candidateModels) {
      try {
        await probeModelAvailability({ model: candidate, messages });
        activeModel = candidate;
        result = await buildStream({ model: candidate, messages, ragContext });
        break;
      } catch (error) {
        lastError = error;
        if (!isRetryableModelError(error)) {
          throw error;
        }
      }
    }

    if (!result) {
      console.error("Model initialization error:", lastError);
      return Response.json(
        {
          error:
            "All requested models are currently unavailable. Please try again shortly.",
        },
        { status: 429 },
      );
    }

    result.consumeStream();

    return result.toUIMessageStreamResponse({
      sendReasoning: true,
      originalMessages: messages,
      generateMessageId,
      onError: (error) => {
        console.error("Stream error:", error);
        return `Sorry, I encountered an error: ${
          error instanceof Error ? error.message : "Unknown error"
        }. Please try again or switch to a different model.`;
      },
      onFinish: async ({ responseMessage }) => {
        try {
          const messageToSave: Array<{
            id?: string;
            chatId: string;
            content: string;
            messageRole: MessageRole;
            messageType: "NORMAL";
            model: string;
          }> = [];

          if (!skipUserMessage) {
            const lastUserMsg = [...messages]
              .reverse()
              .find((m) => m.role === "user") as
              | { id?: string; parts?: unknown; content?: string }
              | undefined;

            if (lastUserMsg) {
              messageToSave.push({
                id: lastUserMsg.id,
                chatId,
                content: partsToJSON(lastUserMsg),
                messageRole: MessageRole.USER,
                messageType: "NORMAL",
                model: activeModel,
              });
            }
          }

          if (responseMessage?.parts?.length > 0) {
            messageToSave.push({
              id: responseMessage.id,
              chatId,
              content: partsToJSON(responseMessage),
              messageRole: MessageRole.ASSISTANT,
              messageType: "NORMAL",
              model: activeModel,
            });
          }

          if (messageToSave.length > 0) {
            await prisma.message.createMany({
              data: messageToSave,
              skipDuplicates: true,
            });
          }
        } catch (error) {
          console.error("Error saving messages:", error);
        }
      },
    });
  } catch (error: unknown) {
    console.error("Chat API error:", error);

    if (isRetryableModelError(error)) {
      return Response.json(
        {
          error:
            "This model is currently unavailable. Please try again or switch to a different model.",
        },
        { status: 429 },
      );
    }

    const maybeError = error as { code?: number; message?: string };
    if (maybeError.code === 504 || maybeError.message?.includes("timeout")) {
      return Response.json(
        {
          error:
            "The model timed out. Please try a faster model like google/gemma-3-4b-it:free",
        },
        { status: 504 },
      );
    }

    return Response.json(
      { error: maybeError.message || "Internal server error" },
      { status: 500 },
    );
  }
}
