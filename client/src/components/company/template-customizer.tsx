import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { 
  Palette, 
  Type, 
  Layout, 
  Eye, 
  Settings,
  Plus,
  Trash2,
  Move,
  Image as ImageIcon
} from "lucide-react";

interface CustomBranding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  logoSize: number;
  borderRadius: number;
}

interface LayoutSettings {
  headerLayout: string;
  contentSections: string[];
  sidebarEnabled: boolean;
  showStats: boolean;
  showTestimonials: boolean;
  showTeam: boolean;
  compactMode: boolean;
}

interface FeaturedContent {
  heroSection: {
    enabled: boolean;
    backgroundImage?: string;
    overlayOpacity: number;
    titleSize: string;
  };
  highlightedProducts: string[];
  featuredNews: boolean;
  callToAction: {
    enabled: boolean;
    text: string;
    link: string;
    style: string;
  };
}

interface TemplateCustomizerProps {
  initialBranding?: CustomBranding;
  initialLayout?: LayoutSettings;
  initialContent?: FeaturedContent;
  onSave: (customization: {
    branding: CustomBranding;
    layout: LayoutSettings;
    content: FeaturedContent;
  }) => void;
  onCancel: () => void;
}

const defaultBranding: CustomBranding = {
  primaryColor: "#2563eb",
  secondaryColor: "#64748b",
  accentColor: "#0ea5e9",
  backgroundColor: "#ffffff",
  textColor: "#1f2937",
  fontFamily: "Inter",
  logoSize: 100,
  borderRadius: 8,
};

const defaultLayout: LayoutSettings = {
  headerLayout: "centered",
  contentSections: ["about", "products", "news", "contact"],
  sidebarEnabled: false,
  showStats: true,
  showTestimonials: true,
  showTeam: true,
  compactMode: false,
};

const defaultContent: FeaturedContent = {
  heroSection: {
    enabled: true,
    overlayOpacity: 50,
    titleSize: "large",
  },
  highlightedProducts: [],
  featuredNews: true,
  callToAction: {
    enabled: true,
    text: "Get in Touch",
    link: "#contact",
    style: "primary",
  },
};

export default function TemplateCustomizer({
  initialBranding = defaultBranding,
  initialLayout = defaultLayout,
  initialContent = defaultContent,
  onSave,
  onCancel
}: TemplateCustomizerProps) {
  const [branding, setBranding] = useState<CustomBranding>(initialBranding);
  const [layout, setLayout] = useState<LayoutSettings>(initialLayout);
  const [content, setContent] = useState<FeaturedContent>(initialContent);
  const [previewMode, setPreviewMode] = useState(false);

  const fontOptions = [
    { value: "Inter", label: "Inter (Modern)" },
    { value: "Roboto", label: "Roboto (Technical)" },
    { value: "Playfair Display", label: "Playfair Display (Elegant)" },
    { value: "Montserrat", label: "Montserrat (Bold)" },
    { value: "Source Sans Pro", label: "Source Sans Pro (Clean)" },
    { value: "Lato", label: "Lato (Friendly)" },
  ];

  const sectionOptions = [
    { value: "about", label: "About Us" },
    { value: "products", label: "Products & Services" },
    { value: "news", label: "News & Updates" },
    { value: "team", label: "Our Team" },
    { value: "testimonials", label: "Testimonials" },
    { value: "contact", label: "Contact Information" },
    { value: "documents", label: "Company Documents" },
    { value: "certifications", label: "Certifications" },
    { value: "stats", label: "Company Statistics" },
  ];

  const handleSave = () => {
    onSave({
      branding,
      layout,
      content,
    });
  };

  const addSection = (sectionId: string) => {
    if (!layout.contentSections.includes(sectionId)) {
      setLayout(prev => ({
        ...prev,
        contentSections: [...prev.contentSections, sectionId]
      }));
    }
  };

  const removeSection = (sectionId: string) => {
    setLayout(prev => ({
      ...prev,
      contentSections: prev.contentSections.filter(s => s !== sectionId)
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Customize Your Profile
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Personalize your company profile with custom branding and layout
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => setPreviewMode(!previewMode)}>
            <Eye className="h-4 w-4 mr-2" />
            {previewMode ? "Edit Mode" : "Preview"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="branding" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="branding">
            <Palette className="h-4 w-4 mr-2" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="layout">
            <Layout className="h-4 w-4 mr-2" />
            Layout
          </TabsTrigger>
          <TabsTrigger value="content">
            <ImageIcon className="h-4 w-4 mr-2" />
            Content
          </TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Brand Colors</CardTitle>
              <CardDescription>Define your company's color palette</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="primaryColor"
                      type="color"
                      value={branding.primaryColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, primaryColor: e.target.value }))}
                      className="w-12 h-10 p-1 border"
                    />
                    <Input
                      value={branding.primaryColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, primaryColor: e.target.value }))}
                      placeholder="#2563eb"
                      className="flex-1"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="secondaryColor">Secondary Color</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="secondaryColor"
                      type="color"
                      value={branding.secondaryColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, secondaryColor: e.target.value }))}
                      className="w-12 h-10 p-1 border"
                    />
                    <Input
                      value={branding.secondaryColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, secondaryColor: e.target.value }))}
                      placeholder="#64748b"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accentColor">Accent Color</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="accentColor"
                      type="color"
                      value={branding.accentColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, accentColor: e.target.value }))}
                      className="w-12 h-10 p-1 border"
                    />
                    <Input
                      value={branding.accentColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, accentColor: e.target.value }))}
                      placeholder="#0ea5e9"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Typography</CardTitle>
              <CardDescription>Choose fonts and text styling</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fontFamily">Font Family</Label>
                  <Select 
                    value={branding.fontFamily} 
                    onValueChange={(value) => setBranding(prev => ({ ...prev, fontFamily: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select font" />
                    </SelectTrigger>
                    <SelectContent>
                      {fontOptions.map((font) => (
                        <SelectItem key={font.value} value={font.value}>
                          {font.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="textColor">Text Color</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="textColor"
                      type="color"
                      value={branding.textColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, textColor: e.target.value }))}
                      className="w-12 h-10 p-1 border"
                    />
                    <Input
                      value={branding.textColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, textColor: e.target.value }))}
                      placeholder="#1f2937"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visual Elements</CardTitle>
              <CardDescription>Adjust visual styling elements</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Logo Size: {branding.logoSize}%</Label>
                  <Slider
                    value={[branding.logoSize]}
                    onValueChange={([value]) => setBranding(prev => ({ ...prev, logoSize: value }))}
                    max={200}
                    min={50}
                    step={10}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Border Radius: {branding.borderRadius}px</Label>
                  <Slider
                    value={[branding.borderRadius]}
                    onValueChange={([value]) => setBranding(prev => ({ ...prev, borderRadius: value }))}
                    max={24}
                    min={0}
                    step={2}
                    className="w-full"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="layout" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Page Layout</CardTitle>
              <CardDescription>Configure your profile page structure</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="headerLayout">Header Layout</Label>
                  <Select 
                    value={layout.headerLayout} 
                    onValueChange={(value) => setLayout(prev => ({ ...prev, headerLayout: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select header layout" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="centered">Centered</SelectItem>
                      <SelectItem value="left-aligned">Left Aligned</SelectItem>
                      <SelectItem value="split">Split Layout</SelectItem>
                      <SelectItem value="minimal">Minimal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 flex items-center justify-between">
                  <Label htmlFor="sidebarEnabled">Enable Sidebar</Label>
                  <Switch
                    id="sidebarEnabled"
                    checked={layout.sidebarEnabled}
                    onCheckedChange={(checked) => setLayout(prev => ({ ...prev, sidebarEnabled: checked }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="showStats">Show Statistics</Label>
                  <Switch
                    id="showStats"
                    checked={layout.showStats}
                    onCheckedChange={(checked) => setLayout(prev => ({ ...prev, showStats: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="showTestimonials">Testimonials</Label>
                  <Switch
                    id="showTestimonials"
                    checked={layout.showTestimonials}
                    onCheckedChange={(checked) => setLayout(prev => ({ ...prev, showTestimonials: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="showTeam">Team Section</Label>
                  <Switch
                    id="showTeam"
                    checked={layout.showTeam}
                    onCheckedChange={(checked) => setLayout(prev => ({ ...prev, showTeam: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="compactMode">Compact Mode</Label>
                  <Switch
                    id="compactMode"
                    checked={layout.compactMode}
                    onCheckedChange={(checked) => setLayout(prev => ({ ...prev, compactMode: checked }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Content Sections</CardTitle>
              <CardDescription>Choose which sections to display and their order</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Active Sections</h4>
                <div className="space-y-2">
                  {layout.contentSections.map((sectionId, index) => {
                    const section = sectionOptions.find(s => s.value === sectionId);
                    return (
                      <div key={sectionId} className="flex items-center justify-between p-2 border rounded-lg">
                        <div className="flex items-center space-x-2">
                          <Move className="h-4 w-4 text-gray-400 cursor-move" />
                          <span className="text-sm">{section?.label}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeSection(sectionId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium">Available Sections</h4>
                <div className="flex flex-wrap gap-2">
                  {sectionOptions
                    .filter(section => !layout.contentSections.includes(section.value))
                    .map((section) => (
                      <Button
                        key={section.value}
                        size="sm"
                        variant="outline"
                        onClick={() => addSection(section.value)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {section.label}
                      </Button>
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hero Section</CardTitle>
              <CardDescription>Configure your profile header section</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="heroEnabled">Enable Hero Section</Label>
                <Switch
                  id="heroEnabled"
                  checked={content.heroSection.enabled}
                  onCheckedChange={(checked) => setContent(prev => ({
                    ...prev,
                    heroSection: { ...prev.heroSection, enabled: checked }
                  }))}
                />
              </div>

              {content.heroSection.enabled && (
                <div className="space-y-4 pl-4 border-l-2 border-gray-200">
                  <div className="space-y-2">
                    <Label>Background Overlay Opacity: {content.heroSection.overlayOpacity}%</Label>
                    <Slider
                      value={[content.heroSection.overlayOpacity]}
                      onValueChange={([value]) => setContent(prev => ({
                        ...prev,
                        heroSection: { ...prev.heroSection, overlayOpacity: value }
                      }))}
                      max={100}
                      min={0}
                      step={10}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="titleSize">Title Size</Label>
                    <Select 
                      value={content.heroSection.titleSize} 
                      onValueChange={(value) => setContent(prev => ({
                        ...prev,
                        heroSection: { ...prev.heroSection, titleSize: value }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select title size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                        <SelectItem value="extra-large">Extra Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Call to Action</CardTitle>
              <CardDescription>Add a prominent call-to-action button</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="ctaEnabled">Enable Call to Action</Label>
                <Switch
                  id="ctaEnabled"
                  checked={content.callToAction.enabled}
                  onCheckedChange={(checked) => setContent(prev => ({
                    ...prev,
                    callToAction: { ...prev.callToAction, enabled: checked }
                  }))}
                />
              </div>

              {content.callToAction.enabled && (
                <div className="space-y-4 pl-4 border-l-2 border-gray-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ctaText">Button Text</Label>
                      <Input
                        id="ctaText"
                        value={content.callToAction.text}
                        onChange={(e) => setContent(prev => ({
                          ...prev,
                          callToAction: { ...prev.callToAction, text: e.target.value }
                        }))}
                        placeholder="Get in Touch"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ctaLink">Button Link</Label>
                      <Input
                        id="ctaLink"
                        value={content.callToAction.link}
                        onChange={(e) => setContent(prev => ({
                          ...prev,
                          callToAction: { ...prev.callToAction, link: e.target.value }
                        }))}
                        placeholder="#contact"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ctaStyle">Button Style</Label>
                    <Select 
                      value={content.callToAction.style} 
                      onValueChange={(value) => setContent(prev => ({
                        ...prev,
                        callToAction: { ...prev.callToAction, style: value }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select button style" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary">Primary</SelectItem>
                        <SelectItem value="secondary">Secondary</SelectItem>
                        <SelectItem value="outline">Outline</SelectItem>
                        <SelectItem value="ghost">Ghost</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Featured Content</CardTitle>
              <CardDescription>Control what content gets highlighted</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="featuredNews">Feature Latest News</Label>
                <Switch
                  id="featuredNews"
                  checked={content.featuredNews}
                  onCheckedChange={(checked) => setContent(prev => ({ ...prev, featuredNews: checked }))}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end space-x-2 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>
          Save Customization
        </Button>
      </div>
    </div>
  );
}