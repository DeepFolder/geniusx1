import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle } from "lucide-react";

interface ComplaintForm {
  name: string;
  contactEmail: string;
  company: string;
  infringingUrl: string;
  description: string;
  declarationAccepted: boolean;
}

const defaultForm: ComplaintForm = {
  name: "",
  contactEmail: "",
  company: "",
  infringingUrl: "",
  description: "",
  declarationAccepted: false,
};

export default function CopyrightPolicy() {
  const { toast } = useToast();
  const [form, setForm] = useState<ComplaintForm>(defaultForm);
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: ComplaintForm) =>
      apiRequest("/api/legal/copyright-complaint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setSubmitted(true);
      setForm(defaultForm);
    },
    onError: () => {
      toast({
        title: "Submission failed",
        description: "Please try again or email legal@deepfolder.com directly.",
        variant: "destructive",
      });
    },
  });

  function handleChange(field: keyof ComplaintForm, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.declarationAccepted) {
      toast({ title: "Declaration required", description: "Please accept the declaration before submitting.", variant: "destructive" });
      return;
    }
    mutation.mutate(form);
  }

  return (
    <div className="relative min-h-screen modern-4k-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Copyright & Takedown Policy</CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Last updated: June 13, 2026</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Version 1.0</p>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">1. Our Commitment</h2>
              <p>
                DeepFolder ("DeepFolder") respects the intellectual property rights of others and expects all users of its platform to do the same. We respond promptly to notices of alleged copyright infringement that comply with the procedure described below.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">2. Notice and Takedown Procedure</h2>
              <p>
                If you believe that content hosted on the DeepFolder platform infringes your copyright, you may submit a complaint using the form below or by emailing <a href="mailto:legal@deepfolder.com" className="text-blue-600 hover:underline">legal@deepfolder.com</a>. Your notice must include:
              </p>
              <ol className="list-decimal pl-6 space-y-2 mt-2">
                <li>Your name (or the name of the rights holder you represent) and contact information;</li>
                <li>A description of the copyrighted work you claim has been infringed;</li>
                <li>The URL or specific location on the Platform where the allegedly infringing content appears;</li>
                <li>A statement that you have a good-faith belief that the use of the material is not authorised by the copyright owner, its agent, or applicable law;</li>
                <li>A statement that the information in the notice is accurate, and — under penalty of perjury — that you are the copyright owner or are authorised to act on behalf of the owner.</li>
              </ol>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">3. Our Response</h2>
              <p>
                Upon receiving a valid complaint, DeepFolder will:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Acknowledge receipt within 2 business days;</li>
                <li>Investigate the complaint and, where appropriate, remove or disable access to the allegedly infringing content;</li>
                <li>Notify the user who uploaded the content (where legally permitted to do so);</li>
                <li>Provide a mechanism for the uploader to submit a counter-notice if they believe the content was removed in error.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">4. Counter-Notice</h2>
              <p>
                If your content was removed and you believe the removal was made in error, you may submit a counter-notice to <a href="mailto:legal@deepfolder.com" className="text-blue-600 hover:underline">legal@deepfolder.com</a>. Your counter-notice should include your name, contact details, identification of the removed content, and a declaration — under penalty of perjury — that you have a good-faith belief the content was removed as a result of mistake or misidentification.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">5. Repeat Infringers</h2>
              <p>
                DeepFolder has a policy of terminating, in appropriate circumstances, the accounts of users who are repeat infringers of intellectual property rights.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">6. Submit a Copyright Complaint</h2>

              {submitted ? (
                <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg not-prose">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-green-800 dark:text-green-200">Complaint received</p>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                      Thank you. We will review your complaint and respond within 2 business days. A copy has been sent to our legal team.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5 not-prose">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Full name <span className="text-red-500">*</span></Label>
                      <Input
                        id="name"
                        value={form.name}
                        onChange={e => handleChange("name", e.target.value)}
                        required
                        placeholder="Your full name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="contactEmail">Contact email <span className="text-red-500">*</span></Label>
                      <Input
                        id="contactEmail"
                        type="email"
                        value={form.contactEmail}
                        onChange={e => handleChange("contactEmail", e.target.value)}
                        required
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="company">Company / Organisation (if applicable)</Label>
                    <Input
                      id="company"
                      value={form.company}
                      onChange={e => handleChange("company", e.target.value)}
                      placeholder="Your company name"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="infringingUrl">URL of allegedly infringing content <span className="text-red-500">*</span></Label>
                    <Input
                      id="infringingUrl"
                      value={form.infringingUrl}
                      onChange={e => handleChange("infringingUrl", e.target.value)}
                      required
                      placeholder="https://deepfolder.com/..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="description">
                      Description of infringement and your original work <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="description"
                      value={form.description}
                      onChange={e => handleChange("description", e.target.value)}
                      required
                      rows={5}
                      placeholder="Describe the copyrighted work being infringed and how it is being used without permission..."
                    />
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <Checkbox
                      id="declaration"
                      checked={form.declarationAccepted}
                      onCheckedChange={checked => handleChange("declarationAccepted", !!checked)}
                    />
                    <Label htmlFor="declaration" className="text-sm leading-relaxed cursor-pointer">
                      I declare, under penalty of perjury, that the information in this notice is accurate and that I am the copyright owner or am authorised to act on behalf of the copyright owner whose rights have allegedly been infringed.
                    </Label>
                  </div>

                  <Button
                    type="submit"
                    disabled={mutation.isPending || !form.declarationAccepted}
                    className="w-full sm:w-auto"
                  >
                    {mutation.isPending ? "Submitting…" : "Submit Complaint"}
                  </Button>
                </form>
              )}
            </section>

            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                Version 1.0 — Published June 13 2026<br />
                © DeepFolder. All rights reserved.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
