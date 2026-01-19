export const computeMerchantNet = (gross: number, platformFee: number, stripeFee: number) => {
  return Math.max(0, (gross ?? 0) - (platformFee ?? 0) - (stripeFee ?? 0));
};

export const computeProportionalAmount = (base: number, refundAmount: number, gross: number) => {
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) return 0;
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  const numerator = base * refundAmount + gross / 2;
  return Math.floor(numerator / gross);
};

export const computeRefundBreakdown = (params: {
  gross: number;
  platformFee: number;
  merchantNet: number;
  refundAmount: number;
}) => {
  const refundPlatformFee = computeProportionalAmount(params.platformFee, params.refundAmount, params.gross);
  const reverseMerchant = Math.max(0, (params.refundAmount ?? 0) - refundPlatformFee);
  return {
    refundPlatformFee,
    reverseMerchant,
  };
};
