"use server";
import { prisma } from "@/lib/db";
import { MessageRole, MessageType } from "@/lib/generated/prisma/enums";
import { currentUser } from "@/modules/authentication/actions";
import { revalidatePath } from "next/cache";

interface IcreateChatWithMessage {
  content: string;
  model: string;
  files?: Array<{
    type: string;
    mediaType: string;
    url: string;
    filename?: string;
  }>;
}

export async function createChatWithMessage({
  content,
  model,
  files,
}: IcreateChatWithMessage) {
  try {
    const user = await currentUser();

    if (!user) {
      return { success: false, message: "Unauthorized" };
    }

    const hasFiles = files && files.length > 0;
    const titleSource = content.trim() || (hasFiles ? "Image message" : "");
    const title =
      titleSource.slice(0, 50) + (titleSource.length > 50 ? "..." : "");
    const messageParts = [
      ...(content.trim() ? [{ type: "text", text: content.trim() }] : []),
      ...(files ?? []),
    ];

    const chat = await prisma.chat.create({
      data: {
        title,
        model,
        userId: user?.id,
        messages: {
          create: {
            content: JSON.stringify(messageParts),
            model,
            messageRole: MessageRole.USER,
            messageType: MessageType.NORMAL,
          },
        },
      },
      include: {
        messages: true,
      },
    });

    revalidatePath("/", "page");
    return { success: true, data: chat };
  } catch (error) {
    console.error("Error creating chat:", error);
    return { success: false, message: "Failed to create chat" };
  }
}

export async function getAllChats() {
  try {
    const user = await currentUser();

    if (!user) {
      return { success: false, message: "Unauthorized" };
    }

    const chats = await prisma.chat.findMany({
      where: { userId: user?.id },
      include: { messages: true },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: chats };
  } catch (error) {
    console.error("Error fetching chats:", error);
    return { success: false, message: "Failed to fetch chats" };
  }
}

export async function getChatById(chatId: string) {
  try {
    const user = await currentUser();

    if (!user) {
      return { success: false, message: "Unauthorized" };
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId, userId: user?.id },
      include: { messages: true },
    });

    return { success: true, data: chat };
  } catch (error) {
    console.error("Error fetching chat:", error);
    return { success: false, message: "Failed to fetch chat" };
  }
}

export async function deleteChat(chatId: string) {
  try {
    const user = await currentUser();

    if (!user) {
      return { success: false, message: "Unauthorized" };
    }

    const chat = await prisma.chat.delete({
      where: { id: chatId, userId: user?.id },
    });

    if (!chat) {
      return {
        success: false,
        message: "Chat not found",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting chat:", error);
    return { success: false, message: "Failed to delete chat" };
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "voyage-3-lite",
      input: text,
    }),
  });

  console.log("Voyage AI status:", response.status);
  const data = await response.json();
  console.log("Voyage AI response:", JSON.stringify(data).slice(0, 200));

  return data.data[0].embedding;
}

function chunkText(text: string, chunkSize = 400): string[] {
  const words = text.split(" ");
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words
      .slice(i, i + chunkSize)
      .join(" ")
      .trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

const MAX_INLINE_PDF_CONTEXT_LENGTH = 12000;

async function extractPdfText(arrayBuffer: ArrayBuffer) {
  const { definePDFJSModule, getDocumentProxy } = await import("unpdf");

  await definePDFJSModule(() => import("unpdf/pdfjs"));

  const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
  console.log("PDF - pages:", pdf.numPages);

  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    const text = content.items
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const maybeItem = item as { str?: unknown };
        return typeof maybeItem.str === "string" ? maybeItem.str : "";
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    console.log(`PDF - page ${pageNumber} text length:`, text.length);
    if (text) pageTexts.push(text);

    page.cleanup?.();
  }

  return {
    pdf,
    text: pageTexts.join("\n\n").replace(/\r\n/g, "\n").trim(),
  };
}

function buildPdfContextMessage(question: string, name: string, text: string) {
  const trimmedQuestion =
    question.trim() || "I've uploaded a PDF, please help me with it.";
  const excerpt =
    text.length > MAX_INLINE_PDF_CONTEXT_LENGTH
      ? `${text.slice(0, MAX_INLINE_PDF_CONTEXT_LENGTH)}\n\n[PDF text truncated for this first response. Ask follow-up questions for more detail.]`
      : text;

  return `${trimmedQuestion}\n\nPDF context from "${name}":\n\n${excerpt}`;
}

async function updateLatestUserMessageWithPdfContext({
  chatId,
  question,
  name,
  text,
}: {
  chatId: string;
  question: string;
  name: string;
  text: string;
}) {
  const latestUserMessage = await prisma.message.findFirst({
    where: {
      chatId,
      messageRole: MessageRole.USER,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!latestUserMessage) return;

  await prisma.message.update({
    where: { id: latestUserMessage.id },
    data: {
      content: JSON.stringify([
        {
          type: "text",
          text: buildPdfContextMessage(question, name, text),
        },
      ]),
    },
  });
}

async function createAssistantPdfErrorMessage(chatId: string, message: string) {
  await prisma.message.create({
    data: {
      chatId,
      content: JSON.stringify([{ type: "text", text: message }]),
      messageRole: MessageRole.ASSISTANT,
      messageType: MessageType.ERROR,
    },
  });
}

export async function processPDF(
  chatId: string,
  url: string,
  name: string,
  question = "",
  preExtractedText = "",
) {
  try {
    const user = await currentUser();
    if (!user) return { success: false, message: "Unauthorized" };

    let text = preExtractedText.trim();

    if (!text) {
      console.log("PDF - fetching:", url);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        return {
          success: false,
          message: `Failed to fetch PDF (${res.status})`,
        };
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType && !contentType.includes("pdf")) {
        console.warn("PDF - unexpected content-type:", contentType);
      }

      const arrayBuffer = await res.arrayBuffer();
      console.log("PDF - buffer size:", arrayBuffer.byteLength);

    ({ text } = await extractPdfText(arrayBuffer));
    }

    console.log("PDF - text length:", text?.length);

    if (!text?.trim()) {
      const failureMessage =
        "I can’t read this PDF because it looks like a scanned or image-only file, and no selectable text could be extracted. Please upload a searchable PDF or a clearer version of the document.";
      await createAssistantPdfErrorMessage(chatId, failureMessage);
      return { success: false, message: failureMessage };
    }

    await updateLatestUserMessageWithPdfContext({
      chatId,
      question,
      name,
      text,
    });

    const chunks = chunkText(text);
    console.log("PDF - chunks:", chunks.length);

    let doc: { id: string } | null = null;
    try {
      doc = await prisma.document.create({
        data: { chatId, url, name },
      });
      console.log("PDF - document created:", doc.id);

      for (let i = 0; i < chunks.length; i++) {
        console.log(`PDF - embedding ${i + 1}/${chunks.length}`);
        const embedding = await generateEmbedding(chunks[i]);
        await prisma.$executeRaw`
          INSERT INTO document_chunk (id, "documentId", content, embedding)
          VALUES (${crypto.randomUUID()}, ${doc.id}, ${chunks[i]}, ${JSON.stringify(embedding)}::vector)
        `;
      }

      const inserted = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM document_chunk WHERE "documentId" = ${doc.id}
      `;
      console.log("PDF - chunks inserted:", inserted[0]?.count);
    } catch (indexError) {
      console.warn("PDF indexing skipped:", indexError);
    }

    return { success: true, data: doc, textLength: text.length };
  } catch (error) {
    console.error("Error processing PDF:", error);
    return { success: false, message: "Failed to process PDF" };
  }
}
export async function searchSimilarChunks(chatId: string, question: string) {
  try {
    const embedding = await generateEmbedding(question);

    console.log("Searching for chatId:", chatId);
    console.log("Embedding length:", embedding.length);

    // first check if any chunks exist for this chat
    const count = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM document_chunk dc
      JOIN document d ON dc."documentId" = d.id
      WHERE d."chatId" = ${chatId}
    `;
    console.log("Total chunks for this chat:", count[0]?.count);

    const chunks = await prisma.$queryRaw<
      { content: string; similarity: number }[]
    >`
      SELECT dc.content,
             1 - (dc.embedding <=> ${JSON.stringify(embedding)}::vector) as similarity
      FROM document_chunk dc
      JOIN document d ON dc."documentId" = d.id
      WHERE d."chatId" = ${chatId}
      ORDER BY similarity DESC
      LIMIT 5
    `;

    console.log("Chunks found:", chunks.length);

    if (chunks.length > 0) {
      return { success: true, data: chunks };
    }

    const fallbackChunks = await prisma.$queryRaw<{ content: string }[]>`
      SELECT dc.content
      FROM document_chunk dc
      JOIN document d ON dc."documentId" = d.id
      WHERE d."chatId" = ${chatId}
      ORDER BY d."createdAt" DESC, dc.id DESC
      LIMIT 20
    `;

    if (fallbackChunks.length > 0) {
      console.log("Fallback chunks found:", fallbackChunks.length);
      return {
        success: true,
        data: fallbackChunks.map((chunk) => ({
          content: chunk.content,
          similarity: 1,
        })),
      };
    }

    return { success: true, data: chunks };
  } catch (error) {
    console.error("Error searching chunks:", error);
    try {
      const fallbackChunks = await prisma.$queryRaw<{ content: string }[]>`
        SELECT dc.content
        FROM document_chunk dc
        JOIN document d ON dc."documentId" = d.id
        WHERE d."chatId" = ${chatId}
        ORDER BY d."createdAt" DESC, dc.id DESC
        LIMIT 20
      `;

      return {
        success: true,
        data: fallbackChunks.map((chunk) => ({
          content: chunk.content,
          similarity: 1,
        })),
      };
    } catch {
      return { success: false, data: [] };
    }
  }
}

export async function getChatDocuments(chatId: string) {
  try {
    const user = await currentUser();
    if (!user) return { success: false, message: "Unauthorized" };

    const documents = await prisma.document.findMany({
      where: { chatId },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: documents };
  } catch {
    return { success: false, message: "Failed to fetch documents" };
  }
}
