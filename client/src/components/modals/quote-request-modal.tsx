import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertQuoteRequestSchema } from "@shared/schema";
import { z } from "zod";

const quoteFormSchema = insertQuoteRequestSchema.extend({
  timeline: z.string().min(1, "Timeline is required"),
});

type QuoteFormData = z.infer<typeof quoteFormSchema>;

interface QuoteRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: number;
  companyName: string;
  productId?: number;
}

export default function QuoteRequestModal({ 
  isOpen, 
  onClose, 
  companyId, 
  companyName,
  productId 
}: QuoteRequestModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      companyId,
      productId,
    },
  });

  const submitQuoteMutation = useMutation({
    mutationFn: async (data: QuoteFormData) => {
      const response = await apiRequest("POST", "/api/quote-requests", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests"] });
      toast({
        title: "Quote Request Sent",
        description: `Your quote request has been sent to ${companyName}. They will respond within 24 hours.`,
      });
      reset();
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send quote request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: QuoteFormData) => {
    submitQuoteMutation.mutate(data);
  };

  const timelineOptions = [
    { value: "asap", label: "ASAP" },
    { value: "1month", label: "Within 1 month" },
    { value: "3months", label: "Within 3 months" },
    { value: "6months", label: "Within 6 months" },
    { value: "norush", label: "No rush" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Request Quote from {companyName}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                {...register("companyName")}
                className={errors.companyName ? "border-red-500" : ""}
              />
              {errors.companyName && (
                <p className="text-sm text-red-500 mt-1">{errors.companyName.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="contactPerson">Contact Person *</Label>
              <Input
                id="contactPerson"
                {...register("contactPerson")}
                className={errors.contactPerson ? "border-red-500" : ""}
              />
              {errors.contactPerson && (
                <p className="text-sm text-red-500 mt-1">{errors.contactPerson.message}</p>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
                className={errors.email ? "border-red-500" : ""}
              />
              {errors.email && (
                <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                {...register("phone")}
                className={errors.phone ? "border-red-500" : ""}
              />
              {errors.phone && (
                <p className="text-sm text-red-500 mt-1">{errors.phone.message}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="productRequired">Product/Service Required *</Label>
            <Input
              id="productRequired"
              {...register("productRequired")}
              placeholder="Describe the product or service you need"
              className={errors.productRequired ? "border-red-500" : ""}
            />
            {errors.productRequired && (
              <p className="text-sm text-red-500 mt-1">{errors.productRequired.message}</p>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                {...register("quantity", { valueAsNumber: true })}
                className={errors.quantity ? "border-red-500" : ""}
              />
              {errors.quantity && (
                <p className="text-sm text-red-500 mt-1">{errors.quantity.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="timeline">Timeline *</Label>
              <Select onValueChange={(value) => setValue("timeline", value)}>
                <SelectTrigger className={errors.timeline ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select timeline" />
                </SelectTrigger>
                <SelectContent>
                  {timelineOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.timeline && (
                <p className="text-sm text-red-500 mt-1">{errors.timeline.message}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="additionalRequirements">Additional Requirements</Label>
            <Textarea
              id="additionalRequirements"
              rows={4}
              {...register("additionalRequirements")}
              placeholder="Specify any additional requirements, certifications needed, or special considerations..."
              className={errors.additionalRequirements ? "border-red-500" : ""}
            />
            {errors.additionalRequirements && (
              <p className="text-sm text-red-500 mt-1">{errors.additionalRequirements.message}</p>
            )}
          </div>

          <div className="flex space-x-3 pt-4">
            <Button 
              type="submit" 
              className="flex-1"
              disabled={submitQuoteMutation.isPending}
            >
              {submitQuoteMutation.isPending ? "Sending..." : "Send Quote Request"}
            </Button>
            <Button 
              type="button" 
              variant="outline"
              onClick={onClose}
              className="px-6"
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
