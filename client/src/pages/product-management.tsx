import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Package, Plus, Edit2, Trash2, MoreVertical, Folder, Grid3X3, Tags, Box } from "lucide-react";
import type { ProductCategory, ProductGroup, Product } from "@shared/schema";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  companyId: number;
}

export default function ProductManagement() {
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ProductGroup | null>(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    color: "#3B82F6",
    icon: "Package",
    displayOrder: 0
  });
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    categoryId: null as number | null,
    color: "#10B981",
    displayOrder: 0
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get current user
  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/me"],
  });

  // Fetch product categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<ProductCategory[]>({
    queryKey: [`/api/companies/${user?.companyId}/categories`],
    enabled: !!user?.companyId,
  });

  // Fetch product groups
  const { data: groups = [], isLoading: groupsLoading } = useQuery<ProductGroup[]>({
    queryKey: [`/api/companies/${user?.companyId}/groups`],
    enabled: !!user?.companyId,
  });

  // Fetch products
  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: [`/api/companies/${user?.companyId}/products`],
    enabled: !!user?.companyId,
  });

  // Category mutations
  const createCategoryMutation = useMutation({
    mutationFn: (data: typeof categoryForm) => apiRequest(`/api/categories`, {
      method: "POST",
      body: data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${user?.companyId}/categories`] });
      setShowCategoryDialog(false);
      setCategoryForm({ name: "", description: "", color: "#3B82F6", icon: "Package", displayOrder: 0 });
      toast({ title: "Success", description: "Category created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create category", variant: "destructive" });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof categoryForm> }) =>
      apiRequest(`/api/categories/${id}`, {
        method: "PUT",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${user?.companyId}/categories`] });
      setSelectedCategory(null);
      toast({ title: "Success", description: "Category updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update category", variant: "destructive" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${user?.companyId}/categories`] });
      toast({ title: "Success", description: "Category deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete category", variant: "destructive" });
    },
  });

  // Group mutations
  const createGroupMutation = useMutation({
    mutationFn: (data: typeof groupForm) => apiRequest(`/api/groups`, {
      method: "POST",
      body: data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${user?.companyId}/groups`] });
      setShowGroupDialog(false);
      setGroupForm({ name: "", description: "", categoryId: null, color: "#10B981", displayOrder: 0 });
      toast({ title: "Success", description: "Group created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create group", variant: "destructive" });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof groupForm> }) =>
      apiRequest(`/api/groups/${id}`, {
        method: "PUT",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${user?.companyId}/groups`] });
      setSelectedGroup(null);
      toast({ title: "Success", description: "Group updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update group", variant: "destructive" });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/groups/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${user?.companyId}/groups`] });
      toast({ title: "Success", description: "Group deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete group", variant: "destructive" });
    },
  });

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    createCategoryMutation.mutate(categoryForm);
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    createGroupMutation.mutate(groupForm);
  };

  const iconOptions = [
    { value: "Package", label: "Package" },
    { value: "Box", label: "Box" },
    { value: "Grid3X3", label: "Grid" },
    { value: "Folder", label: "Folder" },
    { value: "Tags", label: "Tags" },
  ];

  const getProductsByCategory = (categoryId: number) => {
    return products.filter(product => product.categoryId === categoryId);
  };

  const getProductsByGroup = (groupId: number) => {
    return products.filter(product => product.groupId === groupId);
  };

  const getGroupsByCategory = (categoryId: number) => {
    return groups.filter(group => group.categoryId === categoryId);
  };

  if (categoriesLoading || groupsLoading || productsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-black p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-black">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 dark:from-blue-800 dark:via-purple-800 dark:to-blue-900 py-16">
        <div className="max-w-7xl mx-auto px-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Product Management</h1>
          <p className="text-xl text-blue-100 dark:text-blue-200">
            Organize your products with categories and groups for better customer experience
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8 -mt-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
            <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Categories</CardTitle>
                  <Folder className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{categories.length}</div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Organize your products
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Groups</CardTitle>
                  <Grid3X3 className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{groups.length}</div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Group similar products
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                  <Package className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{products.length}</div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Products in catalog
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Organization Summary</CardTitle>
                <CardDescription>
                  Overview of your product organization structure
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {categories.map((category) => {
                    const categoryProducts = getProductsByCategory(category.id);
                    const categoryGroups = getGroupsByCategory(category.id);
                    
                    return (
                      <div key={category.id} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded"
                              style={{ backgroundColor: category.color }}
                            />
                            <h3 className="font-semibold">{category.name}</h3>
                          </div>
                          <div className="flex gap-2">
                            <Badge variant="secondary">{categoryProducts.length} products</Badge>
                            <Badge variant="outline">{categoryGroups.length} groups</Badge>
                          </div>
                        </div>
                        
                        {categoryGroups.length > 0 && (
                          <div className="ml-6 space-y-2">
                            {categoryGroups.map((group) => {
                              const groupProducts = getProductsByGroup(group.id);
                              return (
                                <div key={group.id} className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded"
                                      style={{ backgroundColor: group.color }}
                                    />
                                    <span>{group.name}</span>
                                  </div>
                                  <Badge variant="secondary" className="text-xs">
                                    {groupProducts.length} products
                                  </Badge>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Product Categories</h2>
              <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Category
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Category</DialogTitle>
                    <DialogDescription>
                      Add a new product category to organize your products
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateCategory} className="space-y-4">
                    <div>
                      <Label htmlFor="categoryName">Name</Label>
                      <Input
                        id="categoryName"
                        value={categoryForm.name}
                        onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                        placeholder="Category name"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="categoryDescription">Description</Label>
                      <Textarea
                        id="categoryDescription"
                        value={categoryForm.description}
                        onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                        placeholder="Category description"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="categoryColor">Color</Label>
                        <Input
                          id="categoryColor"
                          type="color"
                          value={categoryForm.color}
                          onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="categoryIcon">Icon</Label>
                        <Select
                          value={categoryForm.icon}
                          onValueChange={(value) => setCategoryForm({ ...categoryForm, icon: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {iconOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="categoryOrder">Display Order</Label>
                      <Input
                        id="categoryOrder"
                        type="number"
                        value={categoryForm.displayOrder}
                        onChange={(e) => setCategoryForm({ ...categoryForm, displayOrder: parseInt(e.target.value) || 0 })}
                        min="0"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setShowCategoryDialog(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createCategoryMutation.isPending}>
                        {createCategoryMutation.isPending ? "Creating..." : "Create Category"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categories.map((category) => {
                const categoryProducts = getProductsByCategory(category.id);
                const categoryGroups = getGroupsByCategory(category.id);
                
                return (
                  <Card key={category.id} className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: category.color }}
                          />
                          <CardTitle className="text-lg">{category.name}</CardTitle>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedCategory(category)}>
                              <Edit2 className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteCategoryMutation.mutate(category.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {category.description && (
                        <CardDescription>{category.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2 mb-4">
                        <Badge variant="secondary">{categoryProducts.length} products</Badge>
                        <Badge variant="outline">{categoryGroups.length} groups</Badge>
                      </div>
                      
                      {categoryGroups.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Groups:</p>
                          <div className="flex flex-wrap gap-1">
                            {categoryGroups.slice(0, 3).map((group) => (
                              <Badge key={group.id} variant="outline" className="text-xs">
                                {group.name}
                              </Badge>
                            ))}
                            {categoryGroups.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{categoryGroups.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="groups">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Product Groups</h2>
              <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Group
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Group</DialogTitle>
                    <DialogDescription>
                      Add a new product group to organize products within categories
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateGroup} className="space-y-4">
                    <div>
                      <Label htmlFor="groupName">Name</Label>
                      <Input
                        id="groupName"
                        value={groupForm.name}
                        onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                        placeholder="Group name"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="groupDescription">Description</Label>
                      <Textarea
                        id="groupDescription"
                        value={groupForm.description}
                        onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                        placeholder="Group description"
                      />
                    </div>
                    <div>
                      <Label htmlFor="groupCategory">Category</Label>
                      <Select
                        value={groupForm.categoryId?.toString() || ""}
                        onValueChange={(value) => setGroupForm({ ...groupForm, categoryId: value ? parseInt(value) : null })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No category</SelectItem>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id.toString()}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="groupColor">Color</Label>
                        <Input
                          id="groupColor"
                          type="color"
                          value={groupForm.color}
                          onChange={(e) => setGroupForm({ ...groupForm, color: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="groupOrder">Display Order</Label>
                        <Input
                          id="groupOrder"
                          type="number"
                          value={groupForm.displayOrder}
                          onChange={(e) => setGroupForm({ ...groupForm, displayOrder: parseInt(e.target.value) || 0 })}
                          min="0"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setShowGroupDialog(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createGroupMutation.isPending}>
                        {createGroupMutation.isPending ? "Creating..." : "Create Group"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groups.map((group) => {
                const groupProducts = getProductsByGroup(group.id);
                const parentCategory = categories.find(cat => cat.id === group.categoryId);
                
                return (
                  <Card key={group.id} className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: group.color }}
                          />
                          <CardTitle className="text-lg">{group.name}</CardTitle>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedGroup(group)}>
                              <Edit2 className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteGroupMutation.mutate(group.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {group.description && (
                        <CardDescription>{group.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {parentCategory && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Category:</span>
                            <Badge variant="outline">{parentCategory.name}</Badge>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600 dark:text-gray-400">Products:</span>
                          <Badge variant="secondary">{groupProducts.length}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="hierarchy">
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Product Hierarchy</CardTitle>
                <CardDescription>
                  Visual representation of your product organization structure
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {categories.map((category) => {
                    const categoryProducts = getProductsByCategory(category.id);
                    const categoryGroups = getGroupsByCategory(category.id);
                    
                    return (
                      <div key={category.id} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50">
                        <div className="flex items-center gap-3 mb-4">
                          <Folder className="w-5 h-5 text-blue-600" />
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded"
                              style={{ backgroundColor: category.color }}
                            />
                            <h3 className="text-lg font-semibold">{category.name}</h3>
                          </div>
                          <Badge variant="secondary">{categoryProducts.length} products</Badge>
                        </div>
                        
                        {categoryGroups.length > 0 && (
                          <div className="ml-8 space-y-3">
                            {categoryGroups.map((group) => {
                              const groupProducts = getProductsByGroup(group.id);
                              return (
                                <div key={group.id} className="flex items-center gap-3">
                                  <Grid3X3 className="w-4 h-4 text-green-600" />
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded"
                                      style={{ backgroundColor: group.color }}
                                    />
                                    <span className="font-medium">{group.name}</span>
                                  </div>
                                  <Badge variant="outline" className="text-xs">
                                    {groupProducts.length} products
                                  </Badge>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        
                        {categoryProducts.length > 0 && (
                          <div className="ml-8 mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                              {categoryProducts.slice(0, 8).map((product) => (
                                <div key={product.id} className="flex items-center gap-2 text-sm p-2 bg-white dark:bg-gray-600 rounded">
                                  <Box className="w-3 h-3 text-purple-600" />
                                  <span className="truncate">{product.name}</span>
                                </div>
                              ))}
                              {categoryProducts.length > 8 && (
                                <div className="flex items-center gap-2 text-sm p-2 bg-gray-100 dark:bg-gray-500 rounded text-gray-600 dark:text-gray-300">
                                  <span>+{categoryProducts.length - 8} more</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {categories.length === 0 && (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No categories created yet. Start by adding your first product category.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}