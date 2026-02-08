// ============================================
// MCP ENDPOINT: /mcp-health
// Health check and status endpoint
// ============================================

import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const response = {
    status: "healthy",
    service: "MCP Server",
    version: "1.0.0",
    timestamp: Date.now(),
    endpoints: [
      {
        path: "/mcp-execute",
        method: "POST",
        description: "Execute AI decision (mint rewards, penalties, bans)",
      },
      {
        path: "/mcp-validate-session",
        method: "POST",
        description: "Validate game session data integrity",
      },
      {
        path: "/mcp-health",
        method: "GET",
        description: "Health check and status",
      },
    ],
    securityChecks: [
      "REPLAY_PREVENTION - Nonce-based replay attack prevention",
      "RATE_LIMIT - Per-address rate limiting (30 req/min)",
      "BOT_DETECTION - Confidence threshold enforcement",
      "REWARD_SANITY - Reward amount bounds checking",
      "ADDRESS_VALIDATION - Ethereum address format validation",
      "SESSION_VALIDATION - Session ID format validation",
      "SIGNATURE_VERIFICATION - HMAC signature verification for sessions",
    ],
  };

  return new Response(JSON.stringify(response, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
