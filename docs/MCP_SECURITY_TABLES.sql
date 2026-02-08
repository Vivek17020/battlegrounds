-- ============================================
-- MCP SERVER — SECURITY TABLES
-- Database-backed security for production
-- ============================================

-- Nonce tracking for replay attack prevention
CREATE TABLE IF NOT EXISTS mcp_nonces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nonce TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  used_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_mcp_nonces_nonce ON mcp_nonces(nonce);
CREATE INDEX IF NOT EXISTS idx_mcp_nonces_used_at ON mcp_nonces(used_at);
CREATE INDEX IF NOT EXISTS idx_mcp_nonces_wallet ON mcp_nonces(wallet_address);

-- Rate limiting tracking
CREATE TABLE IF NOT EXISTS mcp_rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for rate limit queries
CREATE INDEX IF NOT EXISTS idx_mcp_rate_limits_wallet_endpoint ON mcp_rate_limits(wallet_address, endpoint, created_at);

-- Daily usage tracking for caps
CREATE TABLE IF NOT EXISTS mcp_daily_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  usage_type TEXT NOT NULL CHECK (usage_type IN ('reward', 'match')),
  amount NUMERIC NOT NULL DEFAULT 1,
  match_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for daily cap queries
CREATE INDEX IF NOT EXISTS idx_mcp_daily_usage_wallet_type ON mcp_daily_usage(wallet_address, usage_type, created_at);
CREATE INDEX IF NOT EXISTS idx_mcp_daily_usage_created ON mcp_daily_usage(created_at);

-- Processed matches (prevents double rewarding)
CREATE TABLE IF NOT EXISTS mcp_processed_matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  placement INTEGER NOT NULL,
  reward_amount NUMERIC NOT NULL DEFAULT 0,
  tx_hash TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for match queries
CREATE INDEX IF NOT EXISTS idx_mcp_processed_matches_match_id ON mcp_processed_matches(match_id);
CREATE INDEX IF NOT EXISTS idx_mcp_processed_matches_wallet ON mcp_processed_matches(wallet_address);
CREATE INDEX IF NOT EXISTS idx_mcp_processed_matches_processed ON mcp_processed_matches(processed_at);

-- Audit log for security events
CREATE TABLE IF NOT EXISTS mcp_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  wallet_address TEXT,
  match_id TEXT,
  endpoint TEXT,
  request_id TEXT,
  payload JSONB,
  result TEXT,
  risk_score INTEGER,
  security_checks JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_mcp_audit_log_wallet ON mcp_audit_log(wallet_address);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_log_event ON mcp_audit_log(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_log_created ON mcp_audit_log(created_at);

-- ============================================
-- CLEANUP FUNCTIONS
-- ============================================

-- Function to clean up expired nonces (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_nonces(expiry_ms BIGINT DEFAULT 300000)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
  threshold BIGINT;
BEGIN
  threshold := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT - expiry_ms;
  DELETE FROM mcp_nonces WHERE used_at < threshold;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old rate limit entries (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits(window_ms BIGINT DEFAULT 60000)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM mcp_rate_limits 
  WHERE created_at < NOW() - (window_ms || ' milliseconds')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old audit logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM mcp_audit_log 
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS POLICIES (Service role only)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE mcp_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_processed_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_audit_log ENABLE ROW LEVEL SECURITY;

-- No public access - only service role can access these tables
-- Edge functions use service role key

-- Grant access to service role (for edge functions)
GRANT ALL ON mcp_nonces TO service_role;
GRANT ALL ON mcp_rate_limits TO service_role;
GRANT ALL ON mcp_daily_usage TO service_role;
GRANT ALL ON mcp_processed_matches TO service_role;
GRANT ALL ON mcp_audit_log TO service_role;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE mcp_nonces IS 'Tracks used nonces to prevent replay attacks';
COMMENT ON TABLE mcp_rate_limits IS 'Tracks request counts for rate limiting';
COMMENT ON TABLE mcp_daily_usage IS 'Tracks daily reward and match usage per wallet';
COMMENT ON TABLE mcp_processed_matches IS 'Tracks which matches have been processed/rewarded';
COMMENT ON TABLE mcp_audit_log IS 'Audit trail for all MCP security events';
