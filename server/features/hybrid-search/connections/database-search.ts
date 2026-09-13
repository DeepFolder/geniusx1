import { storage } from '../../../storage';
import type { UnifiedProduct, ProductAttribute } from '../backend/types';

export interface DatabaseSearchResult {
  success: boolean;
  products: UnifiedProduct[];
  error?: string;
}

export async function executeDatabaseSearch(query: string, maxResults: number = 10): Promise<DatabaseSearchResult> {
  try {
    console.log('🗄️ [DatabaseSearch] Starting database search for:', query);

    const searchResults = await storage.searchAll(query);

    const products: UnifiedProduct[] = [];

    if (searchResults.products && searchResults.products.length > 0) {
      for (const dbProduct of searchResults.products.slice(0, maxResults)) {
        let companyName = 'DeepFolder';
        let companyWebsite = '';
        let companyCity = '';
        let companyCountry = '';

        if (dbProduct.companyId) {
          try {
            const company = await storage.getCompany(dbProduct.companyId);
            if (company) {
              companyName = company.name;
              companyWebsite = company.website || '';
              companyCity = company.location || '';
              companyCountry = company.country || '';
            }
          } catch (e) {
          }
        }

        const attributes: ProductAttribute[] = [];

        if (dbProduct.specifications && typeof dbProduct.specifications === 'object') {
          const specs = dbProduct.specifications as Record<string, any>;
          for (const [key, value] of Object.entries(specs)) {
            if (value !== null && value !== undefined) {
              let attrValue = String(value);
              let unit = '';
              
              const match = attrValue.match(/^([\d.]+)\s*(.*)$/);
              if (match) {
                attrValue = match[1];
                unit = match[2] || '';
              }

              attributes.push({
                label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                value: attrValue,
                unit,
              });
            }
          }
        }

        const dbReferenceLink = (dbProduct as any).productWebLink || '';
        const dbImagePath = (dbProduct as any).imagePath || '';
        const dbModelPath = (dbProduct as any).modelPath || '';
        const dbDocumentPaths = Array.isArray((dbProduct as any).documentPaths)
          ? ((dbProduct as any).documentPaths as string[]).filter((p) => typeof p === 'string' && p.length > 0)
          : [];

        const product: UnifiedProduct = {
          structured_data: {
            company: {
              name: companyName,
              website: companyWebsite,
              address: {
                country_code: companyCountry,
                city: companyCity,
                street: '',
              },
            },
            files: {
              datasheet_url: (dbProduct as any).catalogPath || '',
              reference_link: dbReferenceLink || undefined,
            },
          },
          fluid_data: {
            product_name: dbProduct.name,
            description: dbProduct.description || '',
            fit_score: 0,
            attributes,
          },
          source: 'database',
          relevance_score: 1.0,
          _dbDatasheetPath: (dbProduct as any).catalogPath || '',
          _dbDatasheetText: (dbProduct as any).datasheetText || undefined,
          _dbProductId: dbProduct.id,
          _dbCompanyId: dbProduct.companyId || undefined,
          _dbImagePath: dbImagePath || undefined,
          _dbReferenceLink: dbReferenceLink || undefined,
          _dbModelPath: dbModelPath || undefined,
          _dbDocumentPaths: dbDocumentPaths.length > 0 ? dbDocumentPaths : undefined,
        };

        products.push(product);
      }
    }

    console.log(`✅ [DatabaseSearch] Found ${products.length} products in database`);

    return {
      success: true,
      products,
    };
  } catch (error: any) {
    console.error('❌ [DatabaseSearch] Error:', error?.message || error);
    return {
      success: false,
      products: [],
      error: error?.message || 'Database search failed',
    };
  }
}

export async function executeDatabaseFallback(query: string): Promise<{ companies: string[]; products: string[] }> {
  try {
    const results = await storage.searchAll(query || '');
    const companyNames = results.companies.slice(0, 5).map((c) => c.name).filter(Boolean);
    const productNames = results.products.slice(0, 5).map((p) => p.name).filter(Boolean);
    return { companies: companyNames, products: productNames };
  } catch (error) {
    return { companies: [], products: [] };
  }
}
