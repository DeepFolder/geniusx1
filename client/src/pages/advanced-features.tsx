import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MessagingSystem from "@/components/messaging/MessagingSystem";
import Advanced3DConfigurator from "@/components/product/Advanced3DConfigurator";
import VoiceInput from "@/components/voice/VoiceInput";
import { MessageSquare, Box, Mic, Video, Settings, Zap } from "lucide-react";

export default function AdvancedFeatures() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/auth";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const handleVoiceTranscript = (text: string) => {
    console.log("Voice transcript:", text);
    // Handle voice input here
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-black">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Advanced Features</h1>
          </div>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Cutting-edge tools for enhanced collaboration, 3D visualization, and voice-powered interactions
          </p>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="messaging" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="messaging" className="flex items-center space-x-2">
              <MessageSquare className="w-4 h-4" />
              <span>Messaging</span>
            </TabsTrigger>
            <TabsTrigger value="3d-configurator" className="flex items-center space-x-2">
              <Box className="w-4 h-4" />
              <span>3D Configurator</span>
            </TabsTrigger>
            <TabsTrigger value="voice" className="flex items-center space-x-2">
              <Mic className="w-4 h-4" />
              <span>Voice Input</span>
            </TabsTrigger>
            <TabsTrigger value="collaboration" className="flex items-center space-x-2">
              <Video className="w-4 h-4" />
              <span>Collaboration</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="messaging">
            <MessagingSystem companyId={user.companyId || 1} />
          </TabsContent>

          <TabsContent value="3d-configurator">
            <Advanced3DConfigurator productId={1} companyId={user.companyId || 1} />
          </TabsContent>

          <TabsContent value="voice">
            <div className="max-w-2xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Mic className="w-5 h-5" />
                    <span>Voice Input System</span>
                  </CardTitle>
                  <CardDescription>
                    Advanced voice recognition with multi-language support
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <VoiceInput 
                    onTranscript={handleVoiceTranscript}
                    onLanguageChange={(lang) => console.log("Language changed:", lang)}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="collaboration">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Video className="w-5 h-5" />
                  <span>Collaboration Suite</span>
                </CardTitle>
                <CardDescription>
                  Video conferencing and real-time collaboration tools
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="text-center p-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                    <Video className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                      Video Conferencing
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      WebRTC-powered video calls with screen sharing and recording
                    </p>
                  </div>
                  
                  <div className="text-center p-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                    <Settings className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                      Collaborative Workspace
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      Shared whiteboards, document editing, and project management
                    </p>
                  </div>
                </div>
                
                <div className="mt-6 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Advanced collaboration features coming soon
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}