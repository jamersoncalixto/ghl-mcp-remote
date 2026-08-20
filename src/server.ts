import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerLocationTools } from "./tools/locations.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerOpportunityTools } from "./tools/opportunities.js";
import { registerCalendarTools } from "./tools/calendars.js";
import { registerConversationTools } from "./tools/conversations.js";
import { registerFormTools } from "./tools/forms.js";
import { registerFunnelTools } from "./tools/funnels.js";
import { registerTagTools } from "./tools/tags.js";
import { registerCustomFieldTools } from "./tools/custom-fields.js";
import { registerWorkflowTools } from "./tools/workflows.js";
import { registerPhoneNumberTools } from "./tools/phone-numbers.js";
import { registerEmailTools } from "./tools/emails.js";
import { registerInvoiceTools } from "./tools/invoices.js";
import { registerProductTools } from "./tools/products.js";
import { registerSocialPlannerTools } from "./tools/social-planner.js";
import { registerBlogTools } from "./tools/blogs.js";
import { registerMediaTools } from "./tools/medias.js";
import { registerUserTools } from "./tools/users.js";
import { registerRawTool } from "./tools/raw.js";

/**
 * Built once per incoming /mcp request (see index.ts) — cheap, since it only registers
 * tool handlers. Tenant isolation doesn't come from having one server per agency; it comes
 * from the AsyncLocalStorage context (tenant-context.ts) that every tool call runs inside.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "GHL Remote MCP",
    version: "0.1.0",
  });

  registerLocationTools(server);
  registerContactTools(server);
  registerOpportunityTools(server);
  registerCalendarTools(server);
  registerConversationTools(server);
  registerFormTools(server);
  registerFunnelTools(server);
  registerTagTools(server);
  registerCustomFieldTools(server);
  registerWorkflowTools(server);
  registerPhoneNumberTools(server);
  registerEmailTools(server);
  registerInvoiceTools(server);
  registerProductTools(server);
  registerSocialPlannerTools(server);
  registerBlogTools(server);
  registerMediaTools(server);
  registerUserTools(server);
  registerRawTool(server);

  return server;
}
