import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { ShadowBallot, ShadowBallot__factory } from "../types";

describe("ShadowBallot", () => {
  let ballot: ShadowBallot;
  let ballotAddress: string;

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    const factory = (await ethers.getContractFactory("ShadowBallot")) as ShadowBallot__factory;
    ballot = (await factory.deploy()) as ShadowBallot;
    ballotAddress = await ballot.getAddress();
  });

  async function createDefaultPoll() {
    const now = await time.latest();
    const start = now + 5;
    const end = start + 60;

    const tx = await ballot.createPoll("Weekly budget", "Decide budget allocation", ["Ops", "Growth"], start, end);
    await tx.wait();
    return { start, end };
  }

  async function castVote(voterIndex: number, encodedBallot: number[], pollId = 0n) {
    const signers = await ethers.getSigners();
    const voter = signers[voterIndex];
    const builder = fhevm.createEncryptedInput(ballotAddress, voter.address);
    for (const value of encodedBallot) {
      builder.add32(value);
    }
    const encryptedInput = await builder.encrypt();

    const tx = await ballot.connect(voter).vote(pollId, encryptedInput.handles, encryptedInput.inputProof);
    await tx.wait();
  }

  it("stores poll metadata", async () => {
    const now = await time.latest();
    const start = now + 5;
    const end = start + 60;

    const tx = await ballot.createPoll("Launch plan", "Vote on launch slot", ["June", "July"], start, end);
    await tx.wait();

    const poll = await ballot.getPoll(0);
    expect(poll[0]).to.equal("Launch plan");
    expect(poll[2]).to.deep.equal(["June", "July"]);
    expect(Number(poll[3])).to.equal(start);
    expect(Number(poll[4])).to.equal(end);
    expect(poll[6]).to.equal(false);
  });

  it("prevents double voting and enforces schedule", async () => {
    const { start, end } = await createDefaultPoll();

    await expect(castVote(1, [1, 0])).to.be.revertedWithCustomError(ballot, "PollNotActive");

    await time.increaseTo(start + 1);
    await castVote(1, [1, 0]);

    await expect(castVote(1, [0, 1])).to.be.revertedWithCustomError(ballot, "AlreadyVoted");

    await time.increaseTo(end + 1);
    const builder = fhevm.createEncryptedInput(ballotAddress, (await ethers.getSigners())[2].address);
    builder.add32(0);
    builder.add32(1);
    const encryptedInput = await builder.encrypt();
    await expect(
      ballot.connect((await ethers.getSigners())[2]).vote(0, encryptedInput.handles, encryptedInput.inputProof),
    ).to.be.revertedWithCustomError(ballot, "PollNotActive");
  });

  it("finalizes and publishes clear results once decrypted", async () => {
    const { start, end } = await createDefaultPoll();
    await time.increaseTo(start + 1);

    await castVote(1, [1, 0]);
    await castVote(2, [1, 0]);
    await castVote(3, [0, 1]);

    await expect(ballot.finalizePoll(0)).to.be.revertedWithCustomError(ballot, "PollNotFinalized");

    await time.increaseTo(end + 1);
    await ballot.finalizePoll(0);

    const encryptedTallies = await ballot.getEncryptedTallies(0);
    const decrypted = await fhevm.publicDecrypt(encryptedTallies);

    const publishTx = await ballot.publishResults(0, decrypted.abiEncodedClearValues, decrypted.decryptionProof);
    await publishTx.wait();

    const results = await ballot.getPublishedResults(0);
    expect(results.map((v) => Number(v))).to.deep.equal([2, 1]);
    await expect(ballot.publishResults(0, decrypted.abiEncodedClearValues, decrypted.decryptionProof)).to.be.revertedWithCustomError(
      ballot,
      "PollAlreadyPublished",
    );
  });
});
