import {RecursiveCharacterTextSplitter} from "@langchain/textsplitters";
import fs from "fs/promises";
// Vector storage and embedding
// import {SupabaseVectorStore} from "@langchain/community/vectorstores/supabase";
// Using Jina embeddings instead of OpenAI
// import {JinaEmbeddings} from "@langchain/community/embeddings/jina";
// LLM and prompting
import {ChatGroq} from "@langchain/groq";
import {PromptTemplate} from "@langchain/core/prompts";
import {StringOutputParser} from "@langchain/core/output_parsers";
import {RunnableSequence} from "@langchain/core/runnables";
import {ChromaClient} from "chromadb";
import fetch from "node-fetch";
import * as path from "path";
import * as os from "os";
import {
  TEMPORARY_USER_ID,
  EMBEDDING_LANGUAGE_MAP,
  getEmbeddingLanguage,
  EmbeddingLanguageType,
} from "../lib/constants";
import {FileChangeType} from "./fileWatcher";
require("dotenv").config();

const chroma = new ChromaClient({path: "http://localhost:8000"});

const jinaEmbeddingFunction = {
  embed: async (documents: string[]): Promise<number[][]> => {
    const response = await fetch("https://api.jina.ai/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.JINA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: documents,
        model: "jina-embeddings-v3",
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Jina API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    // Jina returns { data: [{embedding: [...]}, ...] }
    return data.data.map((item: any) => item.embedding);
  },
  generate: async (documents: string[]): Promise<number[][]> => {
    // Just call embed for compatibility
    return jinaEmbeddingFunction.embed(documents);
  },
};

// Replace the direct creation with a get-or-create pattern
let collection: any;
try {
  // Try to get the existing collection first
  collection = await chroma.getCollection({
    name: "vector-store",
    embeddingFunction: jinaEmbeddingFunction,
  });
  console.log("Using existing collection: vector-store");
} catch (error: any) {
  // Check if the error is specifically that the collection doesn't exist
  if (error.message && error.message.includes("Collection not found")) {
    // If collection doesn't exist, create it
    console.log("Collection not found, creating new one: vector-store");
    collection = await chroma.createCollection({
      name: "vector-store",
      embeddingFunction: jinaEmbeddingFunction,
    });
    console.log("Created new collection: vector-store");
  } else {
    // Re-throw other errors for proper handling upstream
    console.error("Error accessing ChromaDB:", error);
    throw error;
  }
}

/**
 * Checks if a file exists in the vector store
 */
export async function checkFileExists({
  filePath,
  userId = TEMPORARY_USER_ID,
}: {
  filePath: string;
  userId?: string;
}) {
  try {
    // Create where condition using the suggested format
    const whereCondition = {
      $and: [{userId: userId}, {source: filePath}],
    };

    // Query the collection with a filter for the file path
    const results = await collection.query({
      queryTexts: [""], // Empty query to match based on filters only
      nResults: 1,
      where: whereCondition,
    });

    return {
      success: true,
      exists: results.ids[0]?.length > 0,
    };
  } catch (error) {
    console.error("Error checking if file exists in vector store:", error);
    return {
      success: false,
      exists: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function embedFile({
  filePath,
  language = "js",
  userId = TEMPORARY_USER_ID,
  metadata = {},
}: {
  filePath: string;
  language?: EmbeddingLanguageType;
  userId?: string;
  metadata?: Record<string, any>;
}) {
  try {
    // Read the file content
    const fileContent = await fs.readFile(filePath, "utf-8");

    // Create a splitter based on the language
    const splitter = RecursiveCharacterTextSplitter.fromLanguage(language, {
      chunkSize: 1000,
      chunkOverlap: 100,
    });

    // Split the content into chunks
    const chunks = await splitter.splitText(fileContent);

    // Prepare document IDs and metadatas for each chunk
    const ids = chunks.map((_, i) => `${path.basename(filePath)}-chunk-${i}`);
    const enhancedMetadata = chunks.map(() => ({
      source: filePath,
      userId,
      language,
      timestamp: new Date().toISOString(),
      ...metadata,
    }));

    // Add the chunks to the collection
    await collection.add({
      ids,
      metadatas: enhancedMetadata,
      documents: chunks,
    });

    return {
      success: true,
      chunksCount: chunks.length,
      message: `Successfully processed ${filePath} and added ${chunks.length} chunks to vector store`,
    };
  } catch (error) {
    console.error("Error in RAG service:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Searches the vector store for relevant chunks that match the query
 */
export async function queryVectorStore({
  query,
  userId = TEMPORARY_USER_ID,
  limit = 5,
  filters = {},
}: {
  query: string;
  userId?: string;
  limit?: number;
  filters?: Record<string, any>;
}) {
  try {
    // Build conditions array for the $and operator
    const conditions: Record<string, any>[] = [{userId: userId}];

    // Add other filters
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && key !== "userId") {
        // Avoid duplicating userId
        conditions.push({[key]: value});
      }
    }

    // Log the where clause for debugging
    const whereClause = {$and: conditions};
    console.log("ChromaDB where clause:", JSON.stringify(whereClause, null, 2));

    let queryOptions: any = {
      queryTexts: [query],
      nResults: limit,
      where: whereClause,
    };

    // Query the collection with the embedded query
    const results = await collection.query(queryOptions);

    // Format the results
    const formattedResults =
      results.documents[0]?.map((document: string, index: number) => {
        return {
          content: document,
          metadata: results.metadatas[0]?.[index] || {},
          id: results.ids[0]?.[index],
          score: results.distances?.[0]?.[index],
        };
      }) || [];

    return {
      success: true,
      results: formattedResults,
      count: formattedResults.length,
    };
  } catch (error) {
    console.error("Error querying vector store:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      results: [],
    };
  }
}

/**
 * Generates a response to a query using RAG (Retrieval-Augmented Generation)
 * First retrieves relevant chunks, then passes them to the LLM for answering
 */
export async function generateRagResponse({
  query,
  userId = TEMPORARY_USER_ID,
  chunkLimit = 5,
  model = "llama3-8b-8192",
  temperature = 0.7,
  filePath = undefined,
  systemPrompt = "You are a helpful AI assistant that answers questions about code.",
}: {
  query: string;
  userId?: string;
  chunkLimit?: number;
  model?: string;
  filePath?: string;
  temperature?: number;
  systemPrompt?: string;
}) {
  try {
    // First, retrieve relevant chunks
    const filters: Record<string, any> = {};

    // Only add valid filters
    if (userId) filters.userId = userId;
    if (filePath) filters.source = filePath;

    const retrievalResult = await queryVectorStore({
      query,
      userId,
      limit: chunkLimit,
      filters,
    });

    if (!retrievalResult.success) {
      throw new Error(`Failed to retrieve chunks: ${retrievalResult.error}`);
    }

    // Set up the LLM
    const llm = new ChatGroq({
      model,
      temperature,
      apiKey: process.env.GROQ_API_KEY as string,
    });

    // Prepare the context from retrieved chunks
    const context = retrievalResult.results
      .map(
        (result: {metadata: {source?: string}; content: string}) =>
          `CHUNK (from ${result.metadata.source || "unknown source"}):\n${
            result.content
          }`
      )
      .join("\n\n");

    // Set up the prompt
    const promptTemplate = PromptTemplate.fromTemplate(`
You are given several chunks of code and a question. Use the code context to answer the question.

CODE CONTEXT:
{context}

QUESTION: {question}

Provide a clear, accurate response based on the code context. If the context doesn't contain the information needed, acknowledge this limitation, then provide a answer based on your knowledge.
`);

    // Create the runnable sequence
    const chain = RunnableSequence.from([
      {
        context: () => context,
        question: () => query,
      },
      promptTemplate,
      llm,
      new StringOutputParser(),
    ]);

    // Execute the chain
    const response = await chain.invoke({});

    return {
      success: true,
      response,
      sourcesCount: retrievalResult.results.length,
      sources: retrievalResult.results.map(
        (r: {id: string; metadata: {source: string}; score: number}) => ({
          id: r.id,
          source: r.metadata.source,
          score: r.score,
        })
      ),
    };
  } catch (error) {
    console.error("Error in RAG response generation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      response: "I encountered an error trying to answer your question.",
    };
  }
}

/**
 * Deletes a specific file's chunks from the vector store
 */
export async function deleteFileEmbeddings({
  filePath,
  userId = TEMPORARY_USER_ID,
}: {
  filePath: string;
  userId?: string;
}) {
  try {
    // Create where condition
    const whereCondition = {
      $and: [{userId: userId}, {source: filePath}],
    };

    // Get the IDs of chunks to delete
    const results = await collection.query({
      queryTexts: [""], // Empty query to match based on filters only
      where: whereCondition,
    });

    if (results.ids[0]?.length > 0) {
      // Delete the chunks
      await collection.delete({
        ids: results.ids[0],
      });

      return {
        success: true,
        deletedCount: results.ids[0].length,
        message: `Successfully deleted ${results.ids[0].length} chunks for ${filePath}`,
      };
    }

    return {
      success: true,
      deletedCount: 0,
      message: `No chunks found for ${filePath}`,
    };
  } catch (error) {
    console.error("Error deleting file from vector store:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Handles file changes from the file watcher service
 * and updates the vector store accordingly
 */
export async function handleFileChange({
  filePath,
  changeType,
  userId = TEMPORARY_USER_ID,
}: {
  filePath: string;
  changeType: FileChangeType;
  userId?: string;
}) {
  try {
    // Determine file language from extension
    const extension = path.extname(filePath).toLowerCase();

    // Use the centralized language mapping and fallback
    const language = getEmbeddingLanguage(extension);

    switch (changeType) {
      case FileChangeType.ADDED:
        // For new files, just embed the entire file
        return await embedFile({filePath, language, userId});

      case FileChangeType.UPDATED:
        // For updated files, we'll do smart updating of only changed chunks
        return await updateChangedChunks({filePath, language, userId});

      case FileChangeType.DELETED:
        // For deleted files, just delete the embeddings
        return await deleteFileEmbeddings({filePath, userId});

      default:
        return {
          success: false,
          error: `Unknown change type: ${changeType}`,
        };
    }
  } catch (error) {
    console.error("Error handling file change:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Updates only the changed chunks of a file in the vector store
 * This is more efficient than re-embedding the entire file for small changes
 */
async function updateChangedChunks({
  filePath,
  language,
  userId = TEMPORARY_USER_ID,
}: {
  filePath: string;
  language: EmbeddingLanguageType;
  userId?: string;
}) {
  try {
    // First, get the current file content
    const fileContent = await fs.readFile(filePath, "utf-8");

    // Create a splitter based on the language
    const splitter = RecursiveCharacterTextSplitter.fromLanguage(language, {
      chunkSize: 1000,
      chunkOverlap: 100,
    });

    // Split the current content into chunks
    const currentChunks = await splitter.splitText(fileContent);

    // Generate current chunk IDs and metadata
    const currentIds = currentChunks.map(
      (_, i) => `${path.basename(filePath)}-chunk-${i}`
    );
    const currentMetadata = currentChunks.map(() => ({
      source: filePath,
      userId,
      language,
      timestamp: new Date().toISOString(),
    }));

    // Get the previously stored chunks from the vector store
    const whereCondition = {
      $and: [{userId: userId}, {source: filePath}],
    };

    const previousResults = await collection.query({
      queryTexts: [""], // Empty query to match based on filters only
      where: whereCondition,
    });

    // If there are no previous chunks, just embed the whole file
    if (!previousResults.ids[0]?.length) {
      console.log(
        `No previous chunks found for ${filePath}, embedding entire file`
      );
      return await embedFile({filePath, language, userId});
    }

    // Track the changes
    const previousIds = previousResults.ids[0];
    const previousDocs = previousResults.documents[0];

    // Compare chunk count
    if (previousIds.length !== currentIds.length) {
      console.log(
        `Chunk count changed for ${filePath} (${previousIds.length} -> ${currentIds.length}), re-embedding entire file`
      );
      // Structure changed significantly, re-embed the entire file
      await deleteFileEmbeddings({filePath, userId});
      return await embedFile({filePath, language, userId});
    }

    // Check which chunks have changed by comparing the content
    const changedChunkIndices = [];
    for (let i = 0; i < currentChunks.length; i++) {
      if (currentChunks[i] !== previousDocs[i]) {
        changedChunkIndices.push(i);
      }
    }

    // If no chunks changed, nothing to do
    if (changedChunkIndices.length === 0) {
      console.log(`No chunks changed for ${filePath}, skipping update`);
      return {
        success: true,
        message: `No changes detected in chunks for ${filePath}`,
        changedCount: 0,
      };
    }

    // If many chunks changed (over 50%), just re-embed the whole file
    if (changedChunkIndices.length > currentChunks.length * 0.5) {
      console.log(
        `Many chunks (${changedChunkIndices.length} of ${currentChunks.length}) changed for ${filePath}, re-embedding entire file`
      );
      await deleteFileEmbeddings({filePath, userId});
      return await embedFile({filePath, language, userId});
    }

    console.log(
      `Updating ${changedChunkIndices.length} changed chunks for ${filePath}`
    );

    // Delete just the changed chunks
    const idsToDelete = changedChunkIndices.map((i) => previousIds[i]);
    await collection.delete({
      ids: idsToDelete,
    });

    // Add the updated chunks
    const changedChunks = changedChunkIndices.map((i) => currentChunks[i]);
    const changedIds = changedChunkIndices.map((i) => currentIds[i]);
    const changedMetadata = changedChunkIndices.map((i) => currentMetadata[i]);

    await collection.add({
      ids: changedIds,
      metadatas: changedMetadata,
      documents: changedChunks,
    });

    return {
      success: true,
      message: `Successfully updated ${changedChunkIndices.length} chunks for ${filePath}`,
      changedCount: changedChunkIndices.length,
    };
  } catch (error) {
    console.error(`Error updating changed chunks for ${filePath}:`, error);

    // If smart updating fails, fall back to re-embedding the entire file
    console.log(`Falling back to full re-embedding for ${filePath}`);
    try {
      await deleteFileEmbeddings({filePath, userId});
      return await embedFile({filePath, language, userId});
    } catch (fallbackError) {
      console.error(
        `Even fallback re-embedding failed for ${filePath}:`,
        fallbackError
      );
      return {
        success: false,
        error: `Failed to update changed chunks: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
}
