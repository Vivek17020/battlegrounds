// ============================================
// MCP SERVER — SMART CONTRACT INTERACTION
// Calls RewardController via ethers.js-compatible Deno library
// ============================================

// Note: Using ethers v6 compatible patterns for Deno
// In production, you'd use: import { ethers } from "npm:ethers@6";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
export interface ContractConfig {
  rpcUrl: string;
  chainId: number;
  rewardControllerAddress: string;
  privateKey: string;
}

export interface GrantRewardParams {
  matchId: string;
  playerAddress: string;
  amount: number; // In whole tokens (will be converted to wei)
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  error?: string;
  errorCode?: string;
}

export interface ContractReadResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ─────────────────────────────────────────────
// REWARD CONTROLLER ABI (minimal for grantReward)
// ─────────────────────────────────────────────
const REWARD_CONTROLLER_ABI = [
  // grantReward(bytes32 matchId, address player, uint256 amount)
  {
    inputs: [
      { name: 'matchId', type: 'bytes32' },
      { name: 'player', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'grantReward',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // dailyRemainingFor(address player) returns (uint256)
  {
    inputs: [{ name: 'player', type: 'address' }],
    name: 'dailyRemainingFor',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // isMatchRewarded(bytes32 matchId) returns (bool)
  {
    inputs: [{ name: 'matchId', type: 'bytes32' }],
    name: 'isMatchRewarded',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  // paused() returns (bool)
  {
    inputs: [],
    name: 'paused',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// ─────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────

// Convert string to bytes32 (keccak256 hash of matchId)
function matchIdToBytes32(matchId: string): string {
  // Simple hash for demo - in production use proper keccak256
  const encoder = new TextEncoder();
  const data = encoder.encode(matchId);
  
  // Create a deterministic bytes32 from matchId
  // This is a simplified version - use ethers.keccak256 in production
  let hash = 0n;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 8n) | BigInt(data[i]);
    hash = hash & ((1n << 256n) - 1n); // Keep it 256 bits
  }
  
  return '0x' + hash.toString(16).padStart(64, '0');
}

// Convert token amount to wei (18 decimals)
function toWei(amount: number): string {
  const wei = BigInt(Math.floor(amount * 1e18));
  return wei.toString();
}

// ─────────────────────────────────────────────
// CONTRACT SERVICE CLASS
// ─────────────────────────────────────────────
export class ContractService {
  private config: ContractConfig;
  private initialized: boolean = false;

  constructor() {
    this.config = {
      rpcUrl: Deno.env.get('BLOCKCHAIN_RPC_URL') || '',
      chainId: parseInt(Deno.env.get('BLOCKCHAIN_CHAIN_ID') || '1'),
      rewardControllerAddress: Deno.env.get('REWARD_CONTROLLER_ADDRESS') || '',
      privateKey: Deno.env.get('MCP_PRIVATE_KEY') || '',
    };
  }

  async initialize(): Promise<boolean> {
    // Validate configuration
    if (!this.config.rpcUrl) {
      console.error('[CONTRACT] Missing BLOCKCHAIN_RPC_URL');
      return false;
    }
    if (!this.config.rewardControllerAddress) {
      console.error('[CONTRACT] Missing REWARD_CONTROLLER_ADDRESS');
      return false;
    }
    if (!this.config.privateKey) {
      console.error('[CONTRACT] Missing MCP_PRIVATE_KEY');
      return false;
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(this.config.rewardControllerAddress)) {
      console.error('[CONTRACT] Invalid REWARD_CONTROLLER_ADDRESS format');
      return false;
    }

    this.initialized = true;
    console.log('[CONTRACT] Service initialized');
    return true;
  }

  // ─────────────────────────────────────────────
  // GRANT REWARD (Main function)
  // ─────────────────────────────────────────────
  async grantReward(params: GrantRewardParams): Promise<TransactionResult> {
    if (!this.initialized) {
      const initSuccess = await this.initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Contract service not initialized',
          errorCode: 'NOT_INITIALIZED',
        };
      }
    }

    try {
      console.log('[CONTRACT] Granting reward:', {
        matchId: params.matchId,
        player: params.playerAddress,
        amount: params.amount,
      });

      // Convert matchId to bytes32
      const matchIdBytes32 = matchIdToBytes32(params.matchId);
      const amountWei = toWei(params.amount);

      // In production, this would use ethers.js to:
      // 1. Create a wallet from private key
      // 2. Connect to provider
      // 3. Create contract instance
      // 4. Call grantReward()

      // For now, simulate the transaction
      // TODO: Replace with actual ethers.js call when deploying
      const simulatedTxHash = '0x' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 32);

      console.log('[CONTRACT] Transaction submitted:', {
        txHash: simulatedTxHash,
        matchIdBytes32,
        amountWei,
      });

      // Simulate confirmation delay
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        success: true,
        txHash: simulatedTxHash,
        blockNumber: Math.floor(Date.now() / 1000),
        gasUsed: '85000',
      };

    } catch (error) {
      console.error('[CONTRACT] Grant reward error:', error);

      // Parse common contract errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      let errorCode = 'UNKNOWN_ERROR';

      if (errorMessage.includes('MatchAlreadyRewarded')) {
        errorCode = 'MATCH_ALREADY_REWARDED';
      } else if (errorMessage.includes('ExceedsDailyCap')) {
        errorCode = 'EXCEEDS_DAILY_CAP';
      } else if (errorMessage.includes('ExceedsMatchCap')) {
        errorCode = 'EXCEEDS_MATCH_CAP';
      } else if (errorMessage.includes('OnlyMCP')) {
        errorCode = 'UNAUTHORIZED_MCP';
      } else if (errorMessage.includes('Pausable: paused')) {
        errorCode = 'CONTRACT_PAUSED';
      }

      return {
        success: false,
        error: errorMessage,
        errorCode,
      };
    }
  }

  // ─────────────────────────────────────────────
  // READ FUNCTIONS
  // ─────────────────────────────────────────────
  async getDailyRemaining(playerAddress: string): Promise<ContractReadResult> {
    try {
      // Simulate read - in production use ethers.js contract.dailyRemainingFor()
      console.log('[CONTRACT] Reading daily remaining for:', playerAddress);
      
      return {
        success: true,
        data: 5000n * 10n ** 18n, // 5000 MONARD in wei
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Read failed',
      };
    }
  }

  async isMatchRewarded(matchId: string): Promise<ContractReadResult> {
    try {
      const matchIdBytes32 = matchIdToBytes32(matchId);
      console.log('[CONTRACT] Checking match rewarded:', matchIdBytes32);
      
      return {
        success: true,
        data: false, // Simulate not rewarded
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Read failed',
      };
    }
  }

  async isPaused(): Promise<ContractReadResult> {
    try {
      return {
        success: true,
        data: false, // Simulate not paused
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Read failed',
      };
    }
  }
}

// ─────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────
let contractServiceInstance: ContractService | null = null;

export function getContractService(): ContractService {
  if (!contractServiceInstance) {
    contractServiceInstance = new ContractService();
  }
  return contractServiceInstance;
}
