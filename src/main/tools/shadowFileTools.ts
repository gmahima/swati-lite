import * as fs from "fs";
import * as path from "path";
import {shadowWorkspaceService} from "../shadowWorkspace";

/**
 * Writes content to the shadow copy of a file
 * @param originalFilePath Path to the original file
 * @param content Content to write to the shadow file
 * @returns Success status and shadow file path if successful
 */
export async function writeToShadowFile(
  originalFilePath: string,
  content: string
): Promise<{success: boolean; shadowPath: string | null; message: string}> {
  try {
    // Get the shadow path for the file
    const shadowPath = shadowWorkspaceService.getShadowPath(originalFilePath);

    if (!shadowPath) {
      return {
        success: false,
        shadowPath: null,
        message: `No shadow workspace found for file: ${originalFilePath}`,
      };
    }

    // Check if shadow file exists
    if (!fs.existsSync(shadowPath)) {
      return {
        success: false,
        shadowPath,
        message: `Shadow file does not exist and won't be created: ${shadowPath}`,
      };
    }

    // Write content to the shadow file
    fs.writeFileSync(shadowPath, content, "utf-8");

    console.log(
      `[ShadowFileTool] Successfully wrote to shadow file: ${shadowPath}`
    );

    return {
      success: true,
      shadowPath,
      message: `Successfully wrote to shadow file: ${shadowPath}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[ShadowFileTool] Error writing to shadow file: ${errorMessage}`
    );

    return {
      success: false,
      shadowPath: null,
      message: `Error writing to shadow file: ${errorMessage}`,
    };
  }
}

/**
 * Appends content to the shadow copy of a file
 * @param originalFilePath Path to the original file
 * @param contentToAppend Content to append to the shadow file
 * @returns Success status and shadow file path if successful
 */
export async function appendToShadowFile(
  originalFilePath: string,
  contentToAppend: string
): Promise<{success: boolean; shadowPath: string | null; message: string}> {
  try {
    // Get the shadow path for the file
    const shadowPath = shadowWorkspaceService.getShadowPath(originalFilePath);

    if (!shadowPath) {
      return {
        success: false,
        shadowPath: null,
        message: `No shadow workspace found for file: ${originalFilePath}`,
      };
    }

    // Check if shadow file exists
    if (!fs.existsSync(shadowPath)) {
      return {
        success: false,
        shadowPath,
        message: `Shadow file does not exist and won't be created: ${shadowPath}`,
      };
    }

    // Read existing content
    const existingContent = fs.readFileSync(shadowPath, "utf-8");

    // Append the new content
    const updatedContent = existingContent + contentToAppend;

    // Write updated content to the shadow file
    fs.writeFileSync(shadowPath, updatedContent, "utf-8");

    console.log(
      `[ShadowFileTool] Successfully appended to shadow file: ${shadowPath}`
    );

    return {
      success: true,
      shadowPath,
      message: `Successfully appended to shadow file: ${shadowPath}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[ShadowFileTool] Error appending to shadow file: ${errorMessage}`
    );

    return {
      success: false,
      shadowPath: null,
      message: `Error appending to shadow file: ${errorMessage}`,
    };
  }
}
