import React, { useEffect, useRef, useState } from "react";
import { socket } from "../../../sockets/socketManager";

type ChatMessage = {
  userId: string;
  message: string;
  timestamp: string;
};

const Chat: React.FC = () => {
  const usernameRef = useRef(
    `user-${Math.random().toString(36).slice(2, 8)}`
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");

  useEffect(() => {
    socket.emit("newUser", usernameRef.current);
  }, []);

  useEffect(() => {
    const handleIncomingMessage = (payload: ChatMessage) => {
      setMessages(prev => [...prev, payload]);
    };

    socket.on("chat:message", handleIncomingMessage);

    return () => {
      socket.off("chat:message", handleIncomingMessage);
    };
  }, []);

  const handleSendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedMessage = messageDraft.trim();

    if (!trimmedMessage) {
      return;
    }

    socket.emit("chat:message", {
      userId: usernameRef.current,
      message: trimmedMessage
    });

    setMessageDraft("");
  };

  return (
    <div className="container-page">
      <div className="flex flex-col gap-4 w-full">
        <h1>EISC Meet</h1>
        <div className="w-full h-64 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-sm overflow-y-auto flex flex-col gap-3">
          {messages.length === 0 ? (
            <p className="text-center text-gray-400">
              Aquí verás los mensajes del chat...
            </p>
          ) : (
            messages.map((msg, index) => {
              const isOwn = msg.userId === usernameRef.current;
              const time = new Date(msg.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
              });

              return (
                <div
                  key={`${msg.timestamp}-${index}`}
                  className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      isOwn
                        ? "bg-purple-600 text-white text-right"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    <div className="text-xs opacity-70 mb-1">
                      {msg.userId} · {time}
                    </div>
                    <div className="whitespace-pre-wrap wrap-break-word">
                      {msg.message}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form
          onSubmit={handleSendMessage}
          className="flex flex-col sm:flex-row gap-2 w-full"
        >
          <input
            className="flex-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            placeholder="Escribe tu mensaje aquí"
            value={messageDraft}
            onChange={event => setMessageDraft(event.target.value)}
          />
          <button type="submit">Enviar</button>
        </form>
      </div>
    </div>
  );
};

export default Chat;