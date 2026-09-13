import { generateCompanyEmbedding, generateProductEmbedding } from './semantic-search.js';

export async function onCompanyCreated(company: any): Promise<void> {
  try {
    console.log(`🔄 Generating embedding for new company ${company.id}...`);
    await generateCompanyEmbedding(company);
  } catch (error) {
    console.error(`❌ Failed to generate embedding for company ${company.id}:`, error);
  }
}

export async function onCompanyUpdated(company: any): Promise<void> {
  try {
    console.log(`🔄 Updating embedding for company ${company.id}...`);
    await generateCompanyEmbedding(company);
  } catch (error) {
    console.error(`❌ Failed to update embedding for company ${company.id}:`, error);
  }
}

export async function onProductCreated(product: any): Promise<void> {
  try {
    console.log(`🔄 Generating embedding for new product ${product.id}...`);
    await generateProductEmbedding(product);
  } catch (error) {
    console.error(`❌ Failed to generate embedding for product ${product.id}:`, error);
  }
}

export async function onProductUpdated(product: any): Promise<void> {
  try {
    console.log(`🔄 Updating embedding for product ${product.id}...`);
    await generateProductEmbedding(product);
  } catch (error) {
    console.error(`❌ Failed to update embedding for product ${product.id}:`, error);
  }
}
