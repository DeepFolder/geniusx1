import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Send, Bot, User, ExternalLink, Download, Package, Building, Phone, Mail, Globe } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Company, Product } from "@shared/schema";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  links?: Array<{
    type: 'product' | 'website' | 'download' | 'contact';
    label: string;
    url: string;
    description?: string;
  }>;
}

interface CompanyAssistantProps {
  companyId: number;
  companyName: string;
  context?: string;
}

export default function CompanyAssistant({ companyId, companyName, context = "company" }: CompanyAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch company data for context
  const { data: company } = useQuery<Company>({
    queryKey: [`/api/companies/${companyId}`],
  });

  // Fetch company products for context
  const { data: products } = useQuery<Product[]>({
    queryKey: [`/api/products?companyId=${companyId}`],
  });

  // Fetch company documents for context
  const { data: documents } = useQuery({
    queryKey: [`/api/companies/${companyId}/documents`],
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  // Initialize conversation with company context
  useEffect(() => {
    if (company && messages.length === 0) {
      const welcomeMessage: Message = {
        id: "welcome",
        role: "assistant",
        content: `Hello! I'm ${company.name}'s AI Personal Agent. I can help you with information about our company, products, services, and technical specifications. 

I have access to:
• Company information and capabilities
• Product catalog and specifications
• Technical documents and datasheets
• Contact information and support resources

How can I assist you today?`,
        timestamp: new Date(),
        links: [
          {
            type: 'website',
            label: 'Company Website',
            url: company.website || '#',
            description: 'Visit our main website'
          },
          {
            type: 'contact',
            label: 'Contact Information',
            url: `mailto:${company.email}`,
            description: 'Get in touch with our team'
          }
        ]
      };
      setMessages([welcomeMessage]);
    }
  }, [company, messages.length]);

  const generateCompanyContext = () => {
    if (!company) return "";

    const context = {
      company: {
        name: company.name,
        description: company.description,
        industry: company.industry,
        location: company.location,
        email: company.email,
        phone: company.phone,
        website: company.website,
        certifications: company.certifications || [],
        capabilities: company.capabilities || []
      },
      products: products?.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        specifications: p.specifications
      })) || [],
      documentsCount: Array.isArray(documents) ? documents.length : 0
    };

    return `Company Context: ${JSON.stringify(context, null, 2)}`;
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const companyContext = generateCompanyContext();
      
      const response = await fetch('/api/company-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputMessage,
          companyId,
          companyContext,
          chatHistory: messages.slice(-5) // Send last 5 messages for context
        })
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Parse response to extract links
      const links = extractLinksFromResponse(data.response, company, products);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        links: links
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I apologize, but I'm having trouble processing your request right now. Please try again or contact our support team directly.",
        timestamp: new Date(),
        links: company ? [{
          type: 'contact',
          label: 'Contact Support',
          url: `mailto:${company.email}`,
          description: 'Get direct support from our team'
        }] : []
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const extractLinksFromResponse = (response: string, company?: Company, products?: Product[]) => {
    const links: Message['links'] = [];

    // Add company website if mentioned
    if (company?.website && (response.toLowerCase().includes('website') || response.toLowerCase().includes('visit'))) {
      links.push({
        type: 'website',
        label: 'Visit Website',
        url: company.website,
        description: `Visit ${company.name}'s website`
      });
    }

    // Add contact information if mentioned
    if (company?.email && (response.toLowerCase().includes('contact') || response.toLowerCase().includes('support'))) {
      links.push({
        type: 'contact',
        label: 'Contact Us',
        url: `mailto:${company.email}`,
        description: 'Send us an email'
      });
    }

    // Add products if mentioned
    products?.forEach(product => {
      if (response.toLowerCase().includes(product.name.toLowerCase())) {
        links.push({
          type: 'product',
          label: product.name,
          url: `/products/${product.id}`,
          description: `View ${product.name} details`
        });
      }
    });

    return links;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
            <Bot className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{companyName} AI Personal Agent</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Powered by company knowledge base
            </p>
          </div>
        </div>
        
        {/* Quick Company Info */}
        {company && (
          <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
              {company.industry}
            </Badge>
            <Badge variant="secondary" className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
              {products?.length || 0} Products
            </Badge>
            <Badge variant="secondary" className="bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300">
              {Array.isArray(documents) ? documents.length : 0} Documents
            </Badge>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex items-start space-x-3 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                message.role === 'user' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400'
              }`}>
                {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              
              <div className={`rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                
                {/* Message Links */}
                {message.links && message.links.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <Separator className="my-2" />
                    <div className="grid grid-cols-1 gap-2">
                      {message.links.map((link, index) => (
                        <a
                          key={index}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-2 p-2 rounded bg-white dark:bg-gray-600 hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors text-gray-700 dark:text-gray-300 text-xs"
                        >
                          {link.type === 'product' && <Package className="w-4 h-4 text-green-600" />}
                          {link.type === 'website' && <Globe className="w-4 h-4 text-blue-600" />}
                          {link.type === 'contact' && <Mail className="w-4 h-4 text-orange-600" />}
                          {link.type === 'download' && <Download className="w-4 h-4 text-purple-600" />}
                          <div className="flex-1">
                            <div className="font-medium">{link.label}</div>
                            {link.description && (
                              <div className="text-gray-500 dark:text-gray-400">{link.description}</div>
                            )}
                          </div>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="text-xs mt-2 opacity-70">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-start space-x-3 max-w-[80%]">
              <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t dark:border-gray-700">
        <div className="relative">
          {/* Enhanced Background Glow */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 rounded-full blur-xl scale-110 opacity-30"></div>
          
          <div className="relative z-10">
            {/* Input Container with Enhanced Styling */}
            <div className="relative rounded-full transition-all duration-500 transform hover:scale-[1.02] bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 p-[3px] shadow-2xl shadow-purple-500/20">
              <div className="bg-white dark:bg-black rounded-full shadow-inner">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={`Ask about ${companyName}'s products, services, or technical support...`}
                  disabled={isLoading}
                  className="pl-6 pr-16 py-4 text-base font-medium transition-all duration-300 border-0 focus:ring-0 focus:outline-none bg-transparent text-black dark:text-white rounded-full placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              </div>
              
              {/* Enhanced Send Button */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <Button
                  onClick={handleSendMessage}
                  disabled={isLoading || !inputMessage.trim()}
                  variant="ghost"
                  size="lg"
                  className="p-3 h-auto bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInputMessage("What products do you offer?")}
            className="text-xs bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 border border-gray-200/50 dark:border-gray-600/50 hover:scale-105 transition-all duration-300 rounded-full"
          >
            Our Products
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInputMessage("How can I contact technical support?")}
            className="text-xs bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 border border-gray-200/50 dark:border-gray-600/50 hover:scale-105 transition-all duration-300 rounded-full"
          >
            Technical Support
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInputMessage("Do you have technical specifications available?")}
            className="text-xs bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 border border-gray-200/50 dark:border-gray-600/50 hover:scale-105 transition-all duration-300 rounded-full"
          >
            Specifications
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInputMessage("What certifications do you have?")}
            className="text-xs bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 border border-gray-200/50 dark:border-gray-600/50 hover:scale-105 transition-all duration-300 rounded-full"
          >
            Certifications
          </Button>
        </div>
      </div>
    </div>
  );
}