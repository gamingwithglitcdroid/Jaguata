import { useState, useEffect, useRef } from "react";
import React from "react";
import { collection, query, where, orderBy, onSnapshot, addDoc, doc, getDoc, updateDoc } from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import { Walk, Message, UserProfile } from "../types";
import { MessageCircle, X, Send, CheckCheck } from "lucide-react";
import { motion } from "motion/react";
import { sendNotification } from "../services/notificationService";

interface WalkChatProps {
  walkId: string;
  onClose: () => void;
}

export default function WalkChat({ walkId, onClose }: WalkChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [walk, setWalk] = useState<Walk | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!walkId) return;

    // Listen for walk data
    const unsubscribeWalk = onSnapshot(doc(db, "walks", walkId), (snap) => {
      if (snap.exists()) {
        setWalk({ id: snap.id, ...snap.data() } as Walk);
      }
    });

    // Listen for messages
    const messagesQuery = query(
      collection(db, "messages"),
      where("walkId", "==", walkId),
      orderBy("createdAt", "asc")
    );
    
    const unsubscribeMessages = onSnapshot(messagesQuery, (snap) => {
      const msgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "messages");
    });

    return () => {
      unsubscribeWalk();
      unsubscribeMessages();
    };
  }, [walkId]);

  // Mark messages as read when chat is open
  useEffect(() => {
    if (messages.length > 0 && auth.currentUser) {
      const recipientMessages = messages.filter(
        msg => msg.senderId !== auth.currentUser?.uid && !msg.read
      );
      
      recipientMessages.forEach(async (msg) => {
        try {
          await updateDoc(doc(db, "messages", msg.id), {
            read: true,
            readAt: new Date().toISOString()
          });
        } catch (err) {
          console.error("Error marking message as read:", err);
        }
      });
    }
  }, [messages, auth.currentUser]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !auth.currentUser || !walk) return;

    try {
      await addDoc(collection(db, "messages"), {
        walkId: walkId,
        senderId: auth.currentUser.uid,
        text: newMessage.trim(),
        createdAt: new Date().toISOString(),
        read: false
      });

      // Notify recipient
      const otherId = auth.currentUser.uid === walk.ownerId ? walk.walkerId : walk.ownerId;
      if (otherId) {
        await sendNotification({
          userId: otherId,
          title: "Nuevo Mensaje",
          body: `${auth.currentUser.displayName}: ${newMessage.trim()}`,
          type: 'new_message',
          walkId: walkId
        });
      }

      setNewMessage("");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "messages");
    }
  };

  return (
    <motion.div 
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-slate-900"
    >
      <header className="flex items-center justify-between border-b dark:border-slate-800 p-4 min-h-[72px] shrink-0 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 flex items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-500">
            <MessageCircle size={20} />
          </div>
          <div>
            <p className="font-bold text-gray-900 dark:text-white leading-tight">Chat del Paseo</p>
            <p className="text-[10px] text-green-500 font-bold uppercase tracking-wider">En línea</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors">
          <X size={24} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-slate-950/50">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.senderId === auth.currentUser?.uid ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[85%] rounded-2xl p-3 text-base shadow-sm ${
              msg.senderId === auth.currentUser?.uid 
                ? "bg-orange-500 text-white rounded-tr-none" 
                : "bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-tl-none shadow-sm border border-gray-100 dark:border-slate-700"
            }`}>
              {msg.text}
              <div className={`mt-1 flex items-center justify-end gap-1 ${msg.senderId === auth.currentUser?.uid ? "text-orange-100" : "text-gray-400 dark:text-slate-500"}`}>
                <span className="text-[10px]">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {msg.senderId === auth.currentUser?.uid && (
                  <div className="flex ml-1">
                    {msg.read ? (
                      <CheckCheck size={14} className="text-sky-300 drop-shadow-sm" strokeWidth={3} />
                    ) : (
                      <CheckCheck size={14} className="text-white/60" strokeWidth={2} />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} className="h-4" />
      </div>

      <form onSubmit={handleSendMessage} className="border-t dark:border-slate-800 p-4 flex gap-2 bg-white dark:bg-slate-900 pb-[env(safe-area-inset-bottom,16px)]">
        <input 
          type="text" 
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Escribe un mensaje..."
          className="flex-1 rounded-xl border-2 border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 p-3 text-base focus:border-orange-500 focus:bg-white dark:focus:bg-slate-900 dark:text-white focus:outline-none transition-all"
        />
        <button 
          type="submit" 
          disabled={!newMessage.trim()}
          className="rounded-xl bg-orange-500 p-3 text-white shadow-md active:scale-95 disabled:opacity-50 transition-all"
        >
          <Send size={20} />
        </button>
      </form>
    </motion.div>
  );
}
