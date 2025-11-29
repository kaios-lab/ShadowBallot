# ShadowBallot

Private, verifiable on-chain polls powered by fully homomorphic encryption (FHE) on Sepolia. ShadowBallot keeps every ballot confidential until the vote is finalized, then makes the decrypted totals auditable on-chain with proofs from Zama's relayer.

## What This Project Does
- Create time-boxed polls with 2–4 options plus descriptions and metadata.
- Collect encrypted votes client-side; prevent double-voting per address.
- Finalize after the end time to allow anyone to request public decryption.
- Publish decrypted tallies on-chain with relayer proofs so results are immutable and trustless.
- React app (no local storage, no environment variables) for creating polls, casting encrypted ballots, finalizing, decrypting, and publishing.

## Problems Solved
- **Privacy-preserving governance:** ballots stay encrypted on-chain; no party sees partial results before finalization.
- **Transparent verification:** published totals include relayer proofs; cleartexts are only accepted after validation.
- **Tamper resistance:** finalized polls flip to publicly decryptable ciphertexts, and published results are stored on-chain.
- **Usable FHE workflow:** the frontend handles relayer initialization, encryption, and proof propagation without exposing secrets to the chain.

## Advantages
- End-to-end confidentiality with Zama's FHEVM stack and relayer SDK.
- Minimal trust: on-chain checks prevent invalid ballots, duplicate votes, and replayed publish calls.
- Clear lifecycle states (upcoming → active → awaiting finalization → finalized → published) visible in the UI.
- Built with familiar tooling (Hardhat, React, ethers, viem, RainbowKit) so teams can extend quickly.

## Tech Stack
- **Smart contracts:** Solidity 0.8.27, `@fhevm/solidity`, Hardhat + hardhat-deploy.
- **Frontend:** React + Vite + TypeScript, RainbowKit/wagmi for wallets, viem for reads, ethers for writes, `@zama-fhe/relayer-sdk` for encryption/decryption. No Tailwind, no env vars.
- **Tooling:** hardhat-gas-reporter, solidity-coverage, TypeChain (ethers-v6), ESLint/Prettier.

## How It Works (Poll Lifecycle)
1. **Create:** `createPoll` stores name, description, 2–4 option labels, and start/end timestamps (must be in the future and end after start).
2. **Vote:** clients encrypt a one-hot ballot vector with the relayer SDK and call `vote`. Double voting and malformed ballots are rejected.
3. **Finalize:** after `endTime`, anyone can call `finalizePoll` to make tallies publicly decryptable.
4. **Decrypt:** any user can request public decryption via the relayer; the app shows the clear totals before they are on-chain.
5. **Publish:** submit `publishResults` with the relayer proof; results are stored immutably and further publishes are blocked.

## Repository Map
- `contracts/ShadowBallot.sol` — FHE-enabled poll contract with tallying, finalize, and publish flows.
- `deploy/deploy.ts` — hardhat-deploy script (uses named `deployer` account).
- `tasks/shadowBallot.ts` — helper CLI tasks (create-poll, vote, finalize, publish).
- `test/ShadowBallot.ts` — FHEVM mock tests covering schedule enforcement, double-vote prevention, and finalize/publish.
- `deployments/sepolia/ShadowBallot.json` — generated ABI; copy this ABI into the frontend.
- `home/` — React app (no env vars, no Tailwind). Contract address lives in `home/src/config/contract.ts`; ABI in `home/src/config/shadowBallotAbi.ts`.

## Setup & Commands

### Prerequisites
- Node.js ≥ 20, npm ≥ 7.
- An Infura API key and a private key for Sepolia transactions (mnemonics are not used).

### Install
```bash
npm install               # root (contracts)
cd home && npm install    # frontend
```

### Environment
Create a `.env` in the repo root with:
```
PRIVATE_KEY=your_private_key   # with 0x prefix
INFURA_API_KEY=your_infura_key
ETHERSCAN_API_KEY=optional_for_verification
```
`hardhat.config.ts` reads these values via `dotenv`. Do not use a mnemonic.

### Build, Test, Deploy (Contracts)
- Compile: `npm run compile`
- Test (FHEVM mock): `npm test`
- Local node: `npm run chain` (Hardhat node)
- Deploy: `npm run deploy:localhost` or `npm run deploy:sepolia`
- Verify: `npm run verify:sepolia`

### Hardhat Tasks (CLI)
- Print address: `npx hardhat task:ballot-address --network sepolia`
- Create poll: `npx hardhat task:create-poll --name "Budget" --description "Q2" --options "Ops,Growth" --startdelay 60 --duration 3600 --network sepolia`
- Vote: `npx hardhat task:vote --poll 0 --ballot "1,0,0" --network sepolia`
- Finalize: `npx hardhat task:finalize-poll --poll 0 --network sepolia`
- Publish: `npx hardhat task:publish-results --poll 0 --network sepolia`

## Frontend Usage (`home/`)
- Update contract address: set `SHADOW_BALLOT_ADDRESS` in `home/src/config/contract.ts` to the deployed address.
- Keep ABI in sync: ensure `home/src/config/shadowBallotAbi.ts` is generated from `deployments/sepolia/ShadowBallot.json`.
- Run dev server: `npm run dev`
- Build: `npm run build`
- The app writes with ethers, reads with viem, and initializes Zama's relayer SDK for encryption/decryption. It targets Sepolia only and avoids local storage.

## Future Plans
- Add poll access controls (allowlists/roles) and creator tools for managing drafts.
- Expose downloadable proof packages for auditors and richer result visualizations.
- Notifications and reminders for start/end/finalization events.
- Multi-chain configuration presets beyond Sepolia and automated CI for tests/coverage.

## License
BSD-3-Clause-Clear. See `LICENSE`.
