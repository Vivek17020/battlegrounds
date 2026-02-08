// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ═══════════════════════════════════════════════════════════════
 *  MONARD TOKEN — ERC-20 with Restricted Minting
 * ═══════════════════════════════════════════════════════════════
 *
 *  Security Design Decisions:
 *
 *  1. FIXED MAX SUPPLY — Hard cap of 100,000,000 MONARD prevents
 *     inflation attacks. Once reached, no more tokens can ever
 *     be minted, even by privileged roles.
 *
 *  2. ROLE-BASED MINTING — Only the MINTER_ROLE (assigned to the
 *     RewardController contract) can mint. There is NO public
 *     mint function. This prevents unauthorized token creation.
 *
 *  3. TWO-STEP OWNERSHIP — Uses OpenZeppelin's Ownable2Step so
 *     ownership transfers require explicit acceptance, preventing
 *     accidental transfers to wrong addresses.
 *
 *  4. GRANULAR ROLES — Owner can grant/revoke MINTER_ROLE without
 *     redeploying. If a RewardController is compromised, its
 *     minting permission can be revoked immediately.
 *
 *  5. NO PAUSABLE/BLACKLIST — MVP keeps it simple. These can be
 *     added via upgrade patterns if needed post-launch.
 *
 *  Deployment target: EVM testnet (Sepolia, Base Goerli, etc.)
 * ═══════════════════════════════════════════════════════════════
 */

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract MonardToken is ERC20, Ownable2Step {

    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    /// @notice Absolute maximum supply: 100 million MONARD (18 decimals)
    /// @dev Immutable cap — cannot be changed after deployment
    uint256 public constant MAX_SUPPLY = 100_000_000 * 1e18;

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice Addresses authorized to mint (RewardController contracts)
    /// @dev Mapping used instead of a single address to support future
    ///      controller upgrades without redeployment
    mapping(address => bool) private _minters;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when tokens are minted as a gameplay reward
    /// @param minter  The RewardController that initiated the mint
    /// @param to      The player receiving the reward
    /// @param amount  Number of tokens minted (18 decimals)
    event RewardMinted(
        address indexed minter,
        address indexed to,
        uint256 amount
    );

    /// @notice Emitted when a minter role is granted
    /// @param account The address granted minting permission
    /// @param grantedBy The owner who granted the role
    event MinterGranted(address indexed account, address indexed grantedBy);

    /// @notice Emitted when a minter role is revoked
    /// @param account The address whose minting permission was revoked
    /// @param revokedBy The owner who revoked the role
    event MinterRevoked(address indexed account, address indexed revokedBy);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @dev Caller is not an authorized minter
    error NotAuthorizedMinter(address caller);

    /// @dev Mint would exceed the fixed max supply
    error MaxSupplyExceeded(uint256 requested, uint256 available);

    /// @dev Cannot grant/revoke minter role to zero address
    error ZeroAddress();

    /// @dev Mint amount must be greater than zero
    error ZeroAmount();

    // ──────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────

    /// @dev Restricts function access to authorized minters only
    modifier onlyMinter() {
        if (!_minters[msg.sender]) {
            revert NotAuthorizedMinter(msg.sender);
        }
        _;
    }

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /// @notice Deploys the MONARD token with zero initial supply
    /// @dev No tokens are pre-minted. All tokens enter circulation
    ///      exclusively through the RewardController mint path.
    ///      The deployer becomes the owner (can manage minter roles).
    constructor() ERC20("MONARD", "MNRD") Ownable(msg.sender) {
        // No pre-mint — supply starts at 0
        // Owner will call grantMinter() to authorize the RewardController
    }

    // ──────────────────────────────────────────────
    //  Minting (Restricted)
    // ──────────────────────────────────────────────

    /// @notice Mint MONARD tokens to a player as a gameplay reward
    /// @dev Only callable by addresses with MINTER_ROLE.
    ///      Reverts if minting would exceed MAX_SUPPLY.
    ///      In production, the RewardController calls this after
    ///      the MCP server validates the reward via AI decision.
    /// @param to     Recipient address (the player's wallet)
    /// @param amount Number of tokens to mint (18 decimals)
    function mint(address to, uint256 amount) external onlyMinter {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        // Check supply cap BEFORE minting to fail fast
        uint256 available = MAX_SUPPLY - totalSupply();
        if (amount > available) {
            revert MaxSupplyExceeded(amount, available);
        }

        _mint(to, amount);

        emit RewardMinted(msg.sender, to, amount);
    }

    // ──────────────────────────────────────────────
    //  Access Control (Owner Only)
    // ──────────────────────────────────────────────

    /// @notice Grant minting permission to a RewardController contract
    /// @dev Only the owner can call this. Emits MinterGranted event.
    ///      The RewardController address should be verified before
    ///      granting — once granted it can mint up to MAX_SUPPLY.
    /// @param account Address to authorize as a minter
    function grantMinter(address account) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        _minters[account] = true;
        emit MinterGranted(account, msg.sender);
    }

    /// @notice Revoke minting permission from an address
    /// @dev Emergency function — call immediately if a controller
    ///      is compromised. Tokens already minted cannot be clawed
    ///      back, but further minting is stopped.
    /// @param account Address to revoke minting permission from
    function revokeMinter(address account) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        _minters[account] = false;
        emit MinterRevoked(account, msg.sender);
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /// @notice Check if an address has minting permission
    /// @param account Address to check
    /// @return True if the address is an authorized minter
    function isMinter(address account) external view returns (bool) {
        return _minters[account];
    }

    /// @notice Returns how many tokens can still be minted
    /// @return Number of tokens remaining before MAX_SUPPLY is reached
    function mintableSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }
}
