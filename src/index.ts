import SafeApiKit from "@safe-global/api-kit";
import { EventBridgeHandler, APIGatewayProxyResult } from "aws-lambda";

import {
  Address,
  Hex,
  RpcSchema,
  Transport,
  concatHex,
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  http,
  isHex,
  padHex,
  toHex,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import gnosisSafeL2 from "./abis/GnosisSafeL2";

const safeAddress = "0xBAaF2b6872Eda03Ab675f46b558E345DF3b70Df4";

const privateKeys = process.env.PRIVATE_KEYS?.split(",");
if (!privateKeys || privateKeys.length === 0) throw Error("unknown private keys");
if (privateKeys.some((privateKey) => !isHex(privateKey))) throw Error("invalid private key");

const accounts = (privateKeys as Hex[]).map(privateKeyToAccount);
const signers = accounts.map((account) =>
  createWalletClient({ account, transport: http(process.env.TENDERLY_RPC_URL) }),
);

const client = createPublicClient<Transport, undefined, undefined, RpcSchema>({
  transport: http(process.env.TENDERLY_RPC_URL, { batch: true }),
});

export const handler: EventBridgeHandler<"Scheduled Event", {}, APIGatewayProxyResult> = async (event, context) => {
  const chainId = await client.getChainId();

  const safeKit = new SafeApiKit({ chainId: BigInt(chainId) });

  const pendingTransactions = await safeKit.getPendingTransactions(safeAddress);

  const results = await Promise.all(
    pendingTransactions.results.map(
      async ({
        safeTxHash,
        nonce,
        to,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        trusted,
        proposer,
      }) => {
        const label = `${safeTxHash} (#${nonce})`;
        if (!data) return [label, "no data"];
        if (!trusted) return [label, "not trusted"];

        try {
          const result = await client.request<{
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

          if (!result.status) throw Error("reverted");

          console.log(result.balanceChanges);

          if (result.balanceChanges) {
            const safeBalanceChanges = result.balanceChanges.filter(
              ({ address }) => address.toLowerCase() === safeAddress.toLowerCase(),
            );
            const safeDollarValueChange = safeBalanceChanges.reduce(
              (acc, { dollarValue }) => acc + parseFloat(dollarValue),
              0,
            );

            if (safeDollarValueChange < 0) throw Error("daily limit exceeded");
          }

          await Promise.all(
            signers.map(async (signer) => {
              const signature = await signer.signMessage({ message: safeTxHash });

              return safeKit.confirmTransaction(safeTxHash, signature);
            }),
          );

          return [label, "signed"];
        } catch (error: any) {
          console.error(error);

          return [label, error.message];
        }
      },
    ),
  );

  return {
    statusCode: 200,
    body: JSON.stringify(Object.fromEntries(results)),
  };
};
