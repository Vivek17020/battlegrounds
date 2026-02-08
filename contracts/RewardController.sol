// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ═══════════════════════════════════════════════════════════════
 *  REWARD CONTROLLER — MCP-Authorized Token Distribution
 * ═══════════════════════════════════════════════════════════════
 *
 *  Security Design Decisions:
 *
 *  1. MCP-ONLY MINTING — Only the designated MCP server address
 *     can call grantReward(). This ensures all rewards pass through
 *     the AI validation pipeline before on-chain execution.
 *
 *  2. PER-MATCH CAP — Hard limit of 1000 MONARD per single match
 *     prevents exploit attempts from draining tokens via a single
 *     compromised match submission.
 *
 *  3. DAILY WALLET CAP — Each wallet can only receive 5000 MONARD
 *     per 24-hour period. Limits damage from bot farms or Sybil
 *     attacks even if they bypass bot detection.
 *
 *  4. MATCH ID UNIQUENESS — Each matchId can only be rewarded once.
 *     Prevents replay attacks where the same match result is
 *     submitted multiple times.
 *
 *  5. TWO-STEP MCP TRANSFER — Changing the MCP address requires
 *     the new address to accept, preventing accidental lockouts.
 *
 *  6. EMERGENCY PAUSE — Owner can pause all rewards if an exploit
 *     is detected, without revoking MCP access entirely.
 *
 *  Integration: MCP server calls grantReward() after AI validation.
 *  This contract then calls MonardToken.mint() to distribute tokens.
 * ═══════════════════════════════════════════════════════════════
 */

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Interface for the MonardToken mint function
interface IMonardToken {
    function mint(address to, uint256 amount) external;
}

contract RewardController is Ownable2Step, Pausable {

    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    /// @notice Maximum MONARD reward allowed per single match
    /// @dev Prevents single-match exploits from draining supply
    uint256 public constant MAX_REWARD_PER_MATCH = 1000 * 1e18;

    /// @notice Maximum MONARD a wallet can receive in 24 hours
    /// @dev Limits bot farm / Sybil attack damage
    uint256 public constant DAILY_WALLET_CAP = 5000 * 1e18;

    /// @notice Duration of the daily cap window (24 hours)
    uint256 public constant DAY_DURATION = 1 days;

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice The MONARD token contract
    IMonardToken public immutable monardToken;

    /// @notice Address authorized to call grantReward (MCP server)
    address public mcpAddress;

    /// @notice Pending MCP address for two-step transfer
    address public pendingMcpAddress;

    /// @notice Tracks which matchIds have already been rewarded
    mapping(bytes32 => bool) public matchRewarded;

    /// @notice Tracks daily rewards per wallet: wallet => day => amount
    /// @dev Day is calculated as block.timestamp / DAY_DURATION
    mapping(address => mapping(uint256 => uint256)) public dailyRewards;

    /// @notice Total rewards distributed through this controller
    uint256 public totalRewardsDistributed;

    /// @notice Count of unique matches rewarded
    uint256 public totalMatchesRewarded;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when a player receives a match reward
    /// @param matchId Unique identifier for the match
    /// @param player The wallet receiving the reward
    /// @param amount MONARD tokens rewarded (18 decimals)
    /// @param timestamp Block timestamp of the reward
    event RewardGranted(
        bytes32 indexed matchId,
        address indexed player,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice Emitted when MCP address transfer is initiated
    /// @param currentMcp The current MCP address
    /// @param pendingMcp The proposed new MCP address
    event McpTransferInitiated(
        address indexed currentMcp,
        address indexed pendingMcp
    );

    /// @notice Emitted when MCP address transfer is completed
    /// @param previousMcp The old MCP address
    /// @param newMcp The new MCP address
    event McpTransferCompleted(
        address indexed previousMcp,
        address indexed newMcp
    );

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @dev Caller is not the authorized MCP address
    error OnlyMCP(address caller);

    /// @dev Reward amount exceeds per-match maximum
    error ExceedsMatchCap(uint256 requested, uint256 maxAllowed);

    /// @dev Player would exceed daily wallet cap
    error ExceedsDailyCap(address player, uint256 requested, uint256 remaining);

    /// @dev Match has already been rewarded
    error MatchAlreadyRewarded(bytes32 matchId);

    /// @dev Invalid address (zero address)
    error ZeroAddress();

    /// @dev Reward amount must be greater than zero
    error ZeroAmount();

    /// @dev Caller is not the pending MCP address
    error NotPendingMcp(address caller);

    // ──────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────

    /// @dev Restricts function access to the MCP server only
    modifier onlyMCP() {
        if (msg.sender != mcpAddress) {
            revert OnlyMCP(msg.sender);
        }
        _;
    }

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /// @notice Deploy the RewardController
    /// @param _monardToken Address of the MONARD token contract
    /// @param _mcpAddress Address of the MCP server authorized to grant rewards
    constructor(
        address _monardToken,
        address _mcpAddress
    ) Ownable(msg.sender) {
        if (_monardToken == address(0)) revert ZeroAddress();
        if (_mcpAddress == address(0)) revert ZeroAddress();

        monardToken = IMonardToken(_monardToken);
        mcpAddress = _mcpAddress;
    }

    // ──────────────────────────────────────────────
    //  Core Reward Function (MCP Only)
    // ──────────────────────────────────────────────

    /// @notice Grant MONARD reward to a player for completing a match
    /// @dev Only callable by the MCP server. Enforces all caps and uniqueness.
    /// @param matchId Unique identifier for the match (prevents replay)
    /// @param player Wallet address to receive the reward
    /// @param amount MONARD tokens to mint (18 decimals)
    function grantReward(
        bytes32 matchId,
        address player,
        uint256 amount
    ) external onlyMCP whenNotPaused {
        // ── Validate inputs ──
        if (player == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        // ── Check per-match cap ──
        if (amount > MAX_REWARD_PER_MATCH) {
            revert ExceedsMatchCap(amount, MAX_REWARD_PER_MATCH);
        }

        // ── Check match uniqueness ──
        if (matchRewarded[matchId]) {
            revert MatchAlreadyRewarded(matchId);
        }

        // ── Check daily wallet cap ──
        uint256 currentDay = block.timestamp / DAY_DURATION;
        uint256 todayTotal = dailyRewards[player][currentDay];
        uint256 remaining = DAILY_WALLET_CAP > todayTotal 
            ? DAILY_WALLET_CAP - todayTotal 
            : 0;

        if (amount > remaining) {
            revert ExceedsDailyCap(player, amount, remaining);
        }

        // ── Update state BEFORE external call (CEI pattern) ──
        matchRewarded[matchId] = true;
        dailyRewards[player][currentDay] = todayTotal + amount;
        totalRewardsDistributed += amount;
        totalMatchesRewarded += 1;

        // ── Mint tokens to player ──
        monardToken.mint(player, amount);

        // ── Emit event ──
        emit RewardGranted(matchId, player, amount, block.timestamp);
    }

    // ──────────────────────────────────────────────
    //  MCP Address Management (Two-Step)
    // ──────────────────────────────────────────────

    /// @notice Initiate transfer of MCP privileges to a new address
    /// @dev Only owner can initiate. New address must call acceptMcp().
    /// @param newMcp The proposed new MCP address
    function transferMcp(address newMcp) external onlyOwner {
        if (newMcp == address(0)) revert ZeroAddress();
        pendingMcpAddress = newMcp;
        emit McpTransferInitiated(mcpAddress, newMcp);
    }

    /// @notice Accept MCP privileges (called by pending MCP address)
    /// @dev Completes the two-step transfer process
    function acceptMcp() external {
        if (msg.sender != pendingMcpAddress) {
            revert NotPendingMcp(msg.sender);
        }

        address previousMcp = mcpAddress;
        mcpAddress = pendingMcpAddress;
        pendingMcpAddress = address(0);

        emit McpTransferCompleted(previousMcp, mcpAddress);
    }

    /// @notice Cancel pending MCP transfer
    /// @dev Only owner can cancel
    function cancelMcpTransfer() external onlyOwner {
        pendingMcpAddress = address(0);
    }

    // ──────────────────────────────────────────────
    //  Emergency Controls (Owner Only)
    // ──────────────────────────────────────────────

    /// @notice Pause all reward distribution
    /// @dev Call immediately if exploit detected
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume reward distribution
    /// @dev Only call after exploit is resolved
    function unpause() external onlyOwner {
        _unpause();
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /// @notice Get remaining daily reward capacity for a wallet
    /// @param player Wallet address to check
    /// @return Remaining MONARD that can be rewarded today
    function dailyRemainingFor(address player) external view returns (uint256) {
        uint256 currentDay = block.timestamp / DAY_DURATION;
        uint256 used = dailyRewards[player][currentDay];
        return DAILY_WALLET_CAP > used ? DAILY_WALLET_CAP - used : 0;
    }

    /// @notice Get total rewards received by a wallet today
    /// @param player Wallet address to check
    /// @return MONARD rewarded to this wallet today
    function dailyRewardedFor(address player) external view returns (uint256) {
        uint256 currentDay = block.timestamp / DAY_DURATION;
        return dailyRewards[player][currentDay];
    }

    /// @notice Check if a match has already been rewarded
    /// @param matchId The match identifier to check
    /// @return True if this match has already received a reward
    function isMatchRewarded(bytes32 matchId) external view returns (bool) {
        return matchRewarded[matchId];
    }

    /// @notice Get the current day number (for debugging/monitoring)
    /// @return Current day as timestamp / DAY_DURATION
    function currentDayNumber() external view returns (uint256) {
        return block.timestamp / DAY_DURATION;
    }
}
