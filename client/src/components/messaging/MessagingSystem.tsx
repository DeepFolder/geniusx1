import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Send, 
  Paperclip, 
  Phone, 
  Video, 
  MoreHorizontal,
  Search,
  User,
  Building,
  CheckCheck,
  Clock,
  Plus,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderCompany: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'file' | 'system';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  status: 'sent' | 'delivered' | 'read';
}

interface Conversation {
  id: string;
  participants: {
    id: string;
    name: string;
    company: string;
    avatar?: string;
    online: boolean;
  }[];
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: Date;
}

interface MessagingSystemProps {
  companyId: number;
}

export default function MessagingSystem({ companyId }: MessagingSystemProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // WebSocket connection for real-time messaging (temporarily disabled)
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    if (!user) return;

    // WebSocket temporarily disabled to prevent connection issues
    // TODO: Re-enable after fixing port configuration
    console.log("WebSocket connection disabled - using polling instead");
    
    // Use polling instead of WebSocket for now
    const interval = setInterval(() => {
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/messages', selectedConversation] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', companyId] });
    }, 5000); // Poll every 5 seconds

    return () => {
      clearInterval(interval);
    };
  }, [user, selectedConversation, queryClient, companyId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversation]);

  // Fetch conversations
  const { data: conversations, isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ['/api/conversations', companyId],
    refetchInterval: 30000,
  });

  // Fetch messages for selected conversation
  const { data: messages, isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ['/api/messages', selectedConversation],
    enabled: !!selectedConversation,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: { content: string; type: 'text' | 'file'; fileUrl?: string; fileName?: string; fileSize?: number }) => {
      return apiRequest(`/api/messages/${selectedConversation}`, {
        method: 'POST',
        body: JSON.stringify(messageData),
      });
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ['/api/messages', selectedConversation] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    },
  });

  // Start new conversation mutation
  const startConversationMutation = useMutation({
    mutationFn: async (participantId: string) => {
      return apiRequest('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ participantId }),
      });
    },
    onSuccess: (data) => {
      setSelectedConversation(data.id);
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    },
  });

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation) return;

    sendMessageMutation.mutate({
      content: newMessage,
      type: 'text',
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedConversation) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload/message-file', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });

      const data = await response.json();

      sendMessageMutation.mutate({
        content: `Shared a file: ${file.name}`,
        type: 'file',
        fileUrl: data.fileUrl,
        fileName: file.name,
        fileSize: file.size,
      });
    } catch (error) {
      console.error('File upload failed:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const filteredConversations = conversations?.filter(conv =>
    conv.participants.some(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.company.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const selectedConversationData = conversations?.find(c => c.id === selectedConversation);

  return (
    <div className="flex h-[600px] bg-white dark:bg-gray-900 rounded-lg shadow-lg overflow-hidden">
      {/* Conversations Sidebar */}
      <div className="w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Messages</h2>
            <Button size="sm" variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              New
            </Button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversationsLoading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="p-3 animate-pulse">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-300 dark:bg-gray-700 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4" />
                      <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              filteredConversations?.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => setSelectedConversation(conversation.id)}
                  className={cn(
                    "p-3 rounded-lg cursor-pointer transition-colors",
                    selectedConversation === conversation.id
                      ? "bg-blue-50 dark:bg-blue-900/20"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800"
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <div className="w-10 h-10 bg-gray-300 dark:bg-gray-700 rounded-full flex items-center justify-center">
                        {conversation.participants[0]?.avatar ? (
                          <img 
                            src={conversation.participants[0].avatar} 
                            alt="Avatar"
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <Building className="w-5 h-5 text-gray-500" />
                        )}
                      </div>
                      {conversation.participants[0]?.online && (
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {conversation.participants[0]?.name}
                        </p>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {conversation.lastMessage?.timestamp ? new Date(conversation.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                        {conversation.participants[0]?.company}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                        {conversation.lastMessage?.content}
                      </p>
                    </div>
                    
                    {conversation.unreadCount > 0 && (
                      <Badge variant="default" className="bg-blue-500 text-white text-xs">
                        {conversation.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gray-300 dark:bg-gray-700 rounded-full flex items-center justify-center">
                    <Building className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {selectedConversationData?.participants[0]?.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedConversationData?.participants[0]?.company}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button size="sm" variant="ghost">
                    <Phone className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost">
                    <Video className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messagesLoading ? (
                  [...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="flex items-start space-x-2">
                        <div className="w-8 h-8 bg-gray-300 dark:bg-gray-700 rounded-full" />
                        <div className="flex-1 space-y-1">
                          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2" />
                          <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-3/4" />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  messages?.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex items-start space-x-3",
                        message.senderId === user?.id ? "justify-end" : "justify-start"
                      )}
                    >
                      {message.senderId !== user?.id && (
                        <div className="w-8 h-8 bg-gray-300 dark:bg-gray-700 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-gray-500" />
                        </div>
                      )}
                      
                      <div className={cn(
                        "max-w-xs lg:max-w-md rounded-lg p-3",
                        message.senderId === user?.id
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                      )}>
                        <p className="text-sm">{message.content}</p>
                        
                        {message.type === 'file' && message.fileUrl && (
                          <div className="mt-2">
                            <a
                              href={message.fileUrl}
                              download={message.fileName}
                              className="flex items-center space-x-2 text-sm underline hover:no-underline"
                            >
                              <Paperclip className="w-4 h-4" />
                              <span>{message.fileName}</span>
                            </a>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs opacity-70">
                            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {message.senderId === user?.id && (
                            <div className="flex items-center">
                              {message.status === 'sent' && <Clock className="w-3 h-3 opacity-70" />}
                              {message.status === 'delivered' && <CheckCheck className="w-3 h-3 opacity-70" />}
                              {message.status === 'read' && <CheckCheck className="w-3 h-3 text-blue-300" />}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {message.senderId === user?.id && (
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
                
                <div className="flex-1">
                  <Input
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={sendMessageMutation.isPending}
                  />
                </div>
                
                <Button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sendMessageMutation.isPending}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                Select a conversation
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Choose a conversation from the sidebar to start messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}