import { SafeMultisigTransactionResponse } from "@safe-global/safe-core-sdk-types";

import {
  Address,
  Hex,
  RpcSchema,
  Transport,
  concatHex,
  createPublicClient,
  encodeFunctionData,
  http,
  padHex,
  toHex,
  zeroHash,
} from "viem";

import gnosisSafeL2 from "./abis/GnosisSafeL2";
import { safeAddress } from "./constants";

export const client = createPublicClient<Transport, undefined, undefined, RpcSchema>({
  transport: http(process.env.TENDERLY_RPC_URL, { batch: true }),
});

export const simulateTransaction = ({
  to,
  value,
  data,
  operation,
  nonce,
  safeTxGas,
  baseGas,
  gasPrice,
  gasToken,
  refundReceiver,
  proposer,
}: Pick<
  SafeMultisigTransactionResponse,
  | "to"
  | "value"
  | "data"
  | "operation"
  | "nonce"
  | "safeTxGas"
  | "baseGas"
  | "gasPrice"
  | "gasToken"
  | "refundReceiver"
  | "proposer"
>) =>
  client.request<{
    Method: "tenderly_simulateTransaction";
    Parameters: unknown;
    ReturnType:
      | { status: false }
      | {
          status: true;
          balanceChanges?: {
            address: Address;
            dollarValue: string;
            transfers: number[];
          }[];
        };
  }>({
    method: "tenderly_simulateTransaction",
    params: [
      {
        from: proposer,
        to: safeAddress,
        input: encodeFunctionData({
          abi: gnosisSafeL2,
          functionName: "execTransaction",
          args: [
            to as Hex,
            BigInt(value),
            data as Hex,
            operation,
            BigInt(safeTxGas),
            BigInt(baseGas),
            BigInt(gasPrice),
            gasToken as Hex,
            refundReceiver as Hex,
            concatHex([padHex(proposer as Hex, { size: 32 }), zeroHash, toHex(1, { size: 1 })]),
          ],
        }),
        gas: toHex(30_000_000),
        gas_price: toHex(0),
      },
      "latest",
      {
        [safeAddress]: {
          stateDiff: {
            [toHex(4, { size: 32 })]: toHex(1, { size: 32 }),
            [toHex(5, { size: 32 })]: toHex(nonce, { size: 32 }),
          },
        },
      },
    ],
  });

export const traceTransaction = (txHash: string) =>
  client.request<{
    Method: "tenderly_traceTransaction";
    Parameters: unknown;
    ReturnType:
      | { status: false }
      | {
          status: true;
          logs: {
            name: string;
            anonymous: boolean;
            inputs: {
              type: string;
              name: string;
              value: string;
            }[];
            raw: {
              address: Address;
              topic: Hex[];
              data: Hex;
            };
          }[];
          balanceChanges?: {
            address: Address;
            dollarValue: string;
            transfers: number[];
          }[];
        };
  }>({
    method: "tenderly_traceTransaction",
    params: [txHash],
  });
