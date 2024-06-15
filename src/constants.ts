import { Address } from "viem";

export const safeAddress = "0xBAaF2b6872Eda03Ab675f46b558E345DF3b70Df4";

export const allowancePeriodMs = 24 * 60 * 60 * 1000; // Daily

export const proposerPeriodicAllowances: Record<Address, number> = {
  ["0x9Da59c875A145FeFd7C6Be87c002AF29fAeC4D3A".toLowerCase()]: 1000,
  ["0x408E986A277DA059A90C4Be5051F67c6e3Fd5cff".toLowerCase()]: 5000,
};
