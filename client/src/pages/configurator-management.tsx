import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Settings, ArrowLeft, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import DragDropUpload from "@/components/ui/drag-drop-upload";

export default function ConfiguratorManagement() {
  const { productId } = useParams();
  const queryClient = useQueryClient();
  const [configName, setConfigName] = useState("");
  const [configDescription, setConfigDescription] = useState("");
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [variants, setVariants] = useState<any[]>([]);
  const [newParamName, setNewParamName] = useState("");
  const [newParamType, setNewParamType] = useState("text");

  const { data: product } = useQuery({
    queryKey: [`/api/products/${productId}`],
    enabled: !!productId,
  });

  const { data: configurations } = useQuery({
    queryKey: [`/api/products/${productId}/configurations`],
    enabled: !!productId,
  });

  const createConfigMutation = useMutation({
    mutationFn: async (configData: any) => {
      return apiRequest(`/api/products/${productId}/configurations`, {
        method: 'POST',
        body: JSON.stringify(configData),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Product configurator created successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/configurations`] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create configurator",
        variant: "destructive",
      });
    },
  });

  const addParameter = () => {
    if (newParamName && !parameters[newParamName]) {
      setParameters({
        ...parameters,
        [newParamName]: {
          label: newParamName,
          type: newParamType,
          options: newParamType === 'select' ? [] : undefined,
          min: newParamType === 'number' ? 0 : undefined,
          max: newParamType === 'number' ? 100 : undefined,
          unit: newParamType === 'number' ? '' : undefined,
          defaultValue: undefined,
        }
      });
      setNewParamName("");
      setNewParamType("text");
    }
  };

  const removeParameter = (paramName: string) => {
    const newParams = { ...parameters };
    delete newParams[paramName];
    setParameters(newParams);
  };

  const updateParameter = (paramName: string, field: string, value: any) => {
    setParameters({
      ...parameters,
      [paramName]: {
        ...parameters[paramName],
        [field]: value
      }
    });
  };

  const addVariant = () => {
    const newVariant = {
      id: `variant_${Date.now()}`,
      name: `Variant ${variants.length + 1}`,
      values: {},
      files: []
    };
    setVariants([...variants, newVariant]);
  };

  const updateVariant = (index: number, field: string, value: any) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setVariants(newVariants);
  };

  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const handleFilesUploaded = (variantIndex: number, files: File[]) => {
    const newVariants = [...variants];
    const uploadedFiles = files.map(file => ({
      name: file.name,
      path: `/uploads/configurations/${file.name}`,
      format: file.name.split('.').pop()?.toUpperCase() || 'UNKNOWN',
      size: file.size
    }));
    
    newVariants[variantIndex].files = [...newVariants[variantIndex].files, ...uploadedFiles];
    setVariants(newVariants);
    
    toast({
      title: "Files Added",
      description: `${files.length} CAD file(s) added to variant`,
    });
  };

  const saveConfiguration = () => {
    if (!configName || Object.keys(parameters).length === 0) {
      toast({
        title: "Validation Error",
        description: "Please provide a name and at least one parameter",
        variant: "destructive",
      });
      return;
    }

    const configData = {
      productId: parseInt(productId!),
      name: configName,
      description: configDescription,
      parameters,
      variants,
      isActive: true
    };

    createConfigMutation.mutate(configData);
  };

  if (!product) {
    return (
      <div className="min-h-screen bg-white dark:bg-black pt-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <div className="text-lg">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black pt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link href={`/companies/${product.companyId}/customize`}>
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Company Management
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Configure {product.name}
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            Set up parameters and variants for this product
          </p>
        </div>

        <div className="space-y-8">
          {/* Basic Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Configuration Name</Label>
                <Input
                  id="name"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                  placeholder="e.g., Size and Material Options"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={configDescription}
                  onChange={(e) => setConfigDescription(e.target.value)}
                  placeholder="Describe what can be configured"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Parameters */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-4">
                <Input
                  value={newParamName}
                  onChange={(e) => setNewParamName(e.target.value)}
                  placeholder="Parameter name"
                  className="flex-1"
                />
                <Select value={newParamType} onValueChange={setNewParamType}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="select">Select</SelectItem>
                    <SelectItem value="boolean">Boolean</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={addParameter}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {Object.entries(parameters).map(([name, param]: [string, any]) => (
                <div key={name} className="border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-medium">{param.label}</h3>
                    <Button variant="outline" size="sm" onClick={() => removeParameter(name)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  {param.type === 'select' && (
                    <div>
                      <Label>Options (comma-separated)</Label>
                      <Input
                        value={param.options?.join(', ') || ''}
                        onChange={(e) => updateParameter(name, 'options', e.target.value.split(', ').filter(Boolean))}
                        placeholder="Option 1, Option 2, Option 3"
                      />
                    </div>
                  )}
                  
                  {param.type === 'number' && (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label>Min</Label>
                        <Input
                          type="number"
                          value={param.min || ''}
                          onChange={(e) => updateParameter(name, 'min', parseFloat(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label>Max</Label>
                        <Input
                          type="number"
                          value={param.max || ''}
                          onChange={(e) => updateParameter(name, 'max', parseFloat(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label>Unit</Label>
                        <Input
                          value={param.unit || ''}
                          onChange={(e) => updateParameter(name, 'unit', e.target.value)}
                          placeholder="mm, kg, etc."
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Variants */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Product Variants</CardTitle>
                <Button onClick={addVariant}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Variant
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {variants.map((variant, index) => (
                <div key={variant.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-4">
                    <Input
                      value={variant.name}
                      onChange={(e) => updateVariant(index, 'name', e.target.value)}
                      placeholder="Variant name"
                      className="max-w-xs"
                    />
                    <Button variant="outline" size="sm" onClick={() => removeVariant(index)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <Label>Parameter Values</Label>
                      {Object.keys(parameters).map(paramName => (
                        <div key={paramName} className="flex items-center gap-2 mt-2">
                          <Label className="w-24">{paramName}:</Label>
                          <Input
                            value={variant.values[paramName] || ''}
                            onChange={(e) => {
                              const newValues = { ...variant.values, [paramName]: e.target.value };
                              updateVariant(index, 'values', newValues);
                            }}
                            placeholder="Value"
                          />
                        </div>
                      ))}
                    </div>
                    
                    <div>
                      <Label>CAD Files</Label>
                      <DragDropUpload
                        onFilesUploaded={(files) => handleFilesUploaded(index, files)}
                        accept=".step,.stp,.stl,.dwg,.iges,.igs"
                        maxFiles={10}
                        className="mt-2"
                      />
                      {variant.files.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {variant.files.map((file: any, fileIndex: number) => (
                            <div key={fileIndex} className="text-sm text-gray-600 dark:text-gray-400">
                              {file.name} ({file.format})
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={saveConfiguration} disabled={createConfigMutation.isPending}>
              <Settings className="w-4 h-4 mr-2" />
              {createConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}