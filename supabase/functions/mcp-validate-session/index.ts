// ============================================
// MCP ENDPOINT: /mcp-validate-session
// Validates game session data integrity
// ============================================

import { corsHeaders } from "../_shared/cors.ts";
import { GameSessionPayload, MCPResponse, ValidationResult } from "../_shared/mcp-types.ts";
import { validateGameSession } from "../_shared/mcp-validation.ts";
import { verifySignature, generateNonce } from "../_shared/mcp-security.ts";

// In production: load from environment
const SESSION_SECRET = Deno.env.get("SESSION_SECRET") || "dev-secret-key-change-in-production";

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const requestId = generateNonce();

  try {
    if (req.method !== "POST") {
      return errorResponse("METHOD_NOT_ALLOWED", "Only POST allowed", 405, requestId, startTime);
    }

    const body = await req.json();

    console.log(`[MCP] Validate session ${requestId}: Processing`);

    // ── Step 1: Structural validation ──
    const validation = validateGameSession(body);
    if (!validation.valid) {
      console.log(`[MCP] Session ${requestId}: Validation failed`, validation.errors);
      return jsonResponse({
        success: false,
        data: {
          valid: false,
          errors: validation.errors,
          warnings: validation.warnings,
        },
        meta: { requestId, timestamp: Date.now(), processingTimeMs: Date.now() - startTime },
      }, 400);
    }

    const payload = body as GameSessionPayload;

    // ── Step 2: Signature verification ──
    const signaturePayload = JSON.stringify({
      sessionId: payload.sessionId,
      playerAddress: payload.playerAddress,
      score: payload.score,
      totalClicks: payload.totalClicks,
      clientTimestamp: payload.clientTimestamp,
    });

    const signatureValid = await verifySignature(
      signaturePayload,
      payload.clientSignature,
      SESSION_SECRET
    );

    if (!signatureValid) {
      console.log(`[MCP] Session ${requestId}: Invalid signature`);
      return jsonResponse({
        success: false,
        data: {
          valid: false,
          errors: ["Invalid session signature - possible tampering"],
          warnings: [],
        },
        meta: { requestId, timestamp: Date.now(), processingTimeMs: Date.now() - startTime },
      }, 403);
    }

    // ── Step 3: Consistency checks ──
    const consistencyErrors: string[] = [];

    // Check click timestamps are sequential
    if (payload.clickTimestamps && payload.clickTimestamps.length > 1) {
      for (let i = 1; i < payload.clickTimestamps.length; i++) {
        if (payload.clickTimestamps[i] < payload.clickTimestamps[i - 1]) {
          consistencyErrors.push("Click timestamps are not sequential");
          break;
        }
      }
    }

    // Check score vs clicks ratio (basic sanity)
    const maxScorePerClick = 10; // including combos
    if (payload.score > payload.totalClicks * maxScorePerClick) {
      consistencyErrors.push("Score exceeds maximum possible for click count");
    }

    // Check win/loss vs rounds
    if (payload.wins + payload.losses > payload.roundsPlayed) {
      consistencyErrors.push("Wins + losses exceeds rounds played");
    }

    if (consistencyErrors.length > 0) {
      console.log(`[MCP] Session ${requestId}: Consistency check failed`, consistencyErrors);
      return jsonResponse({
        success: false,
        data: {
          valid: false,
          errors: consistencyErrors,
          warnings: validation.warnings,
        },
        meta: { requestId, timestamp: Date.now(), processingTimeMs: Date.now() - startTime },
      }, 400);
    }

    // ── Step 4: Success ──
    console.log(`[MCP] Session ${requestId}: Valid`);

    return jsonResponse({
      success: true,
      data: {
        valid: true,
        errors: [],
        warnings: validation.warnings,
        sessionId: payload.sessionId,
        playerAddress: payload.playerAddress,
      },
      meta: { requestId, timestamp: Date.now(), processingTimeMs: Date.now() - startTime },
    }, 200);

  } catch (err) {
    console.error(`[MCP] Session ${requestId}: Error`, err);
    return errorResponse("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId, startTime);
  }
});

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function jsonResponse(body: MCPResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  requestId: string,
  startTime: number
): Response {
  const response: MCPResponse = {
    success: false,
    error: { code, message },
    meta: {
      requestId,
      timestamp: Date.now(),
      processingTimeMs: Date.now() - startTime,
    },
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
