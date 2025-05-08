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
// Database connectivity
// NOTE: You need to install this package: npm install @supabase/supabase-js
// import {createClient} from "@supabase/supabase-js";

// File system operations
import * as path from "path";
import * as os from "os";
import {TEMPORARY_USER_ID} from "../lib/constants.ts";
require("dotenv").config();

// const supabaseUrl = process.env.SUPABASE_URL as string;
// const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

// const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// const jina = new JinaEmbeddings({
//     apiKey: process.env.JINA_API_KEY as string,
//     model: "jina-embeddings-v3",
//   });

//   // Adapter to match Chroma's expected interface
//   const embeddingFunction = {
//     embed: (documents: string[]) => jina.embedDocuments(documents),
//   };

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

const collection = await chroma.createCollection({
  name: "vector-store",
  embeddingFunction: jinaEmbeddingFunction,
});

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
    // Query the collection with a filter for the file path
    const results = await collection.query({
      queryTexts: [""],  // Empty query to match based on filters only
      nResults: 1,
      where: {
        userId,
        source: filePath,
      },
    });
    console.log("results", results);
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

/**
 * Processes a file for RAG by reading its content, splitting into chunks,
 * and storing in the vector database with embeddings
 */
export async function embedFile({
  filePath,
  language = "js",
  userId = TEMPORARY_USER_ID,
  metadata = {},
}: {
  filePath: string;
  language?:
    | "cpp"
    | "go"
    | "java"
    | "js"
    | "php"
    | "proto"
    | "python"
    | "rst"
    | "ruby"
    | "rust"
    | "scala"
    | "swift"
    | "markdown"
    | "latex"
    | "html"
    | "sol";
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
    // Prepare filter with user ID by default
    const userFilter = {
      userId,
      ...filters,
    };

    // Query the collection with the embedded query
    const results = await collection.query({
      queryTexts: [query],
      nResults: limit,
      where: Object.keys(userFilter).length > 0 ? userFilter : undefined,
    });

    // Format the results
    const formattedResults =
      results.documents[0]?.map((document, index) => {
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
    const retrievalResult = await queryVectorStore({
      query,
      userId,
      limit: chunkLimit,
      filters: filePath ? { source: filePath } : {},
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
        (result) =>
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
      sources: retrievalResult.results.map((r) => ({
        id: r.id,
        source: r.metadata.source,
        score: r.score,
      })),
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
