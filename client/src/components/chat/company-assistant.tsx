import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Bot, User } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { RichTextRenderer } from "@/components/chat/RichTextRenderer";

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

interface CompanyAssistantProps {
  companyId: number;
  companyName: string;
  context?: 'company' | 'product';
  productData?: any;
}

export default function CompanyAssistant({ 
  companyId, 
  companyName, 
  context = 'company',
  productData 
}: CompanyAssistantProps) {
  // Function to render chat message content with clickable product links
  const renderMessageContent = (content: string) => {
    // Regular expression to match product links in format: /products/123
    const productLinkRegex = /\/products\/(\d+)/g;
    const parts = content.split(productLinkRegex);
    
    const result = [];
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        // Regular text
        result.push(parts[i]);
      } else {
        // Product ID - create clickable link
        const productId = parts[i];
        result.push(
          <Link key={`product-${productId}`} href={`/products/${productId}`}>
            <span className="text-blue-600 hover:text-blue-800 underline cursor-pointer">
              /products/{productId}
            </span>
          </Link>
        );
      }
    }
    
    return result;
  };
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      content: `Hello! I'm the AI agent for ${companyName}. I can help you with information about our products, services, and capabilities. What would you like to know?`,
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await fetch('/api/company-chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          companyId,
          context,
          productData: context === 'product' ? productData : undefined
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to get response');
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        id: Date.now().toString() + "_assistant",
        content: data.response,
        isUser: false,
        timestamp: new Date()
      }]);
    },
    onError: (error) => {
      setMessages(prev => [...prev, {
        id: Date.now().toString() + "_error",
        content: "I apologize, but I'm having trouble processing your request right now. Please try again.",
        isUser: false,
        timestamp: new Date()
      }]);
    }
  });

  const handleSendMessage = () => {
    if (!inputValue.trim() || sendMessageMutation.isPending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    sendMessageMutation.mutate(inputValue);
    setInputValue("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Card className="flex flex-col h-96 bg-gradient-to-br from-blue-50 dark:from-blue-950 to-indigo-50 dark:to-indigo-950 border-blue-200 dark:border-blue-800">
      {/* Header */}
      <div className="p-4 border-b border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-t-lg">
        <div className="flex items-center space-x-2">
          <Bot className="w-5 h-5" />
          <h3 className="font-semibold">{companyName} AI Personal Agent</h3>
        </div>
        <p className="text-blue-100 text-sm mt-1">
          {context === 'product' ? 'Ask about this specific product' : 'Ask about our company and products'}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex items-start space-x-3 ${
              message.isUser ? 'flex-row-reverse space-x-reverse' : ''
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              message.isUser 
                ? 'bg-blue-500 text-white' 
                : 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white'
            }`}>
              {message.isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={`max-w-[80%] p-3 rounded-lg ${
              message.isUser
                ? 'bg-blue-500 text-white rounded-br-none'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none shadow-sm'
            }`}>
              {message.isUser ? (
                <p className="text-sm whitespace-pre-wrap">{renderMessageContent(message.content)}</p>
              ) : (
                <div className="text-sm [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-200 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1 overflow-x-auto">
                  <RichTextRenderer content={message.content} />
                </div>
              )}
              <span className={`text-xs mt-1 block ${
                message.isUser ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
              }`}>
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        {sendMessageMutation.isPending && (
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 rounded-lg rounded-bl-none shadow-sm">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 rounded-b-lg">
        <div className="flex space-x-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Ask ${companyName} about ${context === 'product' ? 'this product' : 'their products and services'}...`}
            className="flex-1 border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            disabled={sendMessageMutation.isPending}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || sendMessageMutation.isPending}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}