import { useState } from 'react';
import { Box, Package } from 'lucide-react';
import Three3DViewer from './Three3DViewer';
import { Button } from '@/components/ui/button';

interface ProductPreviewProps {
  product: {
    id: number;
    name: string;
    modelPath?: string;
    imagePath?: string;
  };
  gradientClass: string;
}

export default function ProductPreview({ product, gradientClass }: ProductPreviewProps) {
  const [show3D, setShow3D] = useState(false);
  const has3DModel = product.modelPath && product.modelPath.includes('/uploads/');
  const hasImage = product.imagePath;

  // Show 3D model view
  if (show3D && has3DModel && product.modelPath) {
    return (
      <div className="relative w-full h-full">
        <div className="w-full h-full bg-white dark:bg-gray-900 rounded-lg overflow-hidden">
          <Three3DViewer 
            modelPath={product.modelPath} 
            fileName={product.modelPath.split('/').pop() || product.name}
          />
        </div>
        
        {/* Toggle back to image */}
        <Button
          size="sm"
          variant="secondary"
          className="absolute top-2 left-2 h-8 px-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-md hover:bg-white dark:hover:bg-gray-700 z-10"
          onClick={() => setShow3D(false)}
          data-testid="toggle-image-view"
        >
          <Package className="w-4 h-4 mr-1" />
          <span className="text-xs font-medium">Image</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full group">
      {/* Show product image if available, otherwise gradient */}
      {hasImage ? (
        <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-lg bg-white dark:bg-gray-900">
          <img 
            src={hasImage} 
            alt={product.name}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        </div>
      ) : (
        <div className={`w-full h-full flex items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br ${gradientClass}`}>
          <Box className="w-8 h-8 text-white/70" />
        </div>
      )}
      
      {/* Toggle to 3D model view when available */}
      {has3DModel && (
        <Button
          size="sm"
          variant="secondary"
          className="absolute top-2 right-2 h-8 px-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-md hover:bg-white dark:hover:bg-gray-700"
          onClick={() => setShow3D(true)}
          data-testid="toggle-3d-view"
        >
          <Box className="w-4 h-4 mr-1" />
          <span className="text-xs font-medium">3D View</span>
        </Button>
      )}
    </div>
  );
}