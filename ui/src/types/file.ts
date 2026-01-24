export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  content?: string;
  language?: string;
}

export interface FileItem {
  path: string;
  name: string;
  size: number;
  isDir: boolean;
  isSymlink: boolean;
  isHidden: boolean;
  mode: string;
  mimeType?: string;
  modTime: string;
  extension: string;
}

export type SortField = "name" | "size" | "modTime" | "type";
export type SortOrder = "asc" | "desc";
export type ViewMode = "list" | "grid";
