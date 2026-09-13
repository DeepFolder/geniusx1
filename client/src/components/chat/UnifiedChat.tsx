import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Bot, User, ExternalLink, Copy, Sparkles, MessageCircle, X, Volume2, VolumeX, Package, Download, Heart, Eye, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { RichTextRenderer } from "@/components/chat/RichTextRenderer";

// Types for unified chat
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  citations?: Array<{
    id: number;
    type: 'company' | 'product' | 'document';
    name: string;
    url: string;
    score: number;
    documentInfo?: {
      chunkIndex?: number;
      totalChunks?: number;
      category?: string;
    };
  }>;
  suggestions?: string[];
  isStreaming?: boolean;
}

export interface ChatContext {
  type: 'global' | 'personal' | 'company' | 'product' | 'document';
  id?: number;
  data?: any;
  sessionId: string;
  title?: string;
  subtitle?: string;
}

export interface UnifiedChatProps {
  context: ChatContext;
  initialMessage?: string;
  className?: string;
  maxHeight?: string;
  showHeader?: boolean;
  placeholder?: string;
  enableVoice?: boolean;
  compact?: boolean;
}

// Extended interfaces for product preview
interface ProductPreview {
  id: number;
  name: string;
  category?: string;
  description?: string;
  imagePath?: string;
  modelPath?: string;
  catalogPath?: string;
  documentPaths?: string[];
  companyName?: string;
}

export default function UnifiedChat({
  context,
  initialMessage,
  className,
  maxHeight = "600px",
  showHeader = true,
  placeholder = "Type your message...",
  enableVoice = false,
  compact = false
}: UnifiedChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Product preview state
  const [selectedProduct, setSelectedProduct] = useState<ProductPreview | null>(null);
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { toast } = useToast();

  // Auto-scroll to bottom when messages update
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Initialize with welcome message if provided
  useEffect(() => {
    if (initialMessage && messages.length === 0) {
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content: initialMessage,
        timestamp: new Date(),
        suggestions: getInitialSuggestions()
      };
      setMessages([welcomeMessage]);
    }
  }, [initialMessage, messages.length]);

  // Generate initial suggestions based on context
  const getInitialSuggestions = (): string[] => {
    switch (context.type) {
      case 'global':
        return [
          "Find CNC machining companies",
          "Search for automation solutions",
          "Compare industrial sensors",
          "Download product catalogs"
        ];
      case 'company':
        return [
          "Tell me about your products",
          "What services do you offer?",
          "Show me technical specifications",
          "How can I contact you?"
        ];
      case 'product':
        return [
          "What are the technical specs?",
          "Show me similar products",
          "Download product documentation",
          "Get pricing information"
        ];
      case 'personal':
        return [
          "Recommend products for me",
          "Show my recent activity",
          "Find trending companies",
          "Update my preferences"
        ];
      default:
        return ["How can I help you today?"];
    }
  };

  // Handle message sending with streaming
  const handleSendMessage = async (messageText?: string) => {
    const messageToSend = messageText || inputValue.trim();
    if (!messageToSend) return;

    // Clear any existing error
    setError(null);
    
    // Add user message
    const userMessageId = `user_${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: messageToSend,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setIsStreaming(true);

    // Create assistant message placeholder for streaming
    const assistantMessageId = `assistant_${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: "",
      timestamp: new Date(),
      isStreaming: true
    };
    
    setMessages(prev => [...prev, assistantMessage]);
    setStreamingMessageId(assistantMessageId);

    try {
      // Close any existing event source
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Start Server-Sent Events streaming
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          message: messageToSend,
          context: context
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.slice(6));
              
              if (eventData.type === 'connected') {
                console.log('🔗 Stream connected');
                continue;
              }
              
              if (eventData.type === 'token') {
                // Update streaming message content
                setMessages(prev => prev.map(msg => 
                  msg.id === assistantMessageId 
                    ? { ...msg, content: msg.content + eventData.content }
                    : msg
                ));
              }
              
              if (eventData.type === 'complete') {
                console.log('✅ Stream completed');
                // Add citations and suggestions to final message
                if (eventData.citations || eventData.suggestions) {
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { 
                          ...msg, 
                          citations: eventData.citations,
                          suggestions: eventData.suggestions,
                          isStreaming: false
                        }
                      : msg
                  ));
                } else {
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, isStreaming: false }
                      : msg
                  ));
                }
                break;
              }
              
              if (eventData.type === 'error') {
                throw new Error(eventData.content || 'Streaming error occurred');
              }
              
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', line);
            }
          }
        }
      }

    } catch (fetchError) {
      console.error('❌ Chat error:', fetchError);
      
      // Remove the streaming message placeholder and show error
      setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
      
      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: "I'm experiencing technical difficulties. Please try again in a moment.",
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
      setError("Failed to send message. Please try again.");
      
      toast({
        title: "Chat Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingMessageId(null);
      
      // Focus input for next message
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Handle suggestion clicks
  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  // Handle copying message content
  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      title: "Copied",
      description: "Message copied to clipboard",
    });
  };

  // Handle product preview
  const handleProductPreview = async (citation: any) => {
    if (citation.type !== 'product') return;
    
    setPreviewLoading(true);
    try {
      // Extract product ID from URL
      const productId = citation.url.match(/\/product\/(\d+)/)?.[1];
      if (!productId) return;
      
      // Fetch product details
      const response = await fetch(`/api/products/${productId}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const productData = await response.json();
        
        // Fetch company name if needed
        let companyName = '';
        if (productData.companyId) {
          try {
            const companyResponse = await fetch(`/api/companies/${productData.companyId}`, {
              credentials: 'include'
            });
            if (companyResponse.ok) {
              const companyData = await companyResponse.json();
              companyName = companyData.name;
            }
          } catch (e) {
            console.warn('Failed to fetch company name');
          }
        }
        
        setSelectedProduct({
          id: productData.id,
          name: productData.name,
          category: productData.category,
          description: productData.description,
          imagePath: productData.imagePath,
          modelPath: productData.modelPath,
          catalogPath: productData.catalogPath,
          documentPaths: productData.documentPaths,
          companyName
        });
        setShowPreviewPanel(true);
      }
    } catch (error) {
      console.error('Failed to fetch product details:', error);
      toast({
        title: "Error",
        description: "Failed to load product preview",
        variant: "destructive"
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle closing preview panel
  const handleClosePreview = () => {
    setShowPreviewPanel(false);
    setSelectedProduct(null);
  };

  // Get context title based on type
  const getContextTitle = (): string => {
    switch (context.type) {
      case 'global':
        return 'DeepSearch';
      case 'personal':
        return 'DeepSearch Personal';
      case 'company':
        return `${context.data?.companyName || 'Company'} DeepSearch`;
      case 'product':
        return 'DeepSearch Product';
      case 'document':
        return 'DeepSearch Documents';
      default:
        return 'DeepSearch';
    }
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Cleanup event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <Card className={cn("flex flex-col overflow-hidden bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border-purple-200 dark:border-purple-800", className)} style={{ maxHeight }}>
      {showHeader && (
        <div className={cn("bg-gradient-to-r from-purple-600 to-blue-600 text-white", compact ? "px-3 py-2" : "px-4 py-3")}>
          <div className="flex items-center justify-between">
            <div className={cn("flex items-center", compact ? "space-x-1.5" : "space-x-2")}>
              <div className={cn("bg-white/20 rounded-full flex items-center justify-center", compact ? "w-6 h-6" : "w-8 h-8")}>
                <MessageCircle className={cn(compact ? "w-3 h-3" : "w-4 h-4")} />
              </div>
              <div>
                <h3 className={cn("font-bold", compact ? "text-sm" : "text-base")}>AI Assistant</h3>
                <p className="text-xs text-purple-100">{context.subtitle || "Ask me anything"}</p>
              </div>
            </div>
            {showPreviewPanel && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClosePreview}
                className={cn("text-white hover:bg-white/20", compact ? "h-6 px-2" : "h-8 px-2")}
              >
                <X className={cn(compact ? "w-3 h-3" : "w-4 h-4")} />
              </Button>
            )}
          </div>
        </div>
      )}

      <CardContent className="flex-1 flex flex-col p-0">
        {/* Split Layout: Chat + Preview Panel */}
        <div className="flex-1 flex">
          {/* Chat Area */}
          <div className={cn(
            "flex flex-col transition-all duration-300 bg-white/50 dark:bg-gray-900/50",
            showPreviewPanel ? "w-1/2" : "w-full"
          )}>
            {/* Messages Area */}
            <ScrollArea className={cn("flex-1", compact ? "p-3" : "px-4 py-3")}>
              <div className="space-y-2">
                {messages.length === 0 && !isLoading && (
                  <div className={cn("text-center", compact ? "py-6" : "py-8")}>
                    <div className={cn(
                      "bg-gradient-to-r from-purple-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-2",
                      compact ? "w-10 h-10" : "w-12 h-12"
                    )}>
                      <Bot className={cn("text-white", compact ? "w-5 h-5" : "w-6 h-6")} />
                    </div>
                    <p className={cn("text-gray-600 dark:text-gray-400 mb-1", compact ? "text-xs" : "text-sm")}>
                      Hi! Ask me anything about
                    </p>
                    <p className={cn("font-semibold text-gray-900 dark:text-white", compact ? "text-xs" : "text-sm")}>
                      {context.title || getContextTitle()}
                    </p>
                    <p className={cn("text-gray-500 dark:text-gray-500 mt-1", compact ? "text-xs" : "text-xs")}>
                      {context.subtitle || "I can help you with information, specifications, and more"}
                    </p>
                  </div>
                )}
                {messages.map((message) => (
                  <div key={message.id} className={cn(
                    "flex items-start space-x-2",
                    message.role === 'user' ? "justify-end" : "justify-start"
                  )}>
                    {message.role === 'assistant' && (
                      <div className={cn(
                        "bg-gradient-to-r from-purple-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0",
                        compact ? "w-5 h-5" : "w-6 h-6"
                      )}>
                        <Bot className={cn("text-white", compact ? "w-2.5 h-2.5" : "w-3 h-3")} />
                      </div>
                    )}
                    <div className={cn(
                      "rounded-lg break-words",
                      compact ? "max-w-[80%] p-2 text-xs" : "max-w-[85%] px-3 py-2 text-sm",
                      message.role === 'user'
                        ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white"
                        : "bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 shadow-sm"
                    )}>
                      {message.role === 'assistant' ? (
                        <div className="break-words [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1 dark:[&_th]:border-gray-600 dark:[&_th]:bg-gray-700 dark:[&_td]:border-gray-600 overflow-x-auto">
                          <RichTextRenderer content={message.content} />
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap break-words">{message.content}</div>
                      )}
                      
                      {/* Citations with Preview Actions */}
                      {message.citations && message.citations.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-xs font-medium mb-2">Sources:</p>
                          <div className="grid gap-2">
                            {message.citations.map((citation, index) => (
                              <div key={`${citation.id}-${index}`} className="flex items-center gap-2 p-2 rounded border border-border/50 bg-background/30">
                                <Badge variant="outline" className="text-xs">
                                  {citation.type}
                                </Badge>
                                <a
                                  href={citation.url}
                                  className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 flex items-center gap-1 flex-1"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {citation.name}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                                {citation.type === 'product' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => handleProductPreview(citation)}
                                    disabled={previewLoading}
                                  >
                                    <Eye className="w-3 h-3 mr-1" />
                                    Preview
                                  </Button>
                                )}
                                {citation.documentInfo && citation.documentInfo.chunkIndex !== undefined && citation.documentInfo.totalChunks !== undefined && (
                                  <span className="text-xs text-muted-foreground">
                                    (chunk {citation.documentInfo.chunkIndex + 1}/{citation.documentInfo.totalChunks})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  
                  {/* Suggestions */}
                  {message.suggestions && message.suggestions.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs font-medium mb-2">Try asking:</p>
                      <div className="flex flex-wrap gap-2">
                        {message.suggestions.map((suggestion, index) => (
                          <Button
                            key={index}
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => handleSuggestionClick(suggestion)}
                            disabled={isLoading}
                          >
                            {suggestion}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                    </div>
                    {message.role === 'user' && (
                      <div className={cn(
                        "bg-gray-400 rounded-full flex items-center justify-center flex-shrink-0",
                        compact ? "w-5 h-5" : "w-6 h-6"
                      )}>
                        <User className={cn("text-white", compact ? "w-2.5 h-2.5" : "w-3 h-3")} />
                      </div>
                    )}
                  </div>
            ))}
            
            {error && (
              <div className="flex justify-center">
                <div className="bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-3 py-2 rounded-lg text-sm">
                  {error}
                </div>
              </div>
            )}
          </div>
          <div ref={messagesEndRef} />
        </ScrollArea>

        <Separator />

        {/* Input Area */}
        <div className="p-4">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={placeholder}
              disabled={isLoading}
              className="flex-1"
              data-testid="input-chat-message"
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={!inputValue.trim() || isLoading}
              size="icon"
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
              data-testid="button-send-message"
            >
              {isLoading ? (
                <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          
          {isStreaming && (
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <div className="animate-pulse flex space-x-1">
                <div className="w-1 h-1 bg-current rounded-full animate-bounce"></div>
                <div className="w-1 h-1 bg-current rounded-full animate-bounce delay-100"></div>
                <div className="w-1 h-1 bg-current rounded-full animate-bounce delay-200"></div>
              </div>
              <span>Generating response...</span>
            </div>
          )}
            </div>
          </div>

          {/* Product Preview Panel */}
          {showPreviewPanel && selectedProduct && (
            <div className="w-1/2 border-l border-border bg-muted/30 p-4 overflow-y-auto">
              <div className="space-y-4">
                {/* Product Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg bg-gradient-to-r from-purple-500 to-pink-600">
                      <Package className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground text-lg">{selectedProduct.name}</h3>
                      <p className="text-sm text-muted-foreground">{selectedProduct.category}</p>
                      {selectedProduct.companyName && (
                        <p className="text-xs text-blue-600 dark:text-blue-400">{selectedProduct.companyName}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClosePreview}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Product Image */}
                <div className="aspect-[4/3] rounded-xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
                  {selectedProduct.imagePath ? (
                    <img 
                      src={selectedProduct.imagePath} 
                      alt={selectedProduct.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="text-center">
                      <Package className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No image available</p>
                    </div>
                  )}
                </div>

                {/* Description */}
                {selectedProduct.description && (
                  <div>
                    <h4 className="font-medium mb-2">Description</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {selectedProduct.description}
                    </p>
                  </div>
                )}

                {/* Available Files */}
                <div>
                  <h4 className="font-medium mb-3">Available Files</h4>
                  <div className="space-y-2">
                    {selectedProduct.modelPath && (
                      <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                            <Package className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">3D Model</p>
                            <p className="text-xs text-blue-600 dark:text-blue-400">STEP file format</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-blue-600 border-blue-300 hover:bg-blue-100 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-900/30"
                          onClick={() => window.open(selectedProduct.modelPath, '_blank')}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Download
                        </Button>
                      </div>
                    )}
                    
                    {selectedProduct.catalogPath && (
                      <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                            <Download className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-orange-700 dark:text-orange-300">PDF Datasheet</p>
                            <p className="text-xs text-orange-600 dark:text-orange-400">Product catalog</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-orange-600 border-orange-300 hover:bg-orange-100 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-900/30"
                          onClick={() => window.open(selectedProduct.catalogPath, '_blank')}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Download
                        </Button>
                      </div>
                    )}
                    
                    {!selectedProduct.modelPath && !selectedProduct.catalogPath && (
                      <div className="text-center py-4 text-muted-foreground">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No files available for download</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <Button 
                    variant="outline" 
                    className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <Heart className="w-4 h-4 mr-2" />
                    Add to Favorites
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}