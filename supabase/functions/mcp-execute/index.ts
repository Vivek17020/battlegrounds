// ============================================
// MCP ENDPOINT: /mcp-execute
// Receives AI decisions, validates, executes
// ============================================

import { corsHeaders } from "../_shared/cors.ts";
import { AIDecisionPayload, MCPResponse, TransactionResult, AuditLogEntry } from "../_shared/mcp-types.ts";
import { validateAIDecision } from "../_shared/mcp-validation.ts";
import { performSecurityChecks, generateNonce } from "../_shared/mcp-security.ts";

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const requestId = generateNonce();

  try {
    // ── Parse request ──
    if (req.method !== "POST") {
      return errorResponse("METHOD_NOT_ALLOWED", "Only POST allowed", 405, requestId, startTime);
    }

    const body = await req.json();
    const nonce = req.headers.get("x-mcp-nonce") || generateNonce();

    console.log(`[MCP] Request ${requestId}: Processing AI decision`);

    // ── Step 1: Validate payload structure ──
    const validation = validateAIDecision(body);
    if (!validation.valid) {
      console.log(`[MCP] Request ${requestId}: Validation failed`, validation.errors);
      return errorResponse(
        "VALIDATION_FAILED",
        `Validation errors: ${validation.errors.join(", ")}`,
        400,
        requestId,
        startTime
      );
    }

    const payload = body as AIDecisionPayload;

    // ── Step 2: Security checks ──
    const securityResult = performSecurityChecks(
      payload.playerAddress,
      payload.sessionId,
      nonce,
      payload.botDetection.confidence,
      payload.rewardAmount
    );

    console.log(`[MCP] Request ${requestId}: Security checks`, {
      passed: securityResult.passed,
      riskScore: securityResult.riskScore,
    });

    if (!securityResult.passed) {
      const failedChecks = securityResult.checks
        .filter((c) => !c.passed)
        .map((c) => c.name);

      await logAudit({
        id: requestId,
        timestamp: Date.now(),
        action: payload.action,
        playerAddress: payload.playerAddress,
        sessionId: payload.sessionId,
        requestPayload: payload,
        responseStatus: "rejected",
        securityChecks: securityResult,
      });

      return errorResponse(
        "SECURITY_CHECK_FAILED",
        `Security checks failed: ${failedChecks.join(", ")}`,
        403,
        requestId,
        startTime
      );
    }

    // ── Step 3: Execute action ──
    let txResult: TransactionResult | null = null;

    switch (payload.action) {
      case "REWARD":
        txResult = await executeReward(payload);
        break;

      case "PENALIZE":
        txResult = await executePenalty(payload);
        break;

      case "BAN":
        txResult = await executeBan(payload);
        break;

      case "FLAG_FOR_REVIEW":
        await flagForReview(payload);
        break;

      case "CONTINUE":
        // No on-chain action needed
        break;
    }

    // ── Step 4: Audit log ──
    await logAudit({
      id: requestId,
      timestamp: Date.now(),
      action: payload.action,
      playerAddress: payload.playerAddress,
      sessionId: payload.sessionId,
      requestPayload: payload,
      responseStatus: "success",
      securityChecks: securityResult,
      txHash: txResult?.txHash,
    });

    // ── Step 5: Response ──
    const response: MCPResponse<{
      action: string;
      transaction?: TransactionResult;
      warnings?: string[];
    }> = {
      success: true,
      data: {
        action: payload.action,
        transaction: txResult || undefined,
        warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
      },
      meta: {
        requestId,
        timestamp: Date.now(),
        processingTimeMs: Date.now() - startTime,
      },
    };

    console.log(`[MCP] Request ${requestId}: Success in ${Date.now() - startTime}ms`);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(`[MCP] Request ${requestId}: Error`, err);
    return errorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred",
      500,
      requestId,
      startTime
    );
  }
});

// ─────────────────────────────────────────────
// MOCK BLOCKCHAIN INTERACTIONS
// In production: use ethers.js with server wallet
// ─────────────────────────────────────────────

async function executeReward(payload: AIDecisionPayload): Promise<TransactionResult> {
  console.log(`[MCP] Minting ${payload.rewardAmount} MONARD to ${payload.playerAddress}`);

  // Simulate TX delay
  await new Promise((r) => setTimeout(r, 100));

  // Mock TX hash
  const txHash = `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("")}`;

  return {
    txHash,
    status: "pending",
    action: "MINT_REWARD",
    amount: payload.rewardAmount,
    recipient: payload.playerAddress,
  };
}

async function executePenalty(payload: AIDecisionPayload): Promise<TransactionResult> {
  console.log(`[MCP] Applying penalty to ${payload.playerAddress}`);

  await new Promise((r) => setTimeout(r, 50));

  const txHash = `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("")}`;

  return {
    txHash,
    status: "pending",
    action: "PENALTY",
    amount: 0,
    recipient: payload.playerAddress,
  };
}

async function executeBan(payload: AIDecisionPayload): Promise<TransactionResult> {
  console.log(`[MCP] Banning address ${payload.playerAddress}`);

  await new Promise((r) => setTimeout(r, 50));

  const txHash = `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("")}`;

  return {
    txHash,
    status: "pending",
    action: "BAN_ADDRESS",
    amount: 0,
    recipient: payload.playerAddress,
  };
}

async function flagForReview(payload: AIDecisionPayload): Promise<void> {
  console.log(`[MCP] Flagging session ${payload.sessionId} for manual review`);
  // In production: write to review queue table
}

async function logAudit(entry: AuditLogEntry): Promise<void> {
  console.log(`[MCP] AUDIT: ${entry.action} for ${entry.playerAddress}`, {
    status: entry.responseStatus,
    riskScore: entry.securityChecks.riskScore,
  });
  // In production: insert into audit_logs table
}

// ─────────────────────────────────────────────
// ERROR HELPER
// ─────────────────────────────────────────────

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
