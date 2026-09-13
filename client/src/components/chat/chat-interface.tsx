import { useState, useEffect, useRef } from "react";
import { X, Send, MessageCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { connectWebSocket } from "@/lib/websocket";
import { useAuth } from "@/contexts/AuthContext";
import type { ChatMessage } from "@shared/schema";

interface ChatInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: number;
  companyName: string;
}

export default function ChatInterface({ isOpen, onClose, companyId, companyName }: ChatInterfaceProps) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();

  const currentCompanyId = user?.companyId;

  const { data: chatHistory } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chat/${currentCompanyId}/${companyId}`],
    enabled: isOpen && isAuthenticated && !!currentCompanyId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: { message: string; messageType: string }) => {
      const response = await apiRequest("POST", "/api/chat", {
        fromCompanyId: currentCompanyId,
        toCompanyId: companyId,
        message: messageData.message,
        messageType: messageData.messageType,
      });
      return response.json();
    },
    onSuccess: (newMessage) => {
      setMessages(prev => [...prev, newMessage]);
      // Send via WebSocket for real-time updates
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'chat',
          fromCompanyId: currentCompanyId,
          toCompanyId: companyId,
          message: newMessage.message,
          messageType: newMessage.messageType
        }));
      }
    },
  });

  useEffect(() => {
    if (chatHistory) {
      setMessages(chatHistory);
    }
  }, [chatHistory]);

  useEffect(() => {
    if (isOpen) {
      // Connect to WebSocket
      const socket = connectWebSocket();
      wsRef.current = socket;
      
      if (socket) {
        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'message' && 
                ((data.data.fromCompanyId === companyId && data.data.toCompanyId === currentCompanyId) ||
                 (data.data.fromCompanyId === currentCompanyId && data.data.toCompanyId === companyId))) {
              setMessages(prev => {
                // Avoid duplicates
                if (prev.some(msg => msg.id === data.data.id)) {
                  return prev;
                }
                return [...prev, data.data];
              });
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        socket.onerror = (error) => {
          console.error('WebSocket connection error:', error);
        };
      }

      return () => {
        if (wsRef.current) {
          wsRef.current.close();
        }
      };
    }
  }, [isOpen, companyId, currentCompanyId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!message.trim() || sendMessageMutation.isPending) return;

    const messageText = message.trim();
    setMessage("");

    // Send user message
    sendMessageMutation.mutate({
      message: messageText,
      messageType: "user"
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  if (!isAuthenticated || !currentCompanyId) {
    return (
      <div className="fixed bottom-4 right-4 w-80 z-50">
        <Card className="shadow-2xl border-0">
          <CardHeader className="bg-gray-500 text-white p-4 rounded-t-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Lock className="w-5 h-5" />
                <CardTitle className="text-sm font-medium">Authentication Required</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-gray-200 hover:text-white hover:bg-gray-600 h-8 w-8"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <p className="text-sm text-gray-600">
              Please sign in to use the chat feature.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 z-50">
      <Card className="shadow-2xl border-0">
        <CardHeader className="bg-blue-500 text-white p-4 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-blue-600 text-white text-xs">
                  {companyName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-sm font-medium">{companyName}</CardTitle>
                <p className="text-xs text-blue-200">AI Personal Agent Available</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-blue-200 hover:text-white hover:bg-blue-600 h-8 w-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <ScrollArea className="h-80 p-4">
            <div className="space-y-3">
              {/* Welcome message */}
              <div className="flex justify-start">
                <div className="max-w-[70%] bg-gray-100 rounded-lg p-3 text-sm">
                  <div className="flex items-center space-x-1 mb-1">
                    <MessageCircle className="w-3 h-3 text-blue-500" />
                    <span className="text-xs font-medium text-blue-500">AI Personal Agent</span>
                  </div>
                  Hello! I'm here to help you with questions about {companyName}'s products and services. What would you like to know?
                </div>
              </div>

              {/* Chat messages */}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${
                  msg.fromCompanyId === currentCompanyId ? 'justify-end' : 'justify-start'
                }`}>
                  <div className={`max-w-[70%] rounded-lg p-3 text-sm ${
                    msg.fromCompanyId === currentCompanyId
                      ? 'bg-blue-500 text-white'
                      : msg.messageType === 'bot'
                      ? 'bg-gray-100 text-gray-900'
                      : 'bg-gray-200 text-gray-900'
                  }`}>
                    {msg.messageType === 'bot' && (
                      <div className="flex items-center space-x-1 mb-1">
                        <MessageCircle className="w-3 h-3 text-blue-500" />
                        <span className="text-xs font-medium text-blue-500">AI Personal Agent</span>
                      </div>
                    )}
                    {msg.message}
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {sendMessageMutation.isPending && (
                <div className="flex justify-start">
                  <div className="max-w-[70%] bg-gray-100 rounded-lg p-3 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      </div>
                      <span className="text-xs text-gray-500">AI is typing...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </ScrollArea>

          <div className="p-4 border-t border-gray-200">
            <div className="flex space-x-2">
              <Input
                placeholder="Type your message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 text-sm"
                disabled={sendMessageMutation.isPending}
              />
              <Button 
                onClick={handleSendMessage}
                disabled={!message.trim() || sendMessageMutation.isPending}
                size="icon"
                className="shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
