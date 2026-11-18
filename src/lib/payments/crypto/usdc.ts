/**
 * Montos y links de USDC, sin nada del servidor: los usan los adaptadores de cada red y el diálogo de depósito.
 * USDC tiene 6 decimales en Solana y en Base, así que una unidad mínima es un µUSD.
 */

/** `25370000` → `"25.37"`. El monto literal que se escribe en una wallet: con punto y sin separador de miles. */
export function usdcDecimal(micros: bigint): string {
  const whole = micros / BigInt(1_000_000);
  const fraction = (micros % BigInt(1_000_000)).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

/** Solana Pay: la wallet abre la transferencia con el USDC ya elegido. */
export function solanaPayUrl(depositAddress: string, mint: string): string {
  return `solana:${depositAddress}?spl-token=${mint}&label=cheapllm.wtf`;
}

/** EIP-681: las wallets que lo entienden abren la transferencia de USDC en esa cadena. */
export function eip681Url(depositAddress: string, token: string, chainId: number): string {
  return `ethereum:${token}@${chainId}/transfer?address=${depositAddress}`;
}

/** El mismo link con el monto puesto, para quien deposita lo que le falta para una compra. */
export function walletUrlWithAmount(network: "solana" | "base", url: string, micros: bigint): string {
  return network === "solana" ? `${url}&amount=${usdcDecimal(micros)}` : `${url}&uint256=${micros.toString()}`;
}
