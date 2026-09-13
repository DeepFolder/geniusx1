import { useState, useEffect, useRef } from "react";
import { UnitMath } from "@/components/chat/MathHelpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Box, 
  Settings, 
  Download, 
  ShoppingCart, 
  Palette, 
  Ruler, 
  Zap,
  Eye,
  RotateCcw,
  Save,
  Share2,
  Calculator,
  Package,
  Layers,
  Grid3x3,
  Maximize,
  Move3d
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ConfigurationOption {
  id: string;
  name: string;
  type: 'number' | 'select' | 'boolean' | 'color' | 'material';
  value: any;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string; price?: number }[];
  unit?: string;
  description?: string;
  priceModifier?: number;
  inventoryImpact?: string;
}

interface Product3DModel {
  id: string;
  name: string;
  basePrice: number;
  baseMaterial: string;
  dimensions: { width: number; height: number; depth: number };
  configurations: ConfigurationOption[];
  availableFinishes: string[];
  inventoryStatus: {
    inStock: boolean;
    quantity: number;
    leadTime: string;
    suppliers: string[];
  };
  specifications: Record<string, string>;
  certifications: string[];
}

interface Advanced3DConfiguratorProps {
  productId: number;
  companyId: number;
}

export default function Advanced3DConfigurator({ productId, companyId }: Advanced3DConfiguratorProps) {
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedConfiguration, setSelectedConfiguration] = useState<Record<string, any>>({});
  const [currentPrice, setCurrentPrice] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<'3d' | 'technical' | 'cutaway'>('3d');
  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [selectedFinish, setSelectedFinish] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [showInventory, setShowInventory] = useState(false);

  // Fetch product 3D model data
  const { data: product, isLoading } = useQuery<Product3DModel>({
    queryKey: ['/api/products', productId, '3d-model'],
  });

  // Fetch real-time pricing
  const { data: pricing } = useQuery({
    queryKey: ['/api/pricing', productId, selectedConfiguration, quantity],
    enabled: Object.keys(selectedConfiguration).length > 0,
    refetchInterval: 10000, // Update pricing every 10 seconds
  });

  // Fetch inventory status
  const { data: inventory } = useQuery({
    queryKey: ['/api/inventory', productId, selectedConfiguration],
    enabled: Object.keys(selectedConfiguration).length > 0,
    refetchInterval: 30000, // Update inventory every 30 seconds
  });

  // Generate 3D model mutation
  const generate3DModelMutation = useMutation({
    mutationFn: async (config: any) => {
      return apiRequest('/api/3d/generate', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          configuration: config,
          material: selectedMaterial,
          finish: selectedFinish,
          viewMode
        }),
      });
    },
    onSuccess: (data) => {
      // Update 3D view with new model
      load3DModel(data.modelUrl);
    },
  });

  // Save configuration mutation
  const saveConfigurationMutation = useMutation({
    mutationFn: async (config: any) => {
      return apiRequest('/api/configurations', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          configuration: config,
          price: currentPrice,
          quantity,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/configurations'] });
    },
  });

  // Initialize 3D viewer
  useEffect(() => {
    if (!canvasRef.current || !product) return;

    initializeThreeJS();
    loadDefaultModel();
  }, [product]);

  // Update price when configuration changes
  useEffect(() => {
    if (!product) return;

    let price = product.basePrice;
    
    Object.entries(selectedConfiguration).forEach(([key, value]) => {
      const option = product.configurations.find(c => c.id === key);
      if (option?.priceModifier) {
        price += option.priceModifier * (typeof value === 'number' ? value : 1);
      }
    });

    setCurrentPrice(price * quantity);
  }, [selectedConfiguration, quantity, product]);

  const initializeThreeJS = () => {
    if (!canvasRef.current) return;

    try {
      // Initialize Three.js scene
      const canvas = canvasRef.current;
      const scene = new (window as any).THREE.Scene();
      const camera = new (window as any).THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
      const renderer = new (window as any).THREE.WebGLRenderer({ canvas, antialias: true });
      
      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = (window as any).THREE.PCFSoftShadowMap;

    // Add lights
    const ambientLight = new (window as any).THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new (window as any).THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Add grid
    const gridHelper = new (window as any).THREE.GridHelper(10, 10);
    scene.add(gridHelper);

    // Position camera
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);

    // Add orbit controls
    const controls = new (window as any).THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

      // Store references
      (canvas as any).scene = scene;
      (canvas as any).camera = camera;
      (canvas as any).renderer = renderer;
      (canvas as any).controls = controls;
    } catch (err) {
      console.error('WebGL initialization error in configurator:', err);
      // Silently fail - 3D viewer is optional
    }
  };

  const loadDefaultModel = async () => {
    if (!product?.id) return;

    try {
      const response = await fetch(`/api/3d/models/${product.id}/default.glb`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        load3DModel(url);
      }
    } catch (error) {
      console.error('Failed to load default 3D model:', error);
    }
  };

  const load3DModel = (modelUrl: string) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const scene = (canvas as any).scene;
    const loader = new (window as any).THREE.GLTFLoader();

    // Remove existing model
    const existingModel = scene.getObjectByName('product-model');
    if (existingModel) {
      scene.remove(existingModel);
    }

    // Load new model
    loader.load(modelUrl, (gltf: any) => {
      const model = gltf.scene;
      model.name = 'product-model';
      
      // Scale model to fit scene
      const box = new (window as any).THREE.Box3().setFromObject(model);
      const size = box.getSize(new (window as any).THREE.Vector3());
      const maxSize = Math.max(size.x, size.y, size.z);
      const scale = 3 / maxSize;
      model.scale.setScalar(scale);

      // Center model
      box.setFromObject(model);
      const center = box.getCenter(new (window as any).THREE.Vector3());
      model.position.sub(center);

      scene.add(model);
    });
  };

  const handleConfigurationChange = (optionId: string, value: any) => {
    setSelectedConfiguration(prev => ({
      ...prev,
      [optionId]: value
    }));
  };

  const handleGenerate3DModel = () => {
    setIsGenerating(true);
    generate3DModelMutation.mutate(selectedConfiguration);
  };

  const handleSaveConfiguration = () => {
    saveConfigurationMutation.mutate(selectedConfiguration);
  };

  const handleDownloadModel = async () => {
    try {
      const response = await apiRequest('/api/3d/export', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          configuration: selectedConfiguration,
          format: 'step', // or 'obj', 'stl', etc.
        }),
      });

      // Download file
      const link = document.createElement('a');
      link.href = response.downloadUrl;
      link.download = `${product?.name}-configured.step`;
      link.click();
    } catch (error) {
      console.error('Failed to download model:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Box className="w-16 h-16 text-gray-400 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600 dark:text-gray-400">Loading 3D configurator...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">3D configurator not available for this product</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[800px]">
      {/* 3D Viewer */}
      <div className="lg:col-span-2">
        <Card className="h-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Box className="w-5 h-5" />
                <span>3D Configurator</span>
              </CardTitle>
              
              <div className="flex items-center space-x-2">
                <Button
                  variant={viewMode === '3d' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('3d')}
                >
                  <Move3d className="w-4 h-4 mr-1" />
                  3D
                </Button>
                <Button
                  variant={viewMode === 'technical' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('technical')}
                >
                  <Grid3x3 className="w-4 h-4 mr-1" />
                  Technical
                </Button>
                <Button
                  variant={viewMode === 'cutaway' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('cutaway')}
                >
                  <Layers className="w-4 h-4 mr-1" />
                  Cutaway
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 h-full">
            <div className="relative h-full">
              <canvas
                ref={canvasRef}
                className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"
              />
              
              {/* 3D Controls Overlay */}
              <div className="absolute top-4 left-4 space-y-2">
                <Button size="sm" variant="secondary" onClick={() => load3DModel('')}>
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Reset View
                </Button>
                <Button size="sm" variant="secondary">
                  <Maximize className="w-4 h-4 mr-1" />
                  Fullscreen
                </Button>
              </div>

              {/* Loading Overlay */}
              {(isGenerating || generate3DModelMutation.isPending) && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="text-center text-white">
                    <Box className="w-12 h-12 mx-auto mb-4 animate-spin" />
                    <p>Generating 3D model...</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuration Panel */}
      <div className="space-y-4 h-full overflow-y-auto">
        {/* Product Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{product.name}</CardTitle>
            <div className="flex items-center space-x-2">
              <Badge variant="outline">{product.baseMaterial}</Badge>
              <Badge variant={inventory?.inStock ? 'default' : 'destructive'}>
                {inventory?.inStock ? 'In Stock' : 'Out of Stock'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Base Price:</span>
                <span className="font-semibold">${product.basePrice.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Current Price:</span>
                <span className="font-bold text-lg text-green-600">${currentPrice.toLocaleString()}</span>
              </div>
              {inventory && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Lead Time:</span>
                  <span>{inventory.leadTime}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Configuration Options */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Settings className="w-5 h-5" />
              <span>Configuration</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="dimensions" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="dimensions">Dimensions</TabsTrigger>
                <TabsTrigger value="materials">Materials</TabsTrigger>
                <TabsTrigger value="features">Features</TabsTrigger>
              </TabsList>

              <TabsContent value="dimensions" className="space-y-4">
                {product.configurations
                  .filter(c => ['number'].includes(c.type))
                  .map((option) => (
                    <div key={option.id} className="space-y-2">
                      <Label className="text-sm font-medium">{option.name}</Label>
                      {option.description && (
                        <p className="text-xs text-gray-500">{option.description}</p>
                      )}
                      
                      {option.type === 'number' && (
                        <div className="space-y-2">
                          <Slider
                            value={[selectedConfiguration[option.id] || option.min || 0]}
                            onValueChange={(value) => handleConfigurationChange(option.id, value[0])}
                            max={option.max || 100}
                            min={option.min || 0}
                            step={option.step || 1}
                            className="w-full"
                          />
                          <div className="flex justify-between items-center">
                            <Input
                              type="number"
                              value={selectedConfiguration[option.id] || option.min || 0}
                              onChange={(e) => handleConfigurationChange(option.id, parseFloat(e.target.value))}
                              className="w-20 h-8"
                              min={option.min}
                              max={option.max}
                              step={option.step}
                            />
                            <span className="text-sm text-gray-500"><UnitMath unit={option.unit} /></span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
              </TabsContent>

              <TabsContent value="materials" className="space-y-4">
                <div className="space-y-2">
                  <Label>Material</Label>
                  <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="steel">Steel</SelectItem>
                      <SelectItem value="aluminum">Aluminum</SelectItem>
                      <SelectItem value="titanium">Titanium</SelectItem>
                      <SelectItem value="carbon-fiber">Carbon Fiber</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Finish</Label>
                  <Select value={selectedFinish} onValueChange={setSelectedFinish}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select finish" />
                    </SelectTrigger>
                    <SelectContent>
                      {product.availableFinishes.map((finish) => (
                        <SelectItem key={finish} value={finish}>
                          {finish}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="features" className="space-y-4">
                {product.configurations
                  .filter(c => ['select', 'boolean'].includes(c.type))
                  .map((option) => (
                    <div key={option.id} className="space-y-2">
                      <Label className="text-sm font-medium">{option.name}</Label>
                      
                      {option.type === 'select' && (
                        <Select
                          value={selectedConfiguration[option.id]}
                          onValueChange={(value) => handleConfigurationChange(option.id, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={`Select ${option.name.toLowerCase()}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {option.options?.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                                {opt.price && <span className="ml-2 text-green-600">+${opt.price}</span>}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      
                      {option.type === 'boolean' && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={selectedConfiguration[option.id] || false}
                            onChange={(e) => handleConfigurationChange(option.id, e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-sm">{option.description}</span>
                        </div>
                      )}
                    </div>
                  ))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Quantity & Actions */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Label htmlFor="quantity">Quantity:</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value))}
                  className="w-20"
                />
              </div>

              <div className="space-y-2">
                <Button
                  onClick={handleGenerate3DModel}
                  disabled={generate3DModelMutation.isPending}
                  className="w-full"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Generate 3D Model
                </Button>
                
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={handleSaveConfiguration}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Config
                  </Button>
                  <Button variant="outline" onClick={handleDownloadModel}>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
                
                <Button variant="secondary" className="w-full">
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Add to Cart
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Inventory Status */}
        {inventory && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Package className="w-5 h-5" />
                <span>Inventory Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Available:</span>
                  <Badge variant={inventory.inStock ? 'default' : 'destructive'}>
                    {inventory.quantity} units
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Lead Time:</span>
                  <span>{inventory.leadTime}</span>
                </div>
                <div className="flex justify-between">
                  <span>Suppliers:</span>
                  <span>{inventory.suppliers.length} available</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}