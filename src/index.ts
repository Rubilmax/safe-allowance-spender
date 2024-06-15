import SafeApiKit, { SafeMultisigTransactionWithTransfersResponse } from "@safe-global/api-kit";
import { EventBridgeHandler, APIGatewayProxyResult } from "aws-lambda";

import { Address, Hex } from "viem";

import { Spender } from "./Spender";
import { allowancePeriodMs, proposerPeriodicAllowances, safeAddress } from "./constants";
import * as tenderly from "./tenderly";

export const handler: EventBridgeHandler<"Scheduled Event", {}, APIGatewayProxyResult> = async (event, context) => {
  const chainId = await tenderly.client.getChainId();

  const spender = new Spender(new SafeApiKit({ chainId: BigInt(chainId) }));

  const [pendingTransactions, executedTransactions] = await Promise.all([
    spender.safeKit.getPendingTransactions(safeAddress),
    spender.safeKit.getAllTransactions(safeAddress, { executed: true, queued: false }),
  ]);

  const latestExecutedTransactions = executedTransactions.results.filter(
    ({ executionDate, ...rest }) =>
      rest.txType === "MULTISIG_TRANSACTION" &&
      rest.isExecuted &&
      rest.isSuccessful &&
      new Date(executionDate).getTime() > Date.now() - allowancePeriodMs,
  ) as SafeMultisigTransactionWithTransfersResponse[];

  const latestExecutedTraces = await Promise.all(
    latestExecutedTransactions.map(async (tx) => {
      const result = await tenderly.traceTransaction(tx.transactionHash);

      if (!result.status) throw Error(`could not trace executed tx: ${tx.transactionHash}`);

      return { tx, result };
    }),
  );

  const results = await Promise.all(
    pendingTransactions.results.map(async ({ safeTxHash, trusted, ...tx }) => {
      const label = `${safeTxHash} (#${tx.nonce})`;
      if (!trusted) return [label, "not trusted"];

      const proposer = tx.proposer.toLowerCase() as Address;
      const proposerPeriodicAllowance = proposerPeriodicAllowances[proposer];
      if (!proposerPeriodicAllowance) return [label, "unauthorized proposer"];

      try {
        const result = await tenderly.simulateTransaction(tx);

        if (!result.status) throw Error("reverted");

        if (!result.balanceChanges) return [label, "no balance changes"];

        const latestSafeDollarValueChange = latestExecutedTraces
          .filter(({ tx: latestTx }) => latestTx.proposer.toLowerCase() === proposer)
          .reduce((acc, { result: latestResult }) => {
            const latestTxSafeBalanceChanges =
              latestResult.balanceChanges?.filter(
                ({ address }) => address.toLowerCase() === safeAddress.toLowerCase(),
              ) ?? [];
            const latestTxSafeDollarValueChange = latestTxSafeBalanceChanges.reduce(
              (acc, { dollarValue }) => acc + parseFloat(dollarValue),
              0,
            );

            return acc + latestTxSafeDollarValueChange;
          }, 0);

        const safeBalanceChanges = result.balanceChanges.filter(
          ({ address }) => address.toLowerCase() === safeAddress.toLowerCase(),
        );
        const safeDollarValueChange = safeBalanceChanges.reduce(
          (acc, { dollarValue }) => acc + parseFloat(dollarValue),
          0,
        );

        try {
          Number(latestSafeDollarValueChange + safeDollarValueChange);
        } catch {
          throw Error("invalid dollar value change");
        }

        if (latestSafeDollarValueChange + safeDollarValueChange > proposerPeriodicAllowance)
          throw Error("periodic limit exceeded");

        await spender.confirmTransaction(safeTxHash as Hex);

        return [label, "signed"];
      } catch (error: any) {
        console.error(error);

        return [label, error.message];
      }
    }),
  );

  return {
    statusCode: 200,
    body: JSON.stringify(Object.fromEntries(results)),
  };
};
