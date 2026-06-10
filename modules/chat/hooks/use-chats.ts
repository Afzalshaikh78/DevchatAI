import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createChatWithMessage,
  deleteChat,
  getAllChats,
  getChatById,
} from "../actions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Chat = {
  id: string;
  title?: string;
  model?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type ActionResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export const useGetChats = () => {
  return useQuery<Chat[]>({
    queryKey: ["chats"],
    queryFn: async () => {
      const res = await getAllChats();
      return res.success ? (res.data ?? []) : [];
    },
  });
};

export const useGetChatById = (chatId: string) => {
  return useQuery<ActionResponse<Chat & { messages: unknown[] }>>({
    queryKey: ["chats", chatId],
    queryFn: async () => {
      const res = await getChatById(chatId);
      return {
        ...res,
        data: res.data ?? undefined,
      };
    },
  });
};

export const useCreateChat = () => {
  const queryClient = useQueryClient();


  return useMutation<
    ActionResponse<Chat>,
    Error,
    Parameters<typeof createChatWithMessage>[0]
  >({
    mutationFn: createChatWithMessage,
    onSuccess: (res) => {
      if (res.success && res.data) {
        queryClient.invalidateQueries({ queryKey: ["chats"] });
      }
    },
    onError: (error) => {
      console.error("Create chat error:", error);
      toast.error("Failed to create chat");
    },
  });
};

export const useDeleteChat = (chatId: string) => {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation<ActionResponse<void>, Error>({
    mutationFn: () => deleteChat(chatId),
    onSuccess: () => {
      queryClient.setQueryData<Chat[]>(["chats"], (old) =>
        old ? old.filter((chat) => chat.id !== chatId) : [],
      );
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      router.push("/");
    },
    onError: () => {
      toast.error("Failed to delete chat");
    },
  });
};
