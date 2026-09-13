import { db } from "../db.js";
import { 
  entityRelationships, 
  productSpecificationsIndex,
  type EntityRelationship,
  type InsertEntityRelationship,
  type ProductSpecificationIndex,
  type InsertProductSpecificationIndex
} from "../../shared/schema.js";
import { eq, and, or, inArray, desc } from "drizzle-orm";

type EntityType = "company" | "product" | "category" | "document" | "specification";
type RelationshipType = "contains" | "produces" | "references" | "part_of" | "related_to" | "similar_to" | "compatible_with";

export interface GraphNode {
  entityType: EntityType;
  entityId: number;
  metadata?: Record<string, any>;
}

export interface GraphEdge {
  from: GraphNode;
  to: GraphNode;
  relationshipType: RelationshipType;
  strength: number;
  metadata?: Record<string, any>;
}

export interface GraphTraversalOptions {
  maxDepth?: number;
  relationshipTypes?: RelationshipType[];
  minStrength?: number;
}

/**
 * Knowledge Graph Service - Abstraction layer for entity relationships
 * Provides methods for querying, traversing, and managing the knowledge graph
 */
export class KnowledgeGraphService {
  
  /**
   * Create a relationship between two entities
   */
  async createRelationship(
    sourceType: EntityType,
    sourceId: number,
    targetType: EntityType,
    targetId: number,
    relationshipType: RelationshipType,
    strength: number = 1.0,
    metadata?: Record<string, any>
  ): Promise<EntityRelationship> {
    const relationship: InsertEntityRelationship = {
      sourceEntityType: sourceType,
      sourceEntityId: sourceId,
      targetEntityType: targetType,
      targetEntityId: targetId,
      relationshipType,
      strength: strength.toString(),
      metadata: metadata || null,
    };

    const [created] = await db.insert(entityRelationships)
      .values(relationship)
      .returning();

    return created;
  }

  /**
   * Get all relationships for an entity
   */
  async getEntityRelationships(
    entityType: EntityType,
    entityId: number,
    options?: GraphTraversalOptions
  ): Promise<EntityRelationship[]> {
    let query = db.select()
      .from(entityRelationships)
      .where(
        or(
          and(
            eq(entityRelationships.sourceEntityType, entityType),
            eq(entityRelationships.sourceEntityId, entityId)
          ),
          and(
            eq(entityRelationships.targetEntityType, entityType),
            eq(entityRelationships.targetEntityId, entityId)
          )
        )
      );

    const results = await query;

    // Filter by relationship types if specified
    let filtered = results;
    if (options?.relationshipTypes) {
      filtered = results.filter((r: EntityRelationship) => options.relationshipTypes!.includes(r.relationshipType as RelationshipType));
    }

    // Filter by minimum strength if specified
    if (options?.minStrength !== undefined) {
      filtered = filtered.filter((r: EntityRelationship) => parseFloat(r.strength || "0") >= options.minStrength!);
    }

    return filtered;
  }

  /**
   * Find related entities (outgoing edges)
   */
  async findRelatedEntities(
    entityType: EntityType,
    entityId: number,
    relationshipTypes?: RelationshipType[]
  ): Promise<GraphNode[]> {
    const relationships = await this.getEntityRelationships(entityType, entityId, { relationshipTypes });

    // Extract target entities (where this entity is the source)
    const nodes: GraphNode[] = relationships
      .filter(r => r.sourceEntityType === entityType && r.sourceEntityId === entityId)
      .map(r => ({
        entityType: r.targetEntityType as EntityType,
        entityId: r.targetEntityId,
        metadata: r.metadata as Record<string, any> || {},
      }));

    return nodes;
  }

  /**
   * Find entities that reference this entity (incoming edges)
   */
  async findReferencingEntities(
    entityType: EntityType,
    entityId: number,
    relationshipTypes?: RelationshipType[]
  ): Promise<GraphNode[]> {
    const relationships = await this.getEntityRelationships(entityType, entityId, { relationshipTypes });

    // Extract source entities (where this entity is the target)
    const nodes: GraphNode[] = relationships
      .filter(r => r.targetEntityType === entityType && r.targetEntityId === entityId)
      .map(r => ({
        entityType: r.sourceEntityType as EntityType,
        entityId: r.sourceEntityId,
        metadata: r.metadata as Record<string, any> || {},
      }));

    return nodes;
  }

  /**
   * Traverse the graph starting from an entity
   * Returns all reachable nodes within maxDepth
   */
  async traverseGraph(
    startEntity: GraphNode,
    options: GraphTraversalOptions = { maxDepth: 2 }
  ): Promise<GraphNode[]> {
    const visited = new Set<string>();
    const queue: { node: GraphNode; depth: number }[] = [{ node: startEntity, depth: 0 }];
    const result: GraphNode[] = [];
    const maxDepth = options.maxDepth || 2;

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;
      const nodeKey = `${node.entityType}:${node.entityId}`;

      if (visited.has(nodeKey) || depth > maxDepth) {
        continue;
      }

      visited.add(nodeKey);
      result.push(node);

      if (depth < maxDepth) {
        const related = await this.findRelatedEntities(
          node.entityType,
          node.entityId,
          options.relationshipTypes
        );

        for (const relatedNode of related) {
          queue.push({ node: relatedNode, depth: depth + 1 });
        }
      }
    }

    return result;
  }

  /**
   * Update relationship strength
   */
  async updateRelationshipStrength(
    relationshipId: number,
    newStrength: number
  ): Promise<void> {
    await db.update(entityRelationships)
      .set({ strength: newStrength.toString() })
      .where(eq(entityRelationships.id, relationshipId));
  }

  /**
   * Delete a relationship
   */
  async deleteRelationship(relationshipId: number): Promise<void> {
    await db.delete(entityRelationships)
      .where(eq(entityRelationships.id, relationshipId));
  }

  /**
   * Index product specifications for better querying
   */
  async indexProductSpecifications(
    productId: number,
    specifications: Record<string, any>
  ): Promise<void> {
    // Clear existing specs for this product
    await db.delete(productSpecificationsIndex)
      .where(eq(productSpecificationsIndex.productId, productId));

    // Insert new specs
    const specsToInsert: InsertProductSpecificationIndex[] = [];

    for (const [key, value] of Object.entries(specifications)) {
      if (value === null || value === undefined) continue;

      const valueType = Array.isArray(value) ? "array" 
        : typeof value === "object" ? "object"
        : typeof value === "number" ? "number"
        : typeof value === "boolean" ? "boolean"
        : "text";

      const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);
      const numericValue = typeof value === "number" ? value.toString() : null;

      specsToInsert.push({
        productId,
        specKey: key,
        specValue: stringValue,
        valueType,
        numericValue,
        unit: null,
        metadata: null,
      });
    }

    if (specsToInsert.length > 0) {
      await db.insert(productSpecificationsIndex).values(specsToInsert);
    }
  }

  /**
   * Query product specifications
   */
  async queryProductSpecifications(
    specKey: string,
    options?: {
      minValue?: number;
      maxValue?: number;
      exactValue?: string;
    }
  ): Promise<ProductSpecificationIndex[]> {
    let query = db.select()
      .from(productSpecificationsIndex)
      .where(eq(productSpecificationsIndex.specKey, specKey));

    const results = await query;

    // Filter by value constraints
    let filtered = results;
    
    if (options?.minValue !== undefined) {
      filtered = filtered.filter((r: ProductSpecificationIndex) => 
        r.numericValue !== null && parseFloat(r.numericValue) >= options.minValue!
      );
    }

    if (options?.maxValue !== undefined) {
      filtered = filtered.filter((r: ProductSpecificationIndex) => 
        r.numericValue !== null && parseFloat(r.numericValue) <= options.maxValue!
      );
    }

    if (options?.exactValue !== undefined) {
      filtered = filtered.filter((r: ProductSpecificationIndex) => r.specValue === options.exactValue);
    }

    return filtered;
  }

  /**
   * Build graph edges from existing data
   * Called during initialization or data updates
   */
  async buildGraphFromExistingData(): Promise<void> {
    // This will be called by a background worker
    // For now, it's a placeholder for future implementation
    console.log("📊 Building knowledge graph from existing data...");
    
    // Future: Analyze existing companies, products, categories
    // and create relationships automatically
  }
}

// Export singleton instance
export const knowledgeGraph = new KnowledgeGraphService();
