import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { enrichLeadFunction } from "@/lib/inngest/lead-enrichment";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [enrichLeadFunction],
});
