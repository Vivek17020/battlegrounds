// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MonardAMM
 * @notice Simple constant-product AMM for MONARD ↔ Quote token swaps
 * @dev MVP implementation — not production-ready
 * 
 * Formula: x * y = k (constant product)
 * Fee: 0.3% on swaps
 */
contract MonardAMM is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ══════════════════════════════════════════════════════════════════════

    uint256 public constant FEE_NUMERATOR = 3;
    uint256 public constant FEE_DENOMINATOR = 1000; // 0.3% fee
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    // ══════════════════════════════════════════════════════════════════════
    // STATE
    // ══════════════════════════════════════════════════════════════════════

    IERC20 public immutable monardToken;
    IERC20 public immutable quoteToken; // USDC or WETH

    uint256 public reserveMonard;
    uint256 public reserveQuote;

    uint256 public totalLiquidity;
    mapping(address => uint256) public liquidity;

    // ══════════════════════════════════════════════════════════════════════
    // EVENTS
    // ══════════════════════════════════════════════════════════════════════

    event LiquidityAdded(
        address indexed provider,
        uint256 monardAmount,
        uint256 quoteAmount,
        uint256 liquidityMinted
    );

    event LiquidityRemoved(
        address indexed provider,
        uint256 monardAmount,
        uint256 quoteAmount,
        uint256 liquidityBurned
    );

    event Swap(
        address indexed trader,
        bool monardToQuote,
        uint256 inputAmount,
        uint256 outputAmount
    );

    // ══════════════════════════════════════════════════════════════════════
    // ERRORS
    // ══════════════════════════════════════════════════════════════════════

    error ZeroAmount();
    error InsufficientLiquidity();
    error InsufficientOutputAmount();
    error InvalidRatio();
    error SlippageExceeded();

    // ══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ══════════════════════════════════════════════════════════════════════

    /**
     * @param _monardToken Address of MONARD ERC-20
     * @param _quoteToken Address of quote token (USDC/WETH)
     */
    constructor(address _monardToken, address _quoteToken) {
        monardToken = IERC20(_monardToken);
        quoteToken = IERC20(_quoteToken);
    }

    // ══════════════════════════════════════════════════════════════════════
    // LIQUIDITY FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════

    /**
     * @notice Add liquidity to the pool
     * @param monardAmount Amount of MONARD to deposit
     * @param quoteAmount Amount of quote token to deposit
     * @param minLiquidity Minimum LP tokens to receive (slippage protection)
     * @return liquidityMinted Amount of LP tokens minted
     */
    function addLiquidity(
        uint256 monardAmount,
        uint256 quoteAmount,
        uint256 minLiquidity
    ) external nonReentrant returns (uint256 liquidityMinted) {
        if (monardAmount == 0 || quoteAmount == 0) revert ZeroAmount();

        if (totalLiquidity == 0) {
            // First deposit — set initial ratio
            liquidityMinted = sqrt(monardAmount * quoteAmount) - MINIMUM_LIQUIDITY;
            totalLiquidity = MINIMUM_LIQUIDITY; // Lock minimum liquidity
        } else {
            // Subsequent deposits — must match current ratio
            uint256 monardOptimal = (quoteAmount * reserveMonard) / reserveQuote;
            uint256 quoteOptimal = (monardAmount * reserveQuote) / reserveMonard;

            // Allow 1% tolerance for rounding
            if (monardAmount < (monardOptimal * 99) / 100 && quoteAmount < (quoteOptimal * 99) / 100) {
                revert InvalidRatio();
            }

            // Calculate LP tokens based on smaller ratio
            uint256 liquidityFromMonard = (monardAmount * totalLiquidity) / reserveMonard;
            uint256 liquidityFromQuote = (quoteAmount * totalLiquidity) / reserveQuote;
            liquidityMinted = liquidityFromMonard < liquidityFromQuote 
                ? liquidityFromMonard 
                : liquidityFromQuote;
        }

        if (liquidityMinted < minLiquidity) revert SlippageExceeded();

        // Transfer tokens in
        monardToken.safeTransferFrom(msg.sender, address(this), monardAmount);
        quoteToken.safeTransferFrom(msg.sender, address(this), quoteAmount);

        // Update state
        reserveMonard += monardAmount;
        reserveQuote += quoteAmount;
        totalLiquidity += liquidityMinted;
        liquidity[msg.sender] += liquidityMinted;

        emit LiquidityAdded(msg.sender, monardAmount, quoteAmount, liquidityMinted);
    }

    /**
     * @notice Remove liquidity from the pool
     * @param liquidityAmount Amount of LP tokens to burn
     * @param minMonard Minimum MONARD to receive
     * @param minQuote Minimum quote tokens to receive
     * @return monardOut Amount of MONARD returned
     * @return quoteOut Amount of quote tokens returned
     */
    function removeLiquidity(
        uint256 liquidityAmount,
        uint256 minMonard,
        uint256 minQuote
    ) external nonReentrant returns (uint256 monardOut, uint256 quoteOut) {
        if (liquidityAmount == 0) revert ZeroAmount();
        if (liquidity[msg.sender] < liquidityAmount) revert InsufficientLiquidity();

        // Calculate proportional share
        monardOut = (liquidityAmount * reserveMonard) / totalLiquidity;
        quoteOut = (liquidityAmount * reserveQuote) / totalLiquidity;

        if (monardOut < minMonard || quoteOut < minQuote) revert SlippageExceeded();

        // Update state
        liquidity[msg.sender] -= liquidityAmount;
        totalLiquidity -= liquidityAmount;
        reserveMonard -= monardOut;
        reserveQuote -= quoteOut;

        // Transfer tokens out
        monardToken.safeTransfer(msg.sender, monardOut);
        quoteToken.safeTransfer(msg.sender, quoteOut);

        emit LiquidityRemoved(msg.sender, monardOut, quoteOut, liquidityAmount);
    }

    // ══════════════════════════════════════════════════════════════════════
    // SWAP FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════

    /**
     * @notice Swap MONARD for quote token
     * @param monardIn Amount of MONARD to sell
     * @param minQuoteOut Minimum quote tokens to receive
     * @return quoteOut Amount of quote tokens received
     */
    function swapMonardForQuote(
        uint256 monardIn,
        uint256 minQuoteOut
    ) external nonReentrant returns (uint256 quoteOut) {
        if (monardIn == 0) revert ZeroAmount();
        if (reserveQuote == 0) revert InsufficientLiquidity();

        quoteOut = getAmountOut(monardIn, reserveMonard, reserveQuote);
        if (quoteOut < minQuoteOut) revert SlippageExceeded();

        // Transfer tokens
        monardToken.safeTransferFrom(msg.sender, address(this), monardIn);
        quoteToken.safeTransfer(msg.sender, quoteOut);

        // Update reserves
        reserveMonard += monardIn;
        reserveQuote -= quoteOut;

        emit Swap(msg.sender, true, monardIn, quoteOut);
    }

    /**
     * @notice Swap quote token for MONARD
     * @param quoteIn Amount of quote tokens to sell
     * @param minMonardOut Minimum MONARD to receive
     * @return monardOut Amount of MONARD received
     */
    function swapQuoteForMonard(
        uint256 quoteIn,
        uint256 minMonardOut
    ) external nonReentrant returns (uint256 monardOut) {
        if (quoteIn == 0) revert ZeroAmount();
        if (reserveMonard == 0) revert InsufficientLiquidity();

        monardOut = getAmountOut(quoteIn, reserveQuote, reserveMonard);
        if (monardOut < minMonardOut) revert SlippageExceeded();

        // Transfer tokens
        quoteToken.safeTransferFrom(msg.sender, address(this), quoteIn);
        monardToken.safeTransfer(msg.sender, monardOut);

        // Update reserves
        reserveQuote += quoteIn;
        reserveMonard -= monardOut;

        emit Swap(msg.sender, false, quoteIn, monardOut);
    }

    // ══════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════

    /**
     * @notice Calculate output amount for a swap (with fee)
     * @dev Formula: outputAmount = (inputAmount * (1 - fee) * reserveOut) / (reserveIn + inputAmount * (1 - fee))
     */
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountOut) {
        if (amountIn == 0 || reserveIn == 0 || reserveOut == 0) return 0;

        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - FEE_NUMERATOR);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * FEE_DENOMINATOR) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /**
     * @notice Get current pool price (quote per MONARD)
     */
    function getPrice() external view returns (uint256) {
        if (reserveMonard == 0) return 0;
        return (reserveQuote * 1e18) / reserveMonard;
    }

    /**
     * @notice Get pool reserves
     */
    function getReserves() external view returns (uint256, uint256) {
        return (reserveMonard, reserveQuote);
    }

    /**
     * @notice Calculate price impact for a swap
     * @param amountIn Input amount
     * @param monardToQuote Direction of swap
     * @return priceImpact Impact in basis points (1 = 0.01%)
     */
    function getPriceImpact(
        uint256 amountIn,
        bool monardToQuote
    ) external view returns (uint256 priceImpact) {
        uint256 reserveIn = monardToQuote ? reserveMonard : reserveQuote;
        uint256 reserveOut = monardToQuote ? reserveQuote : reserveMonard;
        
        if (reserveIn == 0 || reserveOut == 0) return 0;

        uint256 spotPrice = (reserveOut * 1e18) / reserveIn;
        uint256 amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        uint256 executionPrice = (amountOut * 1e18) / amountIn;

        if (spotPrice == 0) return 0;
        priceImpact = ((spotPrice - executionPrice) * 10000) / spotPrice;
    }

    // ══════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════

    /**
     * @notice Babylonian square root
     */
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
