import { invoke } from "@tauri-apps/api/core";

export const generateThumbnail = async (filePath: string): Promise<string> => {
  try {
    const thumbnail = await invoke<string>("generate_thumbnail", {
      videoPath: filePath,
    });
    return thumbnail;
  } catch (error) {
    console.error("Failed to generate thumbnail:", error);
    return "";
  }
};
