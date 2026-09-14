import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, User, LogIn, UserPlus, Briefcase, Check, ChevronsUpDown, Crown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import { GeniusLogo } from "@/components/layout/GeniusLogo";

type AuthView = "login" | "forgot" | "forgot-sent";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const userRegistrationSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  acceptTerms: z.boolean().refine(val => val === true, {
    message: "You must accept the Terms of Service",
  }),
});

const companyRegistrationSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  companyName: z.string().min(1, "Company name is required"),
  industry: z.string().min(1, "Industry is required"),
  description: z.string().min(1, "Description is required"),
  location: z.string().optional(),
  website: z.string().min(1, "Website is required"),
  subscriptionPlan: z.string().default('free'),
  acceptTerms: z.boolean().refine(val => val === true, {
    message: "You must accept the Terms of Service",
  }),
});

type LoginForm = z.infer<typeof loginSchema>;
type UserRegistrationForm = z.infer<typeof userRegistrationSchema>;
type CompanyRegistrationForm = z.infer<typeof companyRegistrationSchema>;

const INDUSTRIES = [
  'Aerospace Components', 'Agricultural Equipment', 'Automotive Parts', 'Bearings & Bushings',
  'Cables & Wiring', 'Castings & Forgings', 'Chemicals & Compounds', 'Connectors & Fasteners',
  'Construction Materials', 'Consumer Electronics', 'Control Systems', 'Cutting Tools',
  'Defense Equipment', 'Electrical Components', 'Electronic Components', 'Enclosures & Cabinets',
  'Fasteners & Hardware', 'Filters & Filtration', 'Flow Control', 'Food Processing Equipment',
  'Furniture & Fixtures', 'Gaskets & Seals', 'Gears & Drives', 'Hand Tools', 'Hinges & Latches',
  'HVAC Equipment', 'Hydraulics & Pneumatics', 'Industrial Machinery', 'Instrumentation',
  'Lighting Equipment', 'Linear Motion', 'Machine Tools', 'Marine Equipment', 'Material Handling',
  'Measuring Instruments', 'Medical Devices', 'Motors & Drives', 'Packaging Materials',
  'Pharmaceutical Equipment', 'Plastics & Polymers', 'Power Transmission', 'Precision Components',
  'Printed Circuit Boards', 'Pumps & Valves', 'Raw Materials', 'Robotics Components',
  'Safety Equipment', 'Sensors & Transducers', 'Semiconductors', 'Sheet Metal', 'Springs',
  'Structural Components', 'Surface Treatment', 'Test Equipment', 'Textiles & Fabrics',
  'Thermal Management', 'Tubes & Pipes', 'Welding Equipment', 'Other'
];

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
  "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica",
  "Croatia", "Cuba", "Cyprus", "Czech Republic", "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "East Timor",
  "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland",
  "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea",
  "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hong Kong", "Hungary", "Iceland", "India", "Indonesia", "Iran",
  "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya",
  "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya",
  "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands",
  "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique",
  "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea",
  "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru",
  "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines",
  "Samoa", "San Marino", "São Tomé and Príncipe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia",
  "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname",
  "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Togo", "Tonga", "Trinidad and Tobago",
  "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "UAE", "Uganda", "Ukraine", "United Kingdom", "United States", "Uruguay",
  "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

function capitalizeCity(input: string): string {
  return input.replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("login");
  const [authView, setAuthView] = useState<AuthView>("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [registrationType, setRegistrationType] = useState("user");
  const [registrationPending, setRegistrationPending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
  const [regIndustryOpen, setRegIndustryOpen] = useState(false);
  const [regCustomIndustry, setRegCustomIndustry] = useState('');
  const [regLocationCity, setRegLocationCity] = useState('');
  const [regLocationCountry, setRegLocationCountry] = useState('');
  const [regCountryOpen, setRegCountryOpen] = useState(false);

  // Check URL parameters to determine which tab to show
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    if (tab === 'register') {
      setActiveTab('register');
    }
    if (urlParams.get('reset') === 'success') {
      toast({ title: "Password updated", description: "Please sign in with your new password." });
    }
  }, []);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const userRegistrationForm = useForm<UserRegistrationForm>({
    resolver: zodResolver(userRegistrationSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      acceptTerms: false,
    },
  });

  const companyRegistrationForm = useForm<CompanyRegistrationForm>({
    resolver: zodResolver(companyRegistrationSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      companyName: "",
      industry: "",
      description: "",
      location: "",
      website: "",
      subscriptionPlan: "free",
      acceptTerms: false,
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Login failed");
      }
      return response.json();
    },
    onSuccess: async (result) => {
      toast({
        title: "Success",
        description: "Login successful",
      });
      
      // Force immediate refetch of auth data with cache invalidation
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });
      
      // Navigate to appropriate page
      const targetUrl = "/workspace";
      setTimeout(() => {
        window.location.href = targetUrl;
      }, 500);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Login failed",
        variant: "destructive",
      });
    },
  });

  const userRegistrationMutation = useMutation({
    mutationFn: async (data: UserRegistrationForm) => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Registration failed");
      }
      return response.json();
    },
    onSuccess: (result: any) => {
      if (result.pending) {
        setPendingMessage(result.message || "Your account is awaiting admin approval.");
        setRegistrationPending(true);
        return;
      }
      toast({ title: "Success", description: "User account created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/workspace");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Registration failed",
        variant: "destructive",
      });
    },
  });

  const companyRegistrationMutation = useMutation({
    mutationFn: async (data: CompanyRegistrationForm) => {
      const response = await fetch("/api/companies/create-with-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user: {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            password: data.password,
          },
          company: {
            name: data.companyName,
            industry: data.industry,
            description: data.description,
            location: data.location,
            website: data.website,
            subscriptionPlan: data.subscriptionPlan,
          },
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Company registration failed");
      }
      return response.json();
    },
    onSuccess: (result: any) => {
      if (result.pending) {
        setPendingMessage(result.message || "Your company account is awaiting admin approval.");
        setRegistrationPending(true);
        return;
      }
      toast({ title: "Success", description: "Company and admin account created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/workspace");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Company registration failed",
        variant: "destructive",
      });
    },
  });

  const forgotMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    onSuccess: () => setAuthView("forgot-sent"),
    onError: () => setAuthView("forgot-sent"),
  });

  const handleLogin = (data: LoginForm) => {
    loginMutation.mutate(data);
  };

  const handleUserRegistration = (data: UserRegistrationForm) => {
    userRegistrationMutation.mutate(data);
  };

  const handleCompanyRegistration = (data: CompanyRegistrationForm) => {
    companyRegistrationMutation.mutate(data);
  };

  // Pending approval screen
  if (registrationPending) {
    return (
      <div className="min-h-screen modern-4k-background flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-10">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 mx-auto mb-5">
              <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-3">Request Submitted</h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-6">{pendingMessage}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">You can close this page. We'll contact you at the email address you provided.</p>
            <button
              onClick={() => { setRegistrationPending(false); setActiveTab("login"); }}
              className="mt-6 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              ← Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen modern-4k-background flex items-start justify-center pt-12 pb-6 px-4">
      <div className="w-full max-w-lg">
        {/* Logo and Tagline */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mb-3">
            <GeniusLogo className="h-8 w-auto" />
          </div>
          <h1 className="text-xl font-normal text-gray-900 dark:text-white leading-tight">
            Transparent, source-backed engineering calculations
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">Describe a problem — get the working, editable and cited</p>
        </div>

        {/* Auth Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="bg-gray-100 dark:bg-gray-800 p-1">
              <TabsList className="grid w-full grid-cols-2 bg-transparent border-0 gap-1">
                <TabsTrigger 
                  value="login" 
                  className="flex items-center justify-center space-x-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white text-gray-600 dark:text-gray-400 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                >
                  <LogIn className="w-4 h-4" />
                  <span className="font-medium">Sign In</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="register" 
                  className="flex items-center justify-center space-x-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white text-gray-600 dark:text-gray-400 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                >
                  <UserPlus className="w-4 h-4" />
                  <span className="font-medium">Register</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Login Tab */}
            <TabsContent value="login" className="p-8 m-0">
              {authView === "forgot" ? (
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Forgot password?</h2>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">Enter your email and we'll send you a reset link</p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-gray-700 dark:text-gray-300 font-medium">Email</Label>
                      <Input
                        type="email"
                        placeholder="Enter your email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-11"
                      />
                    </div>
                    <Button
                      onClick={() => forgotMutation.mutate(forgotEmail)}
                      disabled={forgotMutation.isPending || !forgotEmail.trim()}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 shadow-md"
                    >
                      {forgotMutation.isPending ? "Sending…" : "Send reset link"}
                    </Button>
                  </div>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => { setAuthView("login"); setForgotEmail(""); }}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                </div>
              ) : authView === "forgot-sent" ? (
                <div className="space-y-6 text-center">
                  <div className="flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 mx-auto">
                    <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Check your email</h2>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">
                      If that email is registered, you'll receive a reset link shortly.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setAuthView("login"); setForgotEmail(""); }}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    ← Back to Sign In
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Welcome Back
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">Sign in to continue to GeniusX1</p>
                  </div>

                  <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-5">
                    <div>
                      <Label htmlFor="email" className="text-gray-700 dark:text-gray-300 font-medium">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="Enter your email"
                        {...loginForm.register("email")}
                        className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-11"
                      />
                      {loginForm.formState.errors.email && (
                        <p className="text-red-600 dark:text-red-400 text-sm mt-1.5">
                          {loginForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="password" className="text-gray-700 dark:text-gray-300 font-medium">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter your password"
                        {...loginForm.register("password")}
                        className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-11"
                      />
                      {loginForm.formState.errors.password && (
                        <p className="text-red-600 dark:text-red-400 text-sm mt-1.5">
                          {loginForm.formState.errors.password.message}
                        </p>
                      )}
                      <div className="mt-2 text-right">
                        <button
                          type="button"
                          onClick={() => { setAuthView("forgot"); setForgotEmail(loginForm.getValues("email") || ""); }}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                    </div>
                    <Button
                      type="submit"
                      disabled={loginMutation.isPending}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 shadow-md hover:shadow-lg transition-all duration-200"
                    >
                      {loginMutation.isPending ? "Signing In..." : "Sign In"}
                    </Button>
                  </form>
                </div>
              )}
            </TabsContent>

              {/* Registration Tab */}
              <TabsContent value="register" className="p-8 m-0">
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Create Account
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">Join the future of product discovery</p>
                  </div>

                  {/* Field Selection */}
                  <div>
                    <div className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-800 rounded-xl p-1.5 gap-1">
                      <button
                        type="button"
                        onClick={() => setRegistrationType("user")}
                        className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all duration-200 ${
                          registrationType === "user"
                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        }`}
                      >
                        <User className="w-4 h-4" />
                        <span className="font-semibold text-sm">Individual</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRegistrationType("company")}
                        className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all duration-200 ${
                          registrationType === "company"
                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        }`}
                      >
                        <Briefcase className="w-4 h-4" />
                        <span className="font-semibold text-sm">Company</span>
                      </button>
                    </div>
                  </div>

                  {/* Registration Forms */}
                  {registrationType === "user" ? (
                    <form onSubmit={userRegistrationForm.handleSubmit(handleUserRegistration)} className="space-y-5">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="firstName" className="text-gray-700 dark:text-gray-300 font-medium">First Name</Label>
                          <Input
                            id="firstName"
                            placeholder="First name"
                            {...userRegistrationForm.register("firstName")}
                            className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-11"
                          />
                          {userRegistrationForm.formState.errors.firstName && (
                            <p className="text-red-600 dark:text-red-400 text-sm mt-1.5">
                              {userRegistrationForm.formState.errors.firstName.message}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="lastName" className="text-gray-700 dark:text-gray-300 font-medium">Last Name</Label>
                          <Input
                            id="lastName"
                            placeholder="Last name"
                            {...userRegistrationForm.register("lastName")}
                            className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-11"
                          />
                          {userRegistrationForm.formState.errors.lastName && (
                            <p className="text-red-600 dark:text-red-400 text-sm mt-1.5">
                              {userRegistrationForm.formState.errors.lastName.message}
                            </p>
                          )}
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="email" className="text-gray-700 dark:text-gray-300 font-medium">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="Enter your email"
                          {...userRegistrationForm.register("email")}
                          className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-11"
                        />
                        {userRegistrationForm.formState.errors.email && (
                          <p className="text-red-600 dark:text-red-400 text-sm mt-1.5">
                            {userRegistrationForm.formState.errors.email.message}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="password" className="text-gray-700 dark:text-gray-300 font-medium">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="Create a password"
                          {...userRegistrationForm.register("password")}
                          className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-11"
                        />
                        {userRegistrationForm.formState.errors.password && (
                          <p className="text-red-600 dark:text-red-400 text-sm mt-1.5">
                            {userRegistrationForm.formState.errors.password.message}
                          </p>
                        )}
                      </div>
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
                        <div className="flex items-center justify-between rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3">
                          <div>
                            <div className="font-semibold text-sm text-green-800 dark:text-green-300">Free Plan</div>
                            <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">Premium plans coming soon</div>
                          </div>
                          <span className="text-xs font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-800/50 px-2 py-1 rounded-full">Active</span>
                        </div>
                      </div>
                      <div className="flex items-start space-x-2">
                        <Checkbox
                          id="userAcceptTerms"
                          checked={userRegistrationForm.watch("acceptTerms")}
                          onCheckedChange={(checked) =>
                            userRegistrationForm.setValue("acceptTerms", checked === true)
                          }
                          data-testid="checkbox-accept-terms-user"
                        />
                        <label
                          htmlFor="userAcceptTerms"
                          className="text-sm text-gray-700 dark:text-gray-300 leading-tight cursor-pointer"
                        >
                          I accept the{" "}
                          <a
                            href="/terms-of-service"
                            className="text-blue-600 hover:underline font-medium"
                            data-testid="link-terms-user-registration"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Terms of Service
                          </a>
                          {" "}and{" "}
                          <a
                            href="/privacy-policy"
                            className="text-blue-600 hover:underline font-medium"
                            data-testid="link-privacy-user-registration"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Privacy Policy
                          </a>
                        </label>
                      </div>
                      {userRegistrationForm.formState.errors.acceptTerms && (
                        <p className="text-red-600 dark:text-red-400 text-sm -mt-1">
                          {userRegistrationForm.formState.errors.acceptTerms.message}
                        </p>
                      )}
                      <Button
                        type="submit"
                        disabled={userRegistrationMutation.isPending}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 shadow-md hover:shadow-lg transition-all duration-200"
                      >
                        {userRegistrationMutation.isPending ? "Creating Account..." : "Create Account"}
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={companyRegistrationForm.handleSubmit(handleCompanyRegistration)} className="space-y-5">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Building2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                          <h4 className="font-semibold text-gray-900 dark:text-white">Administrator</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="firstName" className="text-gray-700 dark:text-gray-300 font-medium">First Name</Label>
                            <Input
                              id="firstName"
                              placeholder="First name"
                              {...companyRegistrationForm.register("firstName")}
                              className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-11"
                            />
                            {companyRegistrationForm.formState.errors.firstName && (
                              <p className="text-red-600 dark:text-red-400 text-sm mt-1.5">
                                {companyRegistrationForm.formState.errors.firstName.message}
                              </p>
                            )}
                          </div>
                          <div>
                            <Label htmlFor="lastName" className="text-gray-700 dark:text-gray-300 font-medium">Last Name</Label>
                            <Input
                              id="lastName"
                              placeholder="Last name"
                              {...companyRegistrationForm.register("lastName")}
                              className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-11"
                            />
                            {companyRegistrationForm.formState.errors.lastName && (
                              <p className="text-red-600 dark:text-red-400 text-sm mt-1.5">
                                {companyRegistrationForm.formState.errors.lastName.message}
                              </p>
                            )}
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="email" className="text-gray-700 dark:text-gray-300 font-medium">Email</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="Enter your email"
                            {...companyRegistrationForm.register("email")}
                            className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-11"
                          />
                          {companyRegistrationForm.formState.errors.email && (
                            <p className="text-red-600 dark:text-red-400 text-sm mt-1.5">
                              {companyRegistrationForm.formState.errors.email.message}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="password" className="text-gray-700 dark:text-gray-300 font-medium">Password</Label>
                          <Input
                            id="password"
                            type="password"
                            placeholder="Create a password"
                            {...companyRegistrationForm.register("password")}
                            className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-11"
                          />
                          {companyRegistrationForm.formState.errors.password && (
                            <p className="text-red-600 dark:text-red-400 text-sm mt-1.5">
                              {companyRegistrationForm.formState.errors.password.message}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-5">
                        <div className="flex items-center gap-2 mb-2">
                          <Briefcase className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                          <h4 className="font-semibold text-gray-900 dark:text-white">Company Details</h4>
                        </div>
                        <div>
                          <Label htmlFor="companyName" className="text-gray-700 dark:text-gray-300 font-medium">Company Name</Label>
                          <Input
                            id="companyName"
                            placeholder="Enter company name"
                            {...companyRegistrationForm.register("companyName")}
                            className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-11"
                          />
                          {companyRegistrationForm.formState.errors.companyName && (
                            <p className="text-red-600 dark:text-red-400 text-sm mt-1.5">
                              {companyRegistrationForm.formState.errors.companyName.message}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label className="text-gray-700 dark:text-gray-300 font-medium">Industry</Label>
                          <Popover open={regIndustryOpen} onOpenChange={setRegIndustryOpen}>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="mt-1.5 w-full h-11 px-3 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white flex items-center justify-between hover:border-blue-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                              >
                                {companyRegistrationForm.watch("industry") || "Select or type industry..."}
                                <ChevronsUpDown className="w-4 h-4 opacity-60" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" align="start" side="bottom">
                              <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={regCustomIndustry}
                                    onChange={(e) => setRegCustomIndustry(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && regCustomIndustry.trim()) {
                                        e.preventDefault();
                                        companyRegistrationForm.setValue("industry", regCustomIndustry.trim(), { shouldValidate: true });
                                        setRegCustomIndustry('');
                                        setRegIndustryOpen(false);
                                      }
                                    }}
                                    placeholder="Type custom industry..."
                                    className="h-8 text-sm bg-transparent border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-300/50"
                                  />
                                  {regCustomIndustry.trim() && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        companyRegistrationForm.setValue("industry", regCustomIndustry.trim(), { shouldValidate: true });
                                        setRegCustomIndustry('');
                                        setRegIndustryOpen(false);
                                      }}
                                      className="h-8 w-8 flex items-center justify-center rounded border border-blue-400 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 shrink-0"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <Command className="bg-white dark:bg-gray-800">
                                <CommandInput placeholder="Search industries..." className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                                <CommandList>
                                  <CommandEmpty className="text-gray-500 py-3 text-center text-sm">No industry found.</CommandEmpty>
                                  <CommandGroup>
                                    {INDUSTRIES.map((ind) => (
                                      <CommandItem
                                        key={ind}
                                        value={ind}
                                        onSelect={() => {
                                          companyRegistrationForm.setValue("industry", ind, { shouldValidate: true });
                                          setRegIndustryOpen(false);
                                          setRegCustomIndustry('');
                                        }}
                                        className="text-gray-900 dark:text-white cursor-pointer text-sm"
                                      >
                                        <Check className={cn("mr-2 h-4 w-4", companyRegistrationForm.watch("industry") === ind ? "opacity-100" : "opacity-0")} />
                                        {ind}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          {companyRegistrationForm.formState.errors.industry && (
                            <p className="text-red-600 dark:text-red-400 text-sm mt-1.5">
                              {companyRegistrationForm.formState.errors.industry.message}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="description" className="text-gray-700 dark:text-gray-300 font-medium">Description</Label>
                          <Input
                            id="description"
                            placeholder="Brief description of your company"
                            {...companyRegistrationForm.register("description")}
                            className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-11"
                          />
                          {companyRegistrationForm.formState.errors.description && (
                            <p className="text-red-600 dark:text-red-400 text-sm mt-1.5">
                              {companyRegistrationForm.formState.errors.description.message}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label className="text-gray-700 dark:text-gray-300 font-medium">Location</Label>
                          <div className="mt-1.5 flex items-center gap-2">
                            <Input
                              value={regLocationCity}
                              onChange={(e) => {
                                const capitalized = capitalizeCity(e.target.value);
                                setRegLocationCity(capitalized);
                                const loc = capitalized && regLocationCountry ? `${capitalized}, ${regLocationCountry}` : capitalized || regLocationCountry;
                                companyRegistrationForm.setValue("location", loc);
                              }}
                              placeholder="City"
                              className="h-11 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                            />
                            <Popover open={regCountryOpen} onOpenChange={setRegCountryOpen}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="h-11 px-3 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white flex items-center gap-2 hover:border-blue-400 min-w-[160px]"
                                >
                                  {regLocationCountry || "Country"}
                                  <ChevronsUpDown className="w-4 h-4 opacity-60 ml-auto" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[240px] p-0 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" align="start" side="bottom">
                                <Command className="bg-white dark:bg-gray-800">
                                  <CommandInput placeholder="Search country..." className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                                  <CommandList>
                                    <CommandEmpty className="text-gray-500 py-3 text-center text-sm">No country found.</CommandEmpty>
                                    <CommandGroup>
                                      {COUNTRIES.map((c) => (
                                        <CommandItem
                                          key={c}
                                          value={c}
                                          onSelect={() => {
                                            setRegLocationCountry(c);
                                            setRegCountryOpen(false);
                                            const loc = regLocationCity && c ? `${regLocationCity}, ${c}` : regLocationCity || c;
                                            companyRegistrationForm.setValue("location", loc);
                                          }}
                                          className="text-gray-900 dark:text-white cursor-pointer text-sm"
                                        >
                                          <Check className={cn("mr-2 h-4 w-4", regLocationCountry === c ? "opacity-100" : "opacity-0")} />
                                          {c}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="website" className="text-gray-700 dark:text-gray-300 font-medium">Website</Label>
                          <Input
                            id="website"
                            placeholder="https://company.com"
                            {...companyRegistrationForm.register("website")}
                            className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-11"
                          />
                          {companyRegistrationForm.formState.errors.website && (
                            <p className="text-red-600 dark:text-red-400 text-sm mt-1.5">
                              {companyRegistrationForm.formState.errors.website.message}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
                        <div className="flex items-center justify-between rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3">
                          <div>
                            <div className="font-semibold text-sm text-green-800 dark:text-green-300">Free Plan</div>
                            <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">Premium plans coming soon</div>
                          </div>
                          <span className="text-xs font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-800/50 px-2 py-1 rounded-full">Active</span>
                        </div>
                      </div>
                      <div className="flex items-start space-x-2">
                        <Checkbox
                          id="companyAcceptTerms"
                          checked={companyRegistrationForm.watch("acceptTerms")}
                          onCheckedChange={(checked) =>
                            companyRegistrationForm.setValue("acceptTerms", checked === true)
                          }
                          data-testid="checkbox-accept-terms-company"
                        />
                        <label
                          htmlFor="companyAcceptTerms"
                          className="text-sm text-gray-700 dark:text-gray-300 leading-tight cursor-pointer"
                        >
                          I accept the{" "}
                          <a
                            href="/terms-of-service"
                            className="text-blue-600 hover:underline font-medium"
                            data-testid="link-terms-company-registration"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Terms of Service
                          </a>
                          {" "}and{" "}
                          <a
                            href="/privacy-policy"
                            className="text-blue-600 hover:underline font-medium"
                            data-testid="link-privacy-company-registration"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Privacy Policy
                          </a>
                        </label>
                      </div>
                      {companyRegistrationForm.formState.errors.acceptTerms && (
                        <p className="text-red-600 dark:text-red-400 text-sm -mt-1">
                          {companyRegistrationForm.formState.errors.acceptTerms.message}
                        </p>
                      )}
                      <Button
                        type="submit"
                        disabled={companyRegistrationMutation.isPending}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 shadow-md hover:shadow-lg transition-all duration-200"
                      >
                        {companyRegistrationMutation.isPending ? "Creating Company..." : "Create Company Account"}
                      </Button>
                    </form>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    );
  }
