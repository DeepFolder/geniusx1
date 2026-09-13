import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Settings,
  Mail,
  Lock,
  Shield,
  Briefcase,
  Building2,
  CreditCard,
  Trash2,
  AlertTriangle,
  Globe,
  User as UserIcon
} from "lucide-react";
import { useWebSearchEngine } from "@/hooks/use-web-search-engine";
import { WEB_SEARCH_ENGINES, WEB_SEARCH_ENGINE_LIST, isValidEngineId } from "@/lib/web-search-engines";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Link } from "wouter";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const changeEmailSchema = z.object({
  newEmail: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required to change email"),
});

const professions = [
  "Mechanical Engineer", "Electrical Engineer", "Software Developer", "Product Manager", 
  "Purchasing Agent", "Technical Sales", "CAD Designer", "R&D Specialist", "Academic/Student", "Other"
];

export default function MySpace() {
  const { user, refetch } = useAuth();
  const { toast } = useToast();
  const { override: webSearchOverride, autoDetectedId: webSearchAutoId, setOverride: setWebSearchOverride } = useWebSearchEngine();
  const [editingProfile, setEditingProfile] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const [profileValues, setProfileValues] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    professional: user?.professional || "",
    companyName: user?.companyName || "",
  });

  useEffect(() => {
    if (user) {
      setProfileValues({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        professional: user.professional || "",
        companyName: user.companyName || "",
      });
    }
  }, [user]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<User>) => {
      return apiRequest("/api/myspace/profile", {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: "Profile updated!", description: "Your changes have been saved." });
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update profile.", variant: "destructive" });
    },
  });

  const passwordForm = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: z.infer<typeof changePasswordSchema>) => {
      return apiRequest(`/api/user/change-password`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: "Password changed successfully!" });
      passwordForm.reset();
      setPasswordDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to change password.", variant: "destructive" });
    },
  });

  const emailForm = useForm<z.infer<typeof changeEmailSchema>>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: {
      newEmail: "",
      password: "",
    },
  });

  const changeEmailMutation = useMutation({
    mutationFn: async (data: z.infer<typeof changeEmailSchema>) => {
      return apiRequest(`/api/user/change-email`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: "Email changed successfully!", description: "Your login email has been updated." });
      emailForm.reset();
      setEmailDialogOpen(false);
      refetch();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error?.message || "Failed to change email.", 
        variant: "destructive" 
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/user/delete-account`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({ title: "Account deleted", description: "Your account has been permanently deleted." });
      window.location.href = "/";
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete account.", variant: "destructive" });
    },
  });

  const handleSaveProfile = async () => {
    try {
      await updateProfileMutation.mutateAsync(profileValues);
      setEditingProfile(false);
    } catch (error) {
      console.error('Failed to save profile:', error);
    }
  };

  const handleCancelProfile = () => {
    setProfileValues({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      professional: user?.professional || "",
      companyName: user?.companyName || "",
    });
    setEditingProfile(false);
  };

  const handleDeleteAccount = () => {
    if (deleteConfirmText === "DELETE") {
      deleteAccountMutation.mutate();
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-4">
      <div className="max-w-xl mx-auto px-4 py-4">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <UserIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {profileValues.firstName ? `${profileValues.firstName} ${profileValues.lastName}` : 'Your Account'}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-xs">Manage your account settings</p>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          
          {/* Profile Section */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Profile</h2>
              <button
                onClick={() => editingProfile ? handleCancelProfile() : setEditingProfile(true)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={editingProfile ? "Cancel" : "Edit profile"}
              >
                <Settings className={`w-5 h-5 ${editingProfile ? 'text-red-500 animate-spin' : 'text-gray-500 dark:text-gray-400'}`} />
              </button>
            </div>

            {editingProfile ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-700 dark:text-gray-300 font-medium">Name</Label>
                    <Input
                      value={profileValues.firstName}
                      onChange={(e) => setProfileValues(prev => ({ ...prev, firstName: e.target.value }))}
                      placeholder="First name"
                      className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 h-11"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-700 dark:text-gray-300 font-medium">Surname</Label>
                    <Input
                      value={profileValues.lastName}
                      onChange={(e) => setProfileValues(prev => ({ ...prev, lastName: e.target.value }))}
                      placeholder="Last name"
                      className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 h-11"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-gray-700 dark:text-gray-300 font-medium">Profession</Label>
                  <select 
                    className="mt-1.5 flex h-11 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={profileValues.professional}
                    onChange={(e) => setProfileValues(prev => ({ ...prev, professional: e.target.value }))}
                  >
                    <option value="">Select profession</option>
                    {professions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-gray-700 dark:text-gray-300 font-medium">Company</Label>
                  <Input
                    value={profileValues.companyName}
                    onChange={(e) => setProfileValues(prev => ({ ...prev, companyName: e.target.value }))}
                    placeholder="Company name"
                    className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 h-11"
                  />
                </div>
                <Button
                  onClick={handleSaveProfile}
                  disabled={updateProfileMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 shadow-md"
                >
                  {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <UserIcon className="w-5 h-5 text-gray-400" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Name</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {profileValues.firstName || "Not set"} {profileValues.lastName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Email</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <Briefcase className="w-5 h-5 text-gray-400" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Profession</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {profileValues.professional || "Not specified"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <Building2 className="w-5 h-5 text-gray-400" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Company</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {profileValues.companyName || "Not specified"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Subscription Section */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Subscription</h2>
            <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <CreditCard className="w-5 h-5 text-amber-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Free Plan</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Premium plans coming soon</p>
              </div>
            </div>
          </div>

          {/* Settings Section */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Settings</h2>
            <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <Globe className="w-5 h-5 text-gray-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <Label htmlFor="web-search-engine" className="text-sm font-medium text-gray-900 dark:text-white">
                  Web search engine
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Used when DeepSearch falls back to a web search for a product.
                </p>
                <select
                  id="web-search-engine"
                  className="flex h-10 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={webSearchOverride ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') setWebSearchOverride(null);
                    else if (isValidEngineId(v)) setWebSearchOverride(v);
                  }}
                  data-testid="select-web-search-engine"
                >
                  <option value="">Auto-detect (currently: {WEB_SEARCH_ENGINES[webSearchAutoId].name})</option>
                  {WEB_SEARCH_ENGINE_LIST.map((eng) => (
                    <option key={eng.id} value={eng.id}>{eng.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Security Section */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Security</h2>
            <button
              onClick={() => setPasswordDialogOpen(true)}
              className="w-full flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
            >
              <Lock className="w-5 h-5 text-gray-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Change Password</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Update your password</p>
              </div>
            </button>
            
            {/* Email change - available to company admins */}
            {user.role === 'company_admin' && (
              <button
                onClick={() => setEmailDialogOpen(true)}
                className="w-full flex items-center gap-3 p-4 mt-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <Mail className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Change Email</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Update your login email address</p>
                </div>
              </button>
            )}
            
            {user.companyId && (
              <Link href={`/company/${user.companyId}`}>
                <button className="w-full flex items-center gap-3 p-4 mt-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors text-left">
                  <Building2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Company Page</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Manage your company profile, products, and settings</p>
                  </div>
                </button>
              </Link>
            )}

            {user.role === 'admin' && (
              <Link href="/admin">
                <button className="w-full flex items-center gap-3 p-4 mt-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors text-left">
                  <Shield className="w-5 h-5 text-purple-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Admin Dashboard</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Access platform administration</p>
                  </div>
                </button>
              </Link>
            )}
          </div>

          {/* Danger Zone */}
          <div className="p-6">
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-4">Danger Zone</h2>
            <button
              onClick={() => setDeleteDialogOpen(true)}
              className="w-full flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-left"
            >
              <Trash2 className="w-5 h-5 text-red-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">Delete Account</p>
                <p className="text-xs text-red-500 dark:text-red-400">Permanently delete your account and data</p>
              </div>
            </button>
          </div>

        </div>
      </div>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
          </DialogHeader>
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(v => changePasswordMutation.mutate(v))} className="space-y-4">
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl><Input type="password" {...field} className="h-11" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl><Input type="password" {...field} className="h-11" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl><Input type="password" {...field} className="h-11" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={changePasswordMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                  {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Change Email Dialog - for company admins */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Email</DialogTitle>
            <DialogDescription>Enter your new email address and current password to confirm.</DialogDescription>
          </DialogHeader>
          <Form {...emailForm}>
            <form onSubmit={emailForm.handleSubmit(v => changeEmailMutation.mutate(v))} className="space-y-4">
              <FormField
                control={emailForm.control}
                name="newEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Email Address</FormLabel>
                    <FormControl><Input type="email" placeholder="your@newemail.com" {...field} className="h-11" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={emailForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl><Input type="password" placeholder="Enter your password to confirm" {...field} className="h-11" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={changeEmailMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                  {changeEmailMutation.isPending ? "Changing..." : "Change Email"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. All your data will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-300">
                To confirm deletion, please type <strong>DELETE</strong> below:
              </p>
            </div>
            <Input 
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="border-red-300 focus:ring-red-500 h-11"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => {
              setDeleteDialogOpen(false);
              setDeleteConfirmText("");
            }}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== "DELETE" || deleteAccountMutation.isPending}
            >
              {deleteAccountMutation.isPending ? "Deleting..." : "Delete My Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
