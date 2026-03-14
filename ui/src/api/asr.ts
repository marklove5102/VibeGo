import { request } from "@/api/request";

export interface AsrInfo {
  enabled: boolean;
  version?: string;
  baseUrl?: string;
  wasmUrl?: string;
  dataUrl?: string;
  message?: string;
}

export const asrApi = {
  info: () => request<AsrInfo>("/asr/info"),
};
