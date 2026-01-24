import { invoke } from "@tauri-apps/api/core";

export const generateCid = async (filePath: string): Promise<string> => {
  const cid = await invoke<string>("generate_cid", { path: filePath });
  return cid;
};
