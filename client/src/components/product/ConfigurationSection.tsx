import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Settings, Download, FileText, Box, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface ProductConfiguration {
  id: number;
  productId: number;
  name: string;
  description?: string;
  specifications?: string;
  datasheetPath?: string;
  modelPath?: string;
  modelType?: 'step' | 'stl';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ConfigurationSectionProps {
  productId: number;
  isCompanyAdmin: boolean;
  onConfigurationSelect?: (configuration: ProductConfiguration | null) => void;
}

export default function ConfigurationSection({ 
  productId, 
  isCompanyAdmin,
  onConfigurationSelect 
}: ConfigurationSectionProps) {
  const { toast } = useToast();
  const [selectedConfig, setSelectedConfig] = useState<ProductConfiguration | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ProductConfiguration | null>(null);
  const [deletingConfigId, setDeletingConfigId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    specifications: '',
  });
  
  const [files, setFiles] = useState({
    datasheet: null as File | null,
    model3d: null as File | null,
  });

  const { data: configurations = [], isLoading: loadingConfigs } = useQuery<ProductConfiguration[]>({
    queryKey: [`/api/products/${productId}/configurations`],
    enabled: !!productId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (configId: number) => {
      const response = await apiRequest(`/api/configurations/${configId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete configuration');
      return configId;
    },
    onSuccess: (deletedConfigId) => {
      // If the deleted configuration was selected, clear the selection
      if (selectedConfig?.id === deletedConfigId) {
        setSelectedConfig(null);
        onConfigurationSelect?.(null);
      }
      
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/configurations`] });
      toast({
        title: "Success",
        description: "Configuration deleted successfully",
      });
      setDeletingConfigId(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete configuration",
        variant: "destructive",
      });
    },
  });

  const handleOpenModal = (config?: ProductConfiguration) => {
    if (config) {
      setEditingConfig(config);
      setFormData({
        name: config.name,
        description: config.description || '',
        specifications: config.specifications || '',
      });
    } else {
      setEditingConfig(null);
      setFormData({
        name: '',
        description: '',
        specifications: '',
      });
    }
    setFiles({ datasheet: null, model3d: null });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingConfig(null);
    setFormData({ name: '', description: '', specifications: '' });
    setFiles({ datasheet: null, model3d: null });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Configuration name is required",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('specifications', formData.specifications);
      
      if (files.datasheet) {
        formDataToSend.append('datasheet', files.datasheet);
      }
      
      if (files.model3d) {
        formDataToSend.append('model3d', files.model3d);
      }

      const url = editingConfig 
        ? `/api/configurations/${editingConfig.id}`
        : `/api/products/${productId}/configurations`;
      
      const method = editingConfig ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        body: formDataToSend,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to save configuration');
      }

      await queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/configurations`] });

      toast({
        title: "Success",
        description: `Configuration ${editingConfig ? 'updated' : 'created'} successfully`,
      });

      handleCloseModal();
    } catch (error) {
      console.error('Error saving configuration:', error);
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectConfiguration = (config: ProductConfiguration) => {
    setSelectedConfig(config);
    onConfigurationSelect?.(config);
  };

  if (loadingConfigs) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-sm text-gray-500 mt-2">Loading configurations...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header with Add button for admins and Clear selection */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Product Configurations
        </h3>
        <div className="flex items-center gap-2">
          {selectedConfig && (
            <Button 
              onClick={() => {
                setSelectedConfig(null);
                onConfigurationSelect?.(null);
              }}
              size="sm"
              variant="outline"
              className="text-xs"
              data-testid="button-clear-selection"
            >
              <X className="w-3 h-3 mr-1" />
              Clear Selection
            </Button>
          )}
          {isCompanyAdmin && (
            <Button 
              onClick={() => handleOpenModal()}
              size="sm"
              className="text-xs"
              data-testid="button-add-configuration"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Configuration
            </Button>
          )}
        </div>
      </div>

      {/* Configurations List */}
      {configurations.length === 0 ? (
        <div className="text-center py-12">
          <Settings className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400 mb-2 text-sm">No configurations available</p>
          {!isCompanyAdmin && (
            <p className="text-gray-500 dark:text-gray-500 text-xs mb-4">
              Contact the manufacturer for custom configuration options
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {configurations.map((config) => (
            <div
              key={config.id}
              className={cn(
                "border rounded-lg p-3 transition-all cursor-pointer",
                selectedConfig?.id === config.id
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
              )}
              onClick={() => handleSelectConfiguration(config)}
              data-testid={`config-item-${config.id}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 dark:text-white text-sm mb-1">
                    {config.name}
                  </h4>
                  {config.description && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      {config.description}
                    </p>
                  )}
                  
                  {/* File indicators */}
                  <div className="flex items-center gap-3 mt-2">
                    {config.datasheetPath && (
                      <div className="flex items-center text-xs text-gray-500">
                        <FileText className="w-3 h-3 mr-1" />
                        Datasheet
                      </div>
                    )}
                    {config.modelPath && (
                      <div className="flex items-center text-xs text-gray-500">
                        <Box className="w-3 h-3 mr-1" />
                        3D Model
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin controls */}
                {isCompanyAdmin && (
                  <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenModal(config)}
                      className="h-7 w-7 p-0"
                      data-testid={`button-edit-config-${config.id}`}
                    >
                      <Edit className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeletingConfigId(config.id)}
                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      data-testid={`button-delete-config-${config.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={handleCloseModal}>
        <DialogContent className="max-w-md bg-gradient-to-br from-white via-cyan-50/30 to-teal-50/30 dark:from-gray-900 dark:via-cyan-950/30 dark:to-teal-950/30 border-2 border-cyan-200 dark:border-cyan-800">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent">
              {editingConfig ? 'Edit Configuration' : 'Add Configuration'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2 p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-cyan-100 dark:border-cyan-900">
              <Label htmlFor="name" className="text-sm font-semibold text-gray-700 dark:text-gray-300">Configuration Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Small, Medium, Large"
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700"
                required
                data-testid="input-config-name"
              />
            </div>

            <div className="space-y-2 p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-teal-100 dark:border-teal-900">
              <Label htmlFor="description" className="text-sm font-semibold text-gray-700 dark:text-gray-300">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe this configuration..."
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700"
                rows={3}
                data-testid="input-config-description"
              />
            </div>

            <div className="space-y-2 p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-cyan-100 dark:border-cyan-900">
              <Label htmlFor="specifications" className="text-sm font-semibold text-gray-700 dark:text-gray-300">Specifications</Label>
              <Textarea
                id="specifications"
                value={formData.specifications}
                onChange={(e) => setFormData(prev => ({ ...prev, specifications: e.target.value }))}
                placeholder="Technical specifications for this configuration..."
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700"
                rows={3}
                data-testid="input-config-specifications"
              />
            </div>

            <div className="space-y-2 p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-teal-100 dark:border-teal-900">
              <Label htmlFor="datasheet" className="text-sm font-semibold text-gray-700 dark:text-gray-300">Datasheet PDF</Label>
              <Input
                id="datasheet"
                type="file"
                accept=".pdf"
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 file:mr-2 file:px-3 file:py-1 file:rounded file:border-0 file:text-sm file:font-medium file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100 dark:file:bg-cyan-950 dark:file:text-cyan-300"
                onChange={(e) => setFiles(prev => ({ ...prev, datasheet: e.target.files?.[0] || null }))}
                data-testid="input-config-datasheet"
              />
              {editingConfig?.datasheetPath && !files.datasheet && (
                <p className="text-xs text-gray-600 dark:text-gray-400 bg-cyan-50/50 dark:bg-cyan-950/30 p-2 rounded border border-cyan-100 dark:border-cyan-900">
                  📄 Current: {editingConfig.datasheetPath.split('/').pop()}
                </p>
              )}
            </div>

            <div className="space-y-2 p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-cyan-100 dark:border-cyan-900">
              <Label htmlFor="model3d" className="text-sm font-semibold text-gray-700 dark:text-gray-300">3D Model (STEP/STL)</Label>
              <Input
                id="model3d"
                type="file"
                accept=".step,.stp,.stl"
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 file:mr-2 file:px-3 file:py-1 file:rounded file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 dark:file:bg-teal-950 dark:file:text-teal-300"
                onChange={(e) => setFiles(prev => ({ ...prev, model3d: e.target.files?.[0] || null }))}
                data-testid="input-config-model"
              />
              {editingConfig?.modelPath && !files.model3d && (
                <p className="text-xs text-gray-600 dark:text-gray-400 bg-teal-50/50 dark:bg-teal-950/30 p-2 rounded border border-teal-100 dark:border-teal-900">
                  📦 Current: {editingConfig.modelPath.split('/').pop()}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 -mx-6 -mb-6 px-6 pb-6 bg-gradient-to-r from-cyan-50/50 to-teal-50/50 dark:from-cyan-950/30 dark:to-teal-950/30 mt-2">
              <Button type="button" variant="outline" onClick={handleCloseModal} disabled={isLoading} className="border-gray-300 dark:border-gray-700">
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700" data-testid="button-save-configuration">
                {isLoading ? 'Saving...' : (editingConfig ? 'Update' : 'Create')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingConfigId} onOpenChange={() => setDeletingConfigId(null)}>
        <AlertDialogContent className="bg-gradient-to-br from-white via-red-50/30 to-orange-50/30 dark:from-gray-900 dark:via-red-950/30 dark:to-orange-950/30 border-2 border-red-200 dark:border-red-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">Delete Configuration</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-700 dark:text-gray-300 bg-white/60 dark:bg-gray-800/60 p-3 rounded-lg border border-red-100 dark:border-red-900">
              Are you sure you want to delete this configuration? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="bg-gradient-to-r from-red-50/50 to-orange-50/50 dark:from-red-950/30 dark:to-orange-950/30 -mx-6 -mb-6 px-6 py-4 mt-2">
            <AlertDialogCancel className="border-gray-300 dark:border-gray-700">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingConfigId && deleteMutation.mutate(deletingConfigId)}
              className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
