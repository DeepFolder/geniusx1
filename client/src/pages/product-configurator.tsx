import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Settings, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";

export default function ProductConfigurator() {
  const { productId } = useParams();
  const [selectedParams, setSelectedParams] = useState<Record<string, any>>({});
  const [availableVariants, setAvailableVariants] = useState<any[]>([]);

  const { data: product, isLoading: isLoadingProduct } = useQuery({
    queryKey: [`/api/products/${productId}`],
    enabled: !!productId,
  });

  const { data: configurations, isLoading: isLoadingConfigs } = useQuery({
    queryKey: [`/api/products/${productId}/configurations`],
    enabled: !!productId,
  });

  const downloadMutation = useMutation({
    mutationFn: async (variant: any) => {
      return apiRequest(`/api/products/${productId}/download-variant`, {
        method: 'POST',
        body: JSON.stringify({
          variantId: variant.id,
          selectedParameters: selectedParams,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Download Started",
        description: "Your CAD files are being prepared for download.",
      });
    },
    onError: () => {
      toast({
        title: "Download Failed",
        description: "Unable to download the selected configuration.",
        variant: "destructive",
      });
    },
  });

  const handleParameterChange = (paramKey: string, value: any) => {
    const newParams = { ...selectedParams, [paramKey]: value };
    setSelectedParams(newParams);
    
    // Filter variants based on selected parameters
    if (configurations && configurations[0]) {
      const config = configurations[0];
      const filteredVariants = config.variants.filter((variant: any) => {
        return Object.entries(newParams).every(([key, val]) => {
          return variant.values[key] === val || val === undefined || val === '';
        });
      });
      setAvailableVariants(filteredVariants);
    }
  };

  if (isLoadingProduct || isLoadingConfigs) {
    return (
      <div className="min-h-screen bg-white dark:bg-black pt-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <div className="text-lg">Loading configurator...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!product || !configurations || configurations.length === 0) {
    return (
      <div className="min-h-screen bg-white dark:bg-black pt-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">No Configuration Available</h2>
            <p className="text-gray-600 dark:text-gray-300">This product doesn't have a configurator set up yet.</p>
            <Link href="/products">
              <Button className="mt-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Products
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const configuration = configurations[0];

  return (
    <div className="min-h-screen bg-white dark:bg-black pt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link href="/products">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Products
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{product.name} Configurator</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">{configuration.description}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Configuration Panel */}
          <Card>
            <CardHeader>
              <CardTitle>Product Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(configuration.parameters).map(([key, param]: [string, any]) => (
                <div key={key} className="space-y-2">
                  <Label>{param.label}</Label>
                  {param.type === 'select' && (
                    <Select onValueChange={(value) => handleParameterChange(key, value)}>
                      <SelectTrigger>
                        <SelectValue placeholder={`Select ${param.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {param.options?.map((option: string) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {param.type === 'number' && (
                    <Input
                      type="number"
                      min={param.min}
                      max={param.max}
                      placeholder={`Enter ${param.label}${param.unit ? ` (${param.unit})` : ''}`}
                      onChange={(e) => handleParameterChange(key, parseFloat(e.target.value))}
                    />
                  )}
                  {param.type === 'boolean' && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        onCheckedChange={(checked) => handleParameterChange(key, checked)}
                      />
                      <span>{param.label}</span>
                    </div>
                  )}
                  {param.type === 'text' && (
                    <Input
                      placeholder={`Enter ${param.label}`}
                      onChange={(e) => handleParameterChange(key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Available Variants */}
          <Card>
            <CardHeader>
              <CardTitle>Available Variants</CardTitle>
            </CardHeader>
            <CardContent>
              {availableVariants.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Select parameters to see available variants
                </div>
              ) : (
                <div className="space-y-4">
                  {availableVariants.map((variant) => (
                    <div key={variant.id} className="border rounded-lg p-4">
                      <h3 className="font-medium mb-2">{variant.name}</h3>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {Object.entries(variant.values).map(([key, value]) => (
                          <Badge key={key} variant="outline">
                            {key}: {String(value)}
                          </Badge>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Available Files:</h4>
                        {variant.files.map((file: any, index: number) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm">{file.name} ({file.format})</span>
                            <Button
                              size="sm"
                              onClick={() => downloadMutation.mutate(variant)}
                              disabled={downloadMutation.isPending}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}