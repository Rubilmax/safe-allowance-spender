import SafeApiKit from "@safe-global/api-kit";
import { createDecipheriv } from "crypto";

import { Hex, createWalletClient, http, isHex, Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export class Spender {
  readonly #signers;

  constructor(public readonly safeKit: SafeApiKit) {
    const secretKey = process.env.ENCRYPTION_SECRET_KEY;
    if (!secretKey) throw Error("unknown secret key");

    const iv = process.env.ENCRYPTION_IV;
    if (!iv) throw Error("unknown iv");

    const encryptedPrivateKeys = process.env.ENCRYPTED_PRIVATE_KEYS;
    if (!encryptedPrivateKeys) throw Error("unknown encrypted private keys");

    const decipher = createDecipheriv("aes-256-cbc", Buffer.from(secretKey, "hex"), Buffer.from(iv, "hex"));
    const __decryptedPrivateKeys = Buffer.concat([
      decipher.update(Buffer.from(encryptedPrivateKeys, "hex")),
      decipher.final(),
    ]).toString("utf8");

    const __privateKeys = __decryptedPrivateKeys.split(",");
    if (__privateKeys.length === 0) throw Error("unknown private keys");
    if (__privateKeys.some((privateKey) => !isHex(privateKey))) throw Error("invalid private key");

    this.#signers = (__privateKeys as Hex[])
      .map(privateKeyToAccount)
      .map((account) => createWalletClient({ account, transport: http(process.env.TENDERLY_RPC_URL) }));
  }

  public confirmTransaction(safeTxHash: Hex) {
    return Promise.all(
      this.#signers.map(async (signer) => {
        const signature = await signer.signMessage({ message: safeTxHash });

        return this.safeKit.confirmTransaction(safeTxHash, signature);
      }),
    );
  }
}
