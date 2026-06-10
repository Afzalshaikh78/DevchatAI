"use client";
import Modal from "@/components/ui/modal";
import { useDeleteChat } from "@/modules/chat/hooks/use-chats";

import React from "react";
import { toast } from "sonner";

type DeleteChatModelProps = {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  chatId: string;
};

const DeleteChatModel = ({
  isModalOpen,
  setIsModalOpen,
  chatId,
}: DeleteChatModelProps) => {
  const { mutateAsync, isPending } = useDeleteChat(chatId);

  const handleDelete = async () => {
    try {
      await mutateAsync();
      toast.success("Chat deleted successfully");
      setIsModalOpen(false);
    } catch (error) {
      toast.error("Failed to delete Chat");
      console.error("Failed to delete Chat:", error);
        }
  };

  return (
    <Modal
      title="Delete Chat"
      description="Are you sure you want to delete this Chat? This action cannot be undone."
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      onSubmit={handleDelete}
      submitText={isPending ? "Deleting..." : "Delete"}
      submitVariant="destructive"
    >
      <p className="text-sm text-zinc-500">
        Once deleted, all requests and data in this Chat will be permanently removed.
      </p>
    </Modal>
  );
};


export default DeleteChatModel;
