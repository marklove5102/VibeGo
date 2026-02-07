export type { PageCategory, PageContext, PageDefinition, PageId, PageViewProps } from "./types";
export { pageRegistry, registerPage, unregisterPage } from "./registry";

import "./system/home";
import "./system/settings";
import "./tools/process-monitor";
import "./workspace/files";
import "./workspace/git";
import "./workspace/terminal";
