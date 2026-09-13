import { useEffect, useRef, useState } from "react";
import { X, RotateCcw, ZoomIn, ZoomOut, Move, Download, Package, FileText, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Three3DViewer from "./Three3DViewer";

interface ModelViewerProps {
  modelPath: string;
  onClose: () => void;
}

const STEP_VIEWERS = [
  { name: "FreeCAD", url: "https://freecad.org", description: "Free and open-source CAD software" },
  { name: "Fusion 360", url: "https://autodesk.com/products/fusion-360", description: "Professional CAD/CAM software" },
  { name: "SolidWorks", url: "https://solidworks.com", description: "Industry-standard 3D CAD software" },
  { name: "OnShape", url: "https://onshape.com", description: "Cloud-based CAD platform" },
];

export default function ModelViewer({ modelPath, onClose }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<any>(null);

  const fileName = modelPath.split('/').pop() || 'model';
  const fileExtension = fileName.split('.').pop()?.toLowerCase();
  const isStepFile = fileExtension === 'stp' || fileExtension === 'step';

  useEffect(() => {
    // Simulate loading file information
    const timer = setTimeout(() => {
      setFileInfo({
        name: fileName,
        size: '64.1 KB',
        format: isStepFile ? 'STEP' : fileExtension?.toUpperCase(),
        type: 'CAD Model',
        lastModified: new Date().toLocaleDateString(),
      });
      setIsLoading(false);
    }, 800);

    return () => clearTimeout(timer);
  }, [modelPath, fileName, isStepFile, fileExtension]);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = modelPath;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openInNewTab = () => {
    window.open(modelPath, '_blank');
  };

  const actions = [
    { icon: Download, label: "Download", action: handleDownload, variant: "default" as const },
    { icon: ExternalLink, label: "Open in New Tab", action: openInNewTab, variant: "outline" as const },
  ];

  return (
    <Card className="relative bg-white dark:bg-gray-900 border-2 border-blue-500 dark:border-blue-400 rounded-xl overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">CAD Model Viewer</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {isStepFile ? 'STEP CAD File' : 'Engineering Model'}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <X className="w-6 h-6" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col" ref={containerRef}>
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
              <p className="text-gray-600 dark:text-gray-300 text-lg">Loading CAD Model...</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Analyzing file structure</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center bg-red-50 dark:bg-red-900/20">
            <div className="text-center text-red-600 dark:text-red-400">
              <FileText className="w-16 h-16 mx-auto mb-4" />
              <p className="text-lg mb-2">Unable to preview this file</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex">
            {/* Left Panel - File Info */}
            <div className="w-1/3 bg-gray-50 dark:bg-gray-800 p-6 border-r border-gray-200 dark:border-gray-700">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">File Information</h4>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">File Name</label>
                  <p className="text-gray-900 dark:text-white font-mono text-sm break-all">{fileInfo?.name}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Format</label>
                  <div className="flex items-center space-x-2 mt-1">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {fileInfo?.format}
                    </Badge>
                    <span className="text-sm text-gray-600 dark:text-gray-300">{fileInfo?.type}</span>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">File Size</label>
                  <p className="text-gray-900 dark:text-white">{fileInfo?.size}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Modified</label>
                  <p className="text-gray-900 dark:text-white text-sm">{fileInfo?.lastModified}</p>
                </div>
              </div>
              
              {/* Actions */}
              <div className="mt-8 space-y-3">
                {actions.map((action, index) => (
                  <Button
                    key={index}
                    variant={action.variant}
                    onClick={action.action}
                    className="w-full justify-start"
                    size="sm"
                  >
                    <action.icon className="w-4 h-4 mr-2" />
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
            
            {/* Right Panel - Preview */}
            <div className="flex-1 flex flex-col">
              {/* Preview Area - Interactive 3D Viewer */}
              <div className="flex-1 relative">
                {isStepFile ? (
                  <Three3DViewer 
                    modelPath={modelPath} 
                    fileName={fileName}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-24 h-24 bg-gradient-to-br from-gray-400 to-gray-600 rounded-lg mx-auto mb-4 flex items-center justify-center">
                        <FileText className="w-12 h-12 text-white" />
                      </div>
                      <p className="text-gray-600 dark:text-gray-300">Model Preview</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        File format: {fileInfo?.format}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer with Recommended Software */}
      {isStepFile && !isLoading && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
          <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Recommended CAD Software:</h5>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {STEP_VIEWERS.map((viewer, index) => (
              <a
                key={index}
                href={viewer.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-sm transition-all group"
              >
                <div className="text-xs font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {viewer.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                  {viewer.description}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
