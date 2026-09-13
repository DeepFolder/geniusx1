import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { 
  ArrowLeft, 
  User,
  Mail,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Shield,
  Save,
  Building2
} from "lucide-react";

export default function AccountSettingsPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showEmailPassword, setShowEmailPassword] = useState(false);

  const companyId = id ? parseInt(id) : NaN;
  const isValidCompanyId = Number.isFinite(companyId) && companyId > 0;
  
  const canEdit = user && isValidCompanyId && (user.role === 'admin' || user.companyId === companyId);

  const { data: company, isLoading } = useQuery({
    queryKey: [`/api/companies/${companyId}`],
    enabled: isValidCompanyId && !!canEdit,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/auth?tab=login");
      return;
    }
    
    if (!isValidCompanyId) {
      setLocation("/companies");
      return;
    }
    
    if (!canEdit) {
      toast({
        title: "Access denied",
        description: "You don't have permission to access this page",
        variant: "destructive",
      });
      setLocation(`/companies/${companyId}`);
      return;
    }
  }, [isAuthenticated, canEdit, companyId, isValidCompanyId, setLocation, toast]);

  useEffect(() => {
    if (user) {
      setAdminFirstName(user.firstName || "");
      setAdminLastName(user.lastName || "");
    }
  }, [user]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string }) => {
      await apiRequest('/api/myspace/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Name updated",
        description: "Your name has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update name",
        variant: "destructive",
      });
    },
  });

  const changeEmailMutation = useMutation({
    mutationFn: async (data: { newEmail: string; currentPassword: string }) => {
      const response = await apiRequest('/api/user/change-email', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Email updated",
        description: "Your login email has been changed successfully.",
      });
      setNewEmail("");
      setEmailPassword("");
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
    onError: (error) => {
      toast({
        title: "Email change failed",
        description: error instanceof Error ? error.message : "Failed to change email",
        variant: "destructive",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
      await apiRequest('/api/user/change-password', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error) => {
      toast({
        title: "Password change failed",
        description: error instanceof Error ? error.message : "Failed to change password",
        variant: "destructive",
      });
    },
  });

  const handleNameUpdate = () => {
    if (!adminFirstName.trim() || !adminLastName.trim()) {
      toast({
        title: "Validation error",
        description: "First name and last name are required",
        variant: "destructive",
      });
      return;
    }
    updateProfileMutation.mutate({ firstName: adminFirstName.trim(), lastName: adminLastName.trim() });
  };

  const handleEmailChange = () => {
    if (!newEmail.trim() || !emailPassword) {
      toast({
        title: "Validation error",
        description: "New email and current password are required",
        variant: "destructive",
      });
      return;
    }
    changeEmailMutation.mutate({ newEmail: newEmail.trim(), currentPassword: emailPassword });
  };

  const handlePasswordChange = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: "Validation error",
        description: "All password fields are required",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: "Validation error",
        description: "New passwords don't match",
        variant: "destructive",
      });
      return;
    }
    if (newPassword.length < 8) {
      toast({
        title: "Validation error",
        description: "New password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword, confirmPassword });
  };

  if (!isAuthenticated || !canEdit || !isValidCompanyId) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-black dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="animate-pulse space-y-6">
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
                <div className="space-y-4">
                  <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-black dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Company not found</h1>
            <Button onClick={() => setLocation("/companies")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Companies
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-black dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          
          <div className="flex items-center justify-between">
            <Button 
              variant="ghost" 
              onClick={() => setLocation(`/companies/${companyId}`)}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Profile
            </Button>
            <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <Building2 className="h-4 w-4" />
              <span>{company.name}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 border-b border-gray-200 dark:border-gray-600">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">Account Settings</h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Manage your personal account credentials</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-8">
              
              <div className="space-y-4">
                <div className="flex items-center space-x-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <User className="h-5 w-5 text-blue-500" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Display Name</h2>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Update the name displayed for your admin account
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="adminFirstName" className="text-gray-700 dark:text-gray-300">First Name</Label>
                    <Input
                      id="adminFirstName"
                      data-testid="input-admin-first-name"
                      value={adminFirstName}
                      onChange={(e) => setAdminFirstName(e.target.value)}
                      placeholder="Enter first name"
                      className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminLastName" className="text-gray-700 dark:text-gray-300">Last Name</Label>
                    <Input
                      id="adminLastName"
                      data-testid="input-admin-last-name"
                      value={adminLastName}
                      onChange={(e) => setAdminLastName(e.target.value)}
                      placeholder="Enter last name"
                      className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    data-testid="button-update-name"
                    onClick={handleNameUpdate}
                    disabled={updateProfileMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateProfileMutation.isPending ? "Updating..." : "Update Name"}
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <Mail className="h-5 w-5 text-green-500" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Login Email</h2>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Change the email address used to sign in to your account
                </p>
                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Current email: <span className="font-medium text-gray-900 dark:text-white">{user?.email}</span>
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newEmail" className="text-gray-700 dark:text-gray-300">New Email Address</Label>
                    <Input
                      id="newEmail"
                      type="email"
                      data-testid="input-new-email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Enter new email address"
                      className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emailPassword" className="text-gray-700 dark:text-gray-300">Current Password</Label>
                    <div className="relative">
                      <Input
                        id="emailPassword"
                        type={showEmailPassword ? "text" : "password"}
                        data-testid="input-email-password"
                        value={emailPassword}
                        onChange={(e) => setEmailPassword(e.target.value)}
                        placeholder="Enter your current password to confirm"
                        className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        onClick={() => setShowEmailPassword(!showEmailPassword)}
                      >
                        {showEmailPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    data-testid="button-change-email"
                    onClick={handleEmailChange}
                    disabled={changeEmailMutation.isPending}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {changeEmailMutation.isPending ? "Changing..." : "Change Email"}
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <Lock className="h-5 w-5 text-orange-500" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Change Password</h2>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Update your login password for added security
                </p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword" className="text-gray-700 dark:text-gray-300">Current Password</Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        data-testid="input-current-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter your current password"
                        className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      >
                        {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword" className="text-gray-700 dark:text-gray-300">New Password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        data-testid="input-new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password (min 8 characters)"
                        className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-gray-700 dark:text-gray-300">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      data-testid="input-confirm-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your new password"
                      className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    data-testid="button-change-password"
                    onClick={handlePasswordChange}
                    disabled={changePasswordMutation.isPending}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                  >
                    <KeyRound className="h-4 w-4 mr-2" />
                    {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
