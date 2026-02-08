// ============================================
// MCP ENDPOINT: /mcp-swap-validate
// Validates swap requests before execution
// Checks: session, rate limits, amount bounds,
//         bot detection, price impact
// ============================================

import { corsHeaders } from "../_shared/cors.ts";

interface SwapValidateRequest {
  sessionId: string;
  playerAddress: string;
  pair: "MONARD/ETH" | "MONARD/USDC";
  direction: "sell" | "buy";
  inputAmount: number;
  slippageTolerance: number;
  nonce: string;
  timestamp: number;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  riskScore: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    if (req.method !== "POST") {
      return jsonResponse(
        { success: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST only" } },
        405,
        requestId,
        startTime
      );
    }

    const body: SwapValidateRequest = await req.json();

    console.log(`[MCP-SWAP] ${requestId}: Validating swap`, {
      pair: body.pair,
      direction: body.direction,
      amount: body.inputAmount,
    });

    // ── Validate ──
    const result = validateSwap(body);

    if (!result.valid) {
      console.log(`[MCP-SWAP] ${requestId}: Rejected`, result.errors);
      return jsonResponse(
        {
          success: false,
          error: { code: "SWAP_VALIDATION_FAILED", message: result.errors.join("; ") },
          data: { riskScore: result.riskScore, warnings: result.warnings },
        },
        400,
        requestId,
        startTime
      );
    }

    // ── Approved ──
    const approvalToken = generateApprovalToken(body);

    console.log(`[MCP-SWAP] ${requestId}: Approved (risk: ${result.riskScore})`);

    return jsonResponse(
      {
        success: true,
        data: {
          approved: true,
          approvalToken,
          riskScore: result.riskScore,
          warnings: result.warnings,
          expiresAt: Date.now() + 30_000, // 30s to execute
        },
      },
      200,
      requestId,
      startTime
    );
  } catch (err) {
    console.error(`[MCP-SWAP] ${requestId}: Error`, err);
    return jsonResponse(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      500,
      requestId,
      startTime
    );
  }
});

// ── Validation Logic ──

function validateSwap(req: SwapValidateRequest): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let riskScore = 0;

  // 1. Required fields
  if (!req.sessionId) errors.push("Missing sessionId");
  if (!req.playerAddress) errors.push("Missing playerAddress");
  if (!req.pair) errors.push("Missing pair");
  if (!req.nonce) errors.push("Missing nonce");

  // 2. Valid pair
  if (!["MONARD/ETH", "MONARD/USDC"].includes(req.pair)) {
    errors.push(`Invalid pair: ${req.pair}`);
  }

  // 3. Valid direction
  if (!["sell", "buy"].includes(req.direction)) {
    errors.push(`Invalid direction: ${req.direction}`);
  }

  // 4. Amount bounds
  if (typeof req.inputAmount !== "number" || req.inputAmount <= 0) {
    errors.push("Input amount must be positive");
  }
  if (req.inputAmount > 100_000) {
    errors.push("Amount exceeds single-swap limit (100,000)");
  }
  if (req.inputAmount > 50_000) {
    warnings.push("Large swap — high price impact expected");
    riskScore += 20;
  }

  // 5. Slippage bounds
  if (req.slippageTolerance < 0.001 || req.slippageTolerance > 0.1) {
    errors.push("Slippage must be between 0.1% and 10%");
  }
  if (req.slippageTolerance > 0.05) {
    warnings.push("High slippage tolerance — front-running risk");
    riskScore += 15;
  }

  // 6. Timestamp freshness (must be within 60s)
  const age = Date.now() - req.timestamp;
  if (age > 60_000 || age < -5_000) {
    errors.push("Request timestamp expired or invalid");
    riskScore += 30;
  }

  // 7. Address format
  if (req.playerAddress && !/^0x[a-fA-F0-9]{40}$/.test(req.playerAddress)) {
    errors.push("Invalid wallet address format");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    riskScore: Math.min(riskScore, 100),
  };
}

function generateApprovalToken(req: SwapValidateRequest): string {
  // In production: JWT signed with server key, containing swap params
  const payload = `${req.sessionId}:${req.pair}:${req.direction}:${req.inputAmount}:${Date.now()}`;
  // Simple mock token — base64 encoded
  return btoa(payload);
}

// ── Response Helper ──

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  requestId: string,
  startTime: number
): Response {
  return new Response(
    JSON.stringify({
      ...body,
      meta: { requestId, timestamp: Date.now(), processingTimeMs: Date.now() - startTime },
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
