import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Palette, Layout, Star, Zap, Building2, Briefcase } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  preview: string;
  features: string[];
  colorScheme: {
    primary: string;
    secondary: string;
    accent: string;
  };
  layout: {
    headerStyle: string;
    contentLayout: string;
    navigationStyle: string;
  };
}

const templates: Template[] = [
  {
    id: "modern",
    name: "Modern Professional",
    description: "Clean, minimalist design with focus on content and readability",
    category: "Professional",
    preview: "/template-previews/modern.jpg",
    features: ["Clean Typography", "Responsive Grid", "Smooth Animations", "Mobile Optimized"],
    colorScheme: {
      primary: "#2563eb",
      secondary: "#64748b", 
      accent: "#0ea5e9"
    },
    layout: {
      headerStyle: "minimal",
      contentLayout: "grid",
      navigationStyle: "tabs"
    }
  },
  {
    id: "industrial",
    name: "Industrial Strength",
    description: "Bold, robust design perfect for manufacturing and heavy industry",
    category: "Manufacturing",
    preview: "/template-previews/industrial.jpg",
    features: ["Bold Headers", "Technical Focus", "Dark Theme", "Equipment Showcase"],
    colorScheme: {
      primary: "#ef4444",
      secondary: "#374151",
      accent: "#f59e0b"
    },
    layout: {
      headerStyle: "bold",
      contentLayout: "columns",
      navigationStyle: "sidebar"
    }
  },
  {
    id: "tech",
    name: "Tech Innovation",
    description: "Cutting-edge design for technology and software companies",
    category: "Technology",
    preview: "/template-previews/tech.jpg",
    features: ["Gradient Backgrounds", "Interactive Elements", "Code Highlights", "Innovation Focus"],
    colorScheme: {
      primary: "#8b5cf6",
      secondary: "#6366f1",
      accent: "#06b6d4"
    },
    layout: {
      headerStyle: "dynamic",
      contentLayout: "masonry",
      navigationStyle: "floating"
    }
  },
  {
    id: "creative",
    name: "Creative Studio",
    description: "Artistic and vibrant design for creative agencies and studios",
    category: "Creative",
    preview: "/template-previews/creative.jpg",
    features: ["Vibrant Colors", "Portfolio Focus", "Creative Layouts", "Visual Storytelling"],
    colorScheme: {
      primary: "#ec4899",
      secondary: "#f97316",
      accent: "#84cc16"
    },
    layout: {
      headerStyle: "artistic",
      contentLayout: "portfolio",
      navigationStyle: "overlay"
    }
  },
  {
    id: "corporate",
    name: "Corporate Elite",
    description: "Traditional, trustworthy design for established corporations",
    category: "Corporate",
    preview: "/template-previews/corporate.jpg",
    features: ["Professional Layout", "Trust Elements", "Formal Typography", "Award Display"],
    colorScheme: {
      primary: "#1f2937",
      secondary: "#374151",
      accent: "#059669"
    },
    layout: {
      headerStyle: "executive",
      contentLayout: "formal",
      navigationStyle: "traditional"
    }
  },
  {
    id: "startup",
    name: "Startup Energy",
    description: "Dynamic, energetic design for startups and growing companies",
    category: "Startup",
    preview: "/template-previews/startup.jpg",
    features: ["Energy & Growth", "Team Focus", "Innovation Stories", "Investor Ready"],
    colorScheme: {
      primary: "#10b981",
      secondary: "#059669",
      accent: "#06b6d4"
    },
    layout: {
      headerStyle: "energetic",
      contentLayout: "story",
      navigationStyle: "modern"
    }
  }
];

interface TemplateSelectorProps {
  currentTemplate: string;
  onTemplateSelect: (template: Template) => void;
  onCustomize?: () => void;
}

export default function TemplateSelector({ currentTemplate, onTemplateSelect, onCustomize }: TemplateSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  
  const categories = ["All", ...Array.from(new Set(templates.map(t => t.category)))];
  
  const filteredTemplates = selectedCategory === "All" 
    ? templates 
    : templates.filter(t => t.category === selectedCategory);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center">
            <Layout className="h-5 w-5 mr-2" />
            Choose Your Profile Template
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Select a template that matches your company's style and industry
          </p>
        </div>
        {onCustomize && (
          <Button variant="outline" onClick={onCustomize}>
            <Palette className="h-4 w-4 mr-2" />
            Customize
          </Button>
        )}
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <Button
            key={category}
            variant={selectedCategory === category ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </Button>
        ))}
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => (
          <Card 
            key={template.id} 
            className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${
              currentTemplate === template.id 
                ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950" 
                : "hover:shadow-md"
            }`}
            onClick={() => onTemplateSelect(template)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center">
                    {template.name}
                    {currentTemplate === template.id && (
                      <Check className="h-4 w-4 ml-2 text-green-500" />
                    )}
                  </CardTitle>
                  <Badge variant="secondary" className="mt-1">
                    {template.category}
                  </Badge>
                </div>
                <div className="flex space-x-1">
                  <div 
                    className="w-3 h-3 rounded-full border border-gray-200" 
                    style={{ backgroundColor: template.colorScheme.primary }}
                  />
                  <div 
                    className="w-3 h-3 rounded-full border border-gray-200" 
                    style={{ backgroundColor: template.colorScheme.secondary }}
                  />
                  <div 
                    className="w-3 h-3 rounded-full border border-gray-200" 
                    style={{ backgroundColor: template.colorScheme.accent }}
                  />
                </div>
              </div>
              <CardDescription className="text-sm">
                {template.description}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="pt-0">
              {/* Template Preview */}
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-4 min-h-[120px] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-lg flex items-center justify-center"
                       style={{ backgroundColor: template.colorScheme.primary }}>
                    {template.category === "Technology" && <Zap className="h-6 w-6 text-white" />}
                    {template.category === "Manufacturing" && <Building2 className="h-6 w-6 text-white" />}
                    {template.category === "Professional" && <Briefcase className="h-6 w-6 text-white" />}
                    {template.category === "Creative" && <Star className="h-6 w-6 text-white" />}
                    {template.category === "Corporate" && <Building2 className="h-6 w-6 text-white" />}
                    {template.category === "Startup" && <Zap className="h-6 w-6 text-white" />}
                  </div>
                  <div className="text-xs text-gray-500">
                    {template.layout.headerStyle} • {template.layout.contentLayout}
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Key Features:</h4>
                <div className="flex flex-wrap gap-1">
                  {template.features.map((feature, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {feature}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Layout Info */}
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <div>
                    <span className="font-medium">Header:</span> {template.layout.headerStyle}
                  </div>
                  <div>
                    <span className="font-medium">Layout:</span> {template.layout.contentLayout}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Template Customization Info */}
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <Palette className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">
                Template Customization
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                All templates can be customized with your brand colors, fonts, and layout preferences. 
                You can modify colors, spacing, content sections, and add your own branding elements.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}