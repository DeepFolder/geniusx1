import { z } from 'zod';

export const ProductAttributeSchema = z.object({
  label: z.string(),
  value: z.string(),
  unit: z.string(),
  note: z.string().optional(),
});

export const CompanyAddressSchema = z.object({
  country_code: z.string(),
  city: z.string(),
  street: z.string().optional().default(''),
});

export const CompanyInfoSchema = z.object({
  name: z.string(),
  website: z.string(),
  address: CompanyAddressSchema,
});

export const StructuredDataSchema = z.object({
  company: CompanyInfoSchema,
  files: z.object({
    datasheet_url: z.string(),
    reference_link: z.string().optional().nullable().default(''),
  }),
});

export const FluidDataSchema = z.object({
  product_name: z.string(),
  description: z.string(),
  attributes: z.array(ProductAttributeSchema),
  part_type: z.string().optional(),
});

export const UnifiedProductSchema = z.object({
  structured_data: StructuredDataSchema,
  fluid_data: FluidDataSchema,
});

export const DeepfolderAgentOutputSchema = z.object({
  chat_summary: z.string().optional().default(''),
  logic_explanation: z.string().optional().default(''),
  data: z.array(UnifiedProductSchema),
});

export const DeepfolderLooseSchema = z.object({
  chat_summary: z.string().optional().nullable(),
  logic_explanation: z.string().optional().nullable(),
  data: z.array(
    z.object({
      structured_data: z
        .object({
          company: z
            .object({
              name: z.string().optional().nullable(),
              website: z.string().optional().nullable(),
              address: z
                .object({
                  country_code: z.string().optional().nullable(),
                  city: z.string().optional().nullable(),
                  street: z.string().optional().nullable(),
                })
                .optional()
                .nullable(),
            })
            .optional()
            .nullable(),
          files: z
            .object({
              datasheet_url: z.string().optional().nullable(),
              reference_link: z.string().optional().nullable(),
            })
            .optional()
            .nullable(),
        })
        .optional()
        .nullable(),
      fluid_data: z
        .object({
          product_name: z.string().optional().nullable(),
          description: z.string().optional().nullable(),
          attributes: z
            .array(
              z.object({
                label: z.string().optional().nullable(),
                value: z.string().optional().nullable(),
                unit: z.string().optional().nullable(),
              }),
            )
            .optional()
            .nullable(),
          part_type: z.string().optional().nullable(),
        })
        .optional()
        .nullable(),
    }),
  ).optional().nullable(),
});

export type DeepfolderAgentOutput = z.infer<typeof DeepfolderAgentOutputSchema>;
export type DeepfolderLooseOutput = z.infer<typeof DeepfolderLooseSchema>;
