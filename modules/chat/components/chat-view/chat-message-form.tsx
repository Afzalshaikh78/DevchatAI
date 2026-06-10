"use client";
import React, { useState, useRef } from "react";
import { Send, Paperclip, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { useAIModels } from "../../hooks/use-ai-models";
import { ModelSelector } from "./model-selector";
import { ModelRequiredModal } from "../model-required-modal";
import { useCreateChat } from "../../hooks/use-chats";
import { useUploadThing } from "@/lib/uploadthing";
import { processPDF } from "@/modules/chat/actions";
import { useRouter } from "next/navigation";
import { definePDFJSModule, extractText, getDocumentProxy } from "unpdf";

type ChatMessageFormProps = {
  initialMessage?: string;
  onMessageChange?: (message: string) => void;
};

export default function ChatMessageForm({
  initialMessage,
  onMessageChange,
}: ChatMessageFormProps) {
  const { data: models, isPending } = useAIModels();
  const [message, setMessage] = useState("");
  const [showModelRequiredModal, setShowModelRequiredModal] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(
    models?.models[0]?.id,
  );
  const [uploadedPDF, setUploadedPDF] = useState<{
    name: string;
    url: string;
    text?: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync, isPending: isChatPending } = useCreateChat();
  const { startUpload } = useUploadThing("pdfUploader");

  const hasContent = Boolean((message || initialMessage || "").trim());
  const router = useRouter();

  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }

    setIsUploading(true);
    try {
      await definePDFJSModule(() => import("unpdf/pdfjs"));
      const arrayBuffer = await file.arrayBuffer();
      let extractedText = "";

      try {
        const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
        const extracted = await extractText(pdf, { mergePages: true });
        extractedText = extracted.text?.trim() ?? "";
      } catch (extractError) {
        console.warn("Client-side PDF extraction failed:", extractError);
      }

      const res = await startUpload([file]);
      if (res?.[0]?.url) {
        setUploadedPDF({
          name: file.name,
          url: res[0].url,
          text: extractedText,
        });
        toast.success("PDF uploaded - it will be used as context");
      }
    } catch (error) {
      console.error("PDF upload failed:", error);
      toast.error("Failed to upload PDF");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (
    e:
      | React.FormEvent<HTMLFormElement>
      | React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    e.preventDefault();
    const currentMessage = (message || initialMessage || "").trim();
    const promptText = currentMessage;
    const model = selectedModel;

    if (!model) {
      setShowModelRequiredModal(true);
      return;
    }

    if (!promptText && !uploadedPDF) return;

    try {
      const pdfFilePart = uploadedPDF
        ? [
            {
              type: "file",
              mediaType: "application/pdf",
              url: uploadedPDF.url,
              filename: uploadedPDF.name,
            },
          ]
        : undefined;

      const result = await mutateAsync({
        content: promptText || "I've uploaded a PDF, please help me with it.",
        model,
        files: pdfFilePart,
      });

      if (result?.success && result.data?.id && uploadedPDF) {
        toast.loading("Processing PDF...", { id: "pdf-processing" });
        const pdfResult = await processPDF(
          result.data.id,
          uploadedPDF.url,
          uploadedPDF.name,
          promptText,
          uploadedPDF.text ?? "",
        );

        if (pdfResult.success) {
          toast.success("PDF ready!", { id: "pdf-processing" });
        } else {
          toast.error("PDF processing failed: " + pdfResult.message, {
            id: "pdf-processing",
          });
        }
        setUploadedPDF(null);
      }

      setMessage("");
      onMessageChange?.("");

      router.push(`/chat/${result.data.id}?autoTrigger=true`);
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-6">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative rounded-2xl border border-border shadow-sm transition-all">
          <Textarea
            value={message || initialMessage || ""}
            onChange={(e) => {
              setMessage(e.target.value);
              onMessageChange?.("");
            }}
            placeholder="Type your message here..."
            className="min-h-15 max-h-50 resize-none border-0 bg-transparent px-4 py-3 text-base focus-visible:ring-0 focus-visible:ring-offset-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />

          <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
            <div className="flex items-center gap-2">
              {isPending ? (
                <Spinner />
              ) : (
                <ModelSelector
                  models={models?.models}
                  selectedModelId={selectedModel}
                  onModelSelect={setSelectedModel}
                  className="ml-1"
                />
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handlePDFUpload}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                title="Upload PDF for context"
              >
                {isUploading ? <Spinner /> : <Paperclip className="h-4 w-4" />}
              </Button>

              {uploadedPDF && (
                <div className="flex items-center gap-1 bg-muted rounded-md px-2 py-1 text-xs max-w-37.5">
                  <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate text-muted-foreground">
                    {uploadedPDF.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setUploadedPDF(null)}
                    className="shrink-0 hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={!hasContent && !uploadedPDF}
              size="sm"
              variant={hasContent || uploadedPDF ? "default" : "ghost"}
              className="h-8 w-8 p-0 rounded-full"
              aria-label="Send message"
              title={
                hasContent || uploadedPDF
                  ? "Send message"
                  : "Enter a message to enable"
              }
            >
              {isChatPending ? (
                <Spinner />
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span className="sr-only">Send message</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
      <ModelRequiredModal
        open={showModelRequiredModal}
        onOpenChange={setShowModelRequiredModal}
      />
    </div>
  );
}
