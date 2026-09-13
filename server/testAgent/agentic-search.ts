import { z } from "zod";
import { Agent, Runner, webSearchTool, AgentInputItem } from "@openai/agents";
import { documentService } from "./document-service";

// --- 1. Schema Definitions (DeepFolder Spec Compliant) ---

// Interpreted requirement from user query
export const InterpretedRequirementSchema = z.object({
    parameter: z.string().describe("Technical parameter name (e.g., 'Thrust', 'Speed', 'IP Rating')"),
    requirement: z.string().describe("User's requirement value (e.g., '≥ 10 kN', '35 mm/s')"),
    type: z.enum(["hard", "soft"]).describe("Hard = must match, Soft = preferred but flexible")
});

export const ProductAttributeSchema = z.object({
    label: z.string().describe("Spec label"),
    value: z.string().describe("Spec value"),
    unit: z.string().describe("Unit of measurement"),
    meets_requirement: z.boolean().nullable().describe("Does this spec meet the user's hard requirement?")
});

export const CompanySchema = z.object({
    name: z.string().describe("Manufacturer name only - no distributors or resellers"),
    website: z.string().describe("Official manufacturer website URL"),
    location: z.string().describe("City, Country format")
});

export const ProductCardSchema = z.object({
    product_name: z.string().describe("Clean product name with model number"),
    brand: z.string().describe("Manufacturer brand"),
    company: CompanySchema,
    ai_summary: z.string().describe("1-2 line technical summary"),
    reference_link: z.string().describe("Direct manufacturer product page URL"),
    datasheet_url: z.string().nullable().describe("PDF datasheet URL or null if not found"),
    fit_score: z.number().min(0).max(100).describe("0-100: how well product matches requirements"),
    verification_status: z.enum(["verified", "web"]).describe("verified = DeepFolder verified, web = unverified"),
    verification_basis: z.string().nullable().describe("Source documents for verified products or null"),
    attributes: z.array(ProductAttributeSchema).describe("Key technical specifications")
});

export const DeepfolderSchema = z.object({
    interpreted_requirements: z.array(InterpretedRequirementSchema).describe("Technical requirements extracted from user query"),
    search_explanation: z.string().describe("How the search was conducted"),
    decision_summary: z.string().describe("Final recommendation with best match explanation"),
    products: z.array(ProductCardSchema).describe("Products ordered by fit_score (highest first), verified before web")
});

// --- 2. Agent Definition ---

const deepfolderInstructions = (context: any) => {
    const { ragContext } = context.context;
    return `You are DeepFolder AI, a professional industrial sourcing assistant.

CORE PRINCIPLE: AI thinks. Cards show facts. User decides.

YOUR MISSION:
1. Parse the user's query into technical requirements
2. Find 5-6 matching products from manufacturers
3. Score each product's fit (0-100) against requirements
4. Return structured results for the product cards

INTERNAL KNOWLEDGE (RAG):
${ragContext || "No internal documents available."}

STEP 1 - INTERPRET REQUIREMENTS:
Extract each technical parameter from the user query:
- Parameter name (Thrust, Speed, IP Rating, Stroke, etc.)
- Required value (≥ 10 kN, 35 mm/s, IP63, 500 mm)
- Type: "hard" (must match) or "soft" (preferred)

STEP 2 - SEARCH:
- Use webSearch to find products from MANUFACTURERS ONLY
- NO distributors, resellers, or marketplaces (Amazon, eBay, AliExpress)
- Prioritize official product pages and PDF datasheets

STEP 3 - EVALUATE & SCORE:
For each product, calculate fit_score (0-100):
- Each hard requirement met = +15-20 points
- Each soft requirement met = +5-10 points
- Datasheet available = +10 points
- Complete specs = +10 points

STEP 4 - OUTPUT:
- interpreted_requirements: List of extracted requirements
- search_explanation: Brief explanation of search approach
- decision_summary: Which product is best and why
- products: Ordered by fit_score (highest first)

STRICT RULES:
- verification_status = "web" for all web search results
- verification_status = "verified" only for products from RAG/internal docs
- Include datasheet_url only if you found a real PDF link
- location must be "City, Country" format
- fit_score must reflect actual requirement matching
`;
};

export const deepfolderAgent = new Agent({
    name: "deepfolder",
    instructions: deepfolderInstructions,
    model: "gpt-5.2",
    tools: [webSearchTool({
        searchContextSize: "medium"
    })],
    outputType: DeepfolderSchema,
});

// --- 3. Hybrid Search Service ---

export class HybridSearchService {
    private runner: Runner;

    constructor() {
        this.runner = new Runner();
    }

    // MOCK: Simulate DeepFolder verified database
    private async mockDbSearch(query: string): Promise<any[]> {
        console.log(`[HybridSearch] Checking verified database for: ${query}`);
        // In production, this queries real verified products
        return [];
    }

    public async search(query: string, onProgress?: (event: any) => void) {
        console.log(`[HybridSearch] Starting search for: ${query}`);

        onProgress?.({ type: 'status', message: 'Checking DeepFolder verified database...' });

        // Step 1: Check verified database first
        const verifiedProducts = await this.mockDbSearch(query);

        if (verifiedProducts.length >= 5) {
            onProgress?.({ type: 'status', message: `Found ${verifiedProducts.length} verified products` });
            return {
                source: "verified",
                products: verifiedProducts.map(p => ({ ...p, verification_status: "verified" }))
            };
        }

        onProgress?.({ type: 'status', message: 'Searching web for additional products...' });

        // Step 2: RAG context
        let ragContext = "";
        try {
            onProgress?.({ type: 'status', message: 'Querying internal knowledge base...' });
            const ragResult = await documentService.queryRAG({
                question: query,
                companyId: 1
            });
            ragContext = ragResult.answer;
        } catch (e) {
            console.error("[HybridSearch] RAG failed:", e);
        }

        // Step 3: Agent search
        onProgress?.({ type: 'status', message: 'AI agent analyzing requirements and searching...' });

        const conversationHistory: AgentInputItem[] = [
            { role: "user", content: [{ type: "input_text", text: query }] }
        ];

        const agentResult = await this.runner.run(
            deepfolderAgent as any,
            conversationHistory,
            { context: { ragContext } }
        );

        if (!agentResult.finalOutput) {
            onProgress?.({ type: 'status', message: 'No results found' });
            return { source: "hybrid", products: verifiedProducts };
        }

        const output = agentResult.finalOutput;
        onProgress?.({ type: 'status', message: `Found ${output.products.length} products` });

        // Merge verified + web results, sort by fit_score
        const allProducts = [
            ...verifiedProducts.map((p: any) => ({ ...p, verification_status: "verified" })),
            ...output.products.map((p: any) => ({
                ...p,
                id: `web_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
            }))
        ].sort((a, b) => {
            // Verified first when scores are similar
            if (Math.abs(a.fit_score - b.fit_score) < 5) {
                if (a.verification_status === "verified" && b.verification_status !== "verified") return -1;
                if (b.verification_status === "verified" && a.verification_status !== "verified") return 1;
            }
            return b.fit_score - a.fit_score;
        });

        onProgress?.({ type: 'complete', message: 'Search complete' });

        return {
            source: "hybrid",
            interpreted_requirements: output.interpreted_requirements,
            search_explanation: output.search_explanation,
            decision_summary: output.decision_summary,
            products: allProducts
        };
    }
}

export const hybridSearchService = new HybridSearchService();
