"use client"
import React, { useState } from 'react'
import ChatWelcomeTabs from './chat-welcome-tabs';
import ChatMessageForm from './chat-message-form';

const ChatMessageView = ({ user }: { user?: { name?: string | null } | null }) => {
    const [selectedMessage , setSelectedMessage] = useState("");

      const handleMessageSelect = (message: string) => {
    setSelectedMessage(message);
  };

  const handleMessageChange = () => {
    setSelectedMessage("");
  };


  return (
    <div className='flex flex-col items-center justify-center h-screen space-y-10'>
        <ChatWelcomeTabs
        userName={user?.name ?? undefined}
        onMessageSelect={handleMessageSelect}
        />

        <ChatMessageForm
           initialMessage={selectedMessage}
          onMessageChange={handleMessageChange}
        />
    </div>
  )
}

export default ChatMessageView
