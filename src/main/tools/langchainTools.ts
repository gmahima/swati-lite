import {tool, StructuredToolInterface} from "@langchain/core/tools";
import {z} from "zod";
import {appendToShadowFile, writeToShadowFile} from "./shadowFileTools";

/**
 * Create a LangChain tool for writing to shadow files
 */
export function createShadowFileWriteTool(): StructuredToolInterface {
  return tool(
    async ({filePath, content}) => {
      console.log(
        `[LangChainTool] Attempting to write to shadow file: ${filePath}`
      );
      const result = await writeToShadowFile(filePath, content);
      return JSON.stringify(result);
    },
    {
      name: "write_to_shadow_file",
      description:
        "Write content to the shadow copy of a file, overwriting any existing content.",
      schema: z.object({
        filePath: z
          .string()
          .describe(
            "The path to the original file whose shadow copy you want to write to"
          ),
        content: z.string().describe("The content to write to the shadow file"),
      }),
    }
  );
}

/**
 * Create a LangChain tool for appending to shadow files
 */
export function createShadowFileAppendTool(): StructuredToolInterface {
  return tool(
    async ({filePath, contentToAppend}) => {
      console.log(
        `[LangChainTool] Attempting to append to shadow file: ${filePath}`
      );
      const result = await appendToShadowFile(filePath, contentToAppend);
      return JSON.stringify(result);
    },
    {
      name: "append_to_shadow_file",
      description:
        "Append content to the shadow copy of a file without overwriting existing content.",
      schema: z.object({
        filePath: z
          .string()
          .describe(
            "The path to the original file whose shadow copy you want to append to"
          ),
        contentToAppend: z
          .string()
          .describe("The content to append to the shadow file"),
      }),
    }
  );
}

/**
 * Get all available LangChain tools for shadow file operations
 */
export function getShadowFileTools(): StructuredToolInterface[] {
  return [createShadowFileWriteTool(), createShadowFileAppendTool()];
}
