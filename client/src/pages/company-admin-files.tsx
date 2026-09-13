import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ObjectUploader } from "@/components/ObjectUploader";
import { FileText, Package, Image, Download, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { UploadResult } from "@uppy/core";
import type { Product } from "@shared/schema";

export default function CompanyAdminFiles() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Fetch company products
  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/company/products"],
  });

  // Upload mutation for updating product files
  const updateProductFilesMutation = useMutation({
    mutationFn: async ({ 
      productId, 
      documentURLs = [], 
      stepFileURLs = [], 
      imageURLs = [] 
    }: {
      productId: number;
      documentURLs?: string[];
      stepFileURLs?: string[];
      imageURLs?: string[];
    }) => {
      return apiRequest(`/api/products/${productId}/files`, {
        method: "PUT",
        body: JSON.stringify({ documentURLs, stepFileURLs, imageURLs }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    },
    onSuccess: () => {
      toast({
        title: "Files uploaded successfully",
        description: "Product files have been updated with your uploads.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/company/products"] });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: "Failed to update product files. Please try again.",
        variant: "destructive",
      });
      console.error("Upload error:", error);
    },
  });

  // Handle file upload completion
  const handleFileUploadComplete = (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>,
    fileType: 'document' | 'step' | 'image'
  ) => {
    if (!selectedProduct) return;

    const uploadedURLs = result.successful?.map(file => file.uploadURL as string) || [];
    
    const updateData = {
      productId: selectedProduct.id,
      documentURLs: fileType === 'document' ? uploadedURLs : undefined,
      stepFileURLs: fileType === 'step' ? uploadedURLs : undefined,
      imageURLs: fileType === 'image' ? uploadedURLs : undefined,
    };

    updateProductFilesMutation.mutate(updateData);
  };

  // Get upload parameters for presigned URL
  const getUploadParameters = async () => {
    try {
      const response = await apiRequest("/api/objects/upload", {
        method: "POST",
      });
      return {
        method: "PUT" as const,
        url: response.uploadURL,
      };
    } catch (error) {
      console.error("Failed to get upload URL:", error);
      throw error;
    }
  };

  if (productsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-48 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            Product File Management
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Upload and manage product documents, 3D STEP files, and images for your products.
          </p>
        </div>

        {/* Product Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Select Product
            </CardTitle>
            <CardDescription>
              Choose a product to manage its files and documents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((product: Product) => (
                <Card 
                  key={product.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedProduct?.id === product.id 
                      ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/20' 
                      : ''
                  }`}
                  onClick={() => setSelectedProduct(product)}
                >
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-lg mb-2">{product.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                      {product.description}
                    </p>
                    <Badge variant="secondary">{product.category}</Badge>
                    
                    {/* File count indicators */}
                    <div className="flex gap-2 mt-3 text-xs">
                      {(product.documentPaths?.length || 0) > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <FileText className="h-3 w-3 mr-1" />
                          {product.documentPaths?.length} PDFs
                        </Badge>
                      )}
                      {(product.stepFilePaths?.length || 0) > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <Package className="h-3 w-3 mr-1" />
                          {product.stepFilePaths?.length} 3D Files
                        </Badge>
                      )}
                      {(product.additionalImagePaths?.length || 0) > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <Image className="h-3 w-3 mr-1" />
                          {product.additionalImagePaths?.length} Images
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* File Upload Section */}
        {selectedProduct && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Files for {selectedProduct.name}
              </CardTitle>
              <CardDescription>
                Add documents, 3D STEP files, and product images
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Document Upload */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <h3 className="text-lg font-semibold">PDF Documents</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Upload product catalogs, specifications, datasheets, and other PDF documents
                </p>
                <ObjectUploader
                  maxNumberOfFiles={5}
                  maxFileSize={50 * 1024 * 1024} // 50MB
                  allowedFileTypes={['.pdf']}
                  onGetUploadParameters={getUploadParameters}
                  onComplete={(result) => handleFileUploadComplete(result, 'document')}
                  buttonClassName="w-full"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>Upload PDF Documents</span>
                  </div>
                </ObjectUploader>
              </div>

              <Separator />

              {/* 3D STEP File Upload */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-lg font-semibold">3D STEP Files</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Upload 3D CAD models in STEP format for product visualization and download
                </p>
                <ObjectUploader
                  maxNumberOfFiles={3}
                  maxFileSize={100 * 1024 * 1024} // 100MB
                  allowedFileTypes={['.step', '.stp']}
                  onGetUploadParameters={getUploadParameters}
                  onComplete={(result) => handleFileUploadComplete(result, 'step')}
                  buttonClassName="w-full"
                >
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    <span>Upload 3D STEP Files</span>
                  </div>
                </ObjectUploader>
              </div>

              <Separator />

              {/* Product Image Upload */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Image className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <h3 className="text-lg font-semibold">Product Images</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Upload additional product images that will be visible as previews everywhere on the platform
                </p>
                <ObjectUploader
                  maxNumberOfFiles={10}
                  maxFileSize={10 * 1024 * 1024} // 10MB
                  allowedFileTypes={['.jpg', '.jpeg', '.png', '.webp']}
                  onGetUploadParameters={getUploadParameters}
                  onComplete={(result) => handleFileUploadComplete(result, 'image')}
                  buttonClassName="w-full"
                >
                  <div className="flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    <span>Upload Product Images</span>
                  </div>
                </ObjectUploader>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Current Files Display */}
        {selectedProduct && (
          <Card>
            <CardHeader>
              <CardTitle>Current Files for {selectedProduct.name}</CardTitle>
              <CardDescription>
                Manage existing files and documents for this product
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Documents */}
              {selectedProduct.documentPaths && selectedProduct.documentPaths.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
                    PDF Documents ({selectedProduct.documentPaths.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedProduct.documentPaths.map((path, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                        <FileText className="h-8 w-8 text-red-600 dark:text-red-400" />
                        <div className="flex-1">
                          <p className="font-medium">Document {index + 1}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{path}</p>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <a href={path} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3D Files */}
              {selectedProduct.stepFilePaths && selectedProduct.stepFilePaths.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    3D STEP Files ({selectedProduct.stepFilePaths.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedProduct.stepFilePaths.map((path, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                        <Package className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                        <div className="flex-1">
                          <p className="font-medium">3D Model {index + 1}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{path}</p>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <a href={path} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Images */}
              {selectedProduct.additionalImagePaths && selectedProduct.additionalImagePaths.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Image className="h-5 w-5 text-green-600 dark:text-green-400" />
                    Product Images ({selectedProduct.additionalImagePaths.length})
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {selectedProduct.additionalImagePaths.map((path, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={path}
                          alt={`Product image ${index + 1}`}
                          className="w-full h-32 object-cover rounded-lg"
                        />
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="outline" size="sm" asChild>
                            <a href={path} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No files message */}
              {(!selectedProduct.documentPaths || selectedProduct.documentPaths.length === 0) &&
               (!selectedProduct.stepFilePaths || selectedProduct.stepFilePaths.length === 0) &&
               (!selectedProduct.additionalImagePaths || selectedProduct.additionalImagePaths.length === 0) && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No files uploaded yet. Use the upload sections above to add files.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}