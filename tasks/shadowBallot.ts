import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:ballot-address", "Prints the deployed ShadowBallot address").setAction(async (_, hre) => {
  const { deployments } = hre;
  const deployment = await deployments.get("ShadowBallot");
  console.log(`ShadowBallot address: ${deployment.address}`);
});

task("task:create-poll", "Creates a new encrypted poll")
  .addParam("name", "Poll name")
  .addOptionalParam("description", "Poll description", "")
  .addParam("options", "Comma-separated list of 2-4 options")
  .addOptionalParam("startdelay", "Seconds from now to start the poll", "0")
  .addOptionalParam("duration", "Poll duration in seconds", "3600")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { ethers, deployments } = hre;
    const deployment = await deployments.get("ShadowBallot");
    const contract = await ethers.getContractAt("ShadowBallot", deployment.address);
    const [signer] = await ethers.getSigners();

    const parsedOptions = String(taskArguments.options)
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (parsedOptions.length < 2 || parsedOptions.length > 4) {
      throw new Error("You must provide between two and four options separated by commas.");
    }

    const latestBlock = await ethers.provider.getBlock("latest");
    const now = latestBlock?.timestamp ?? Math.floor(Date.now() / 1000);
    const startTime = BigInt(
      now + Number.parseInt(String(taskArguments.startdelay ?? "0"), 10),
    );
    const durationSeconds = Number.parseInt(String(taskArguments.duration ?? "3600"), 10);
    if (durationSeconds <= 0) {
      throw new Error("Duration must be greater than zero.");
    }
    const endTime = startTime + BigInt(durationSeconds);

    const tx = await contract
      .connect(signer)
      .createPoll(
        String(taskArguments.name),
        String(taskArguments.description ?? ""),
        parsedOptions,
        startTime,
        endTime,
      );
    console.log(`Sent createPoll tx: ${tx.hash}`);
    await tx.wait();
    console.log("Poll created successfully.");
  });

task("task:vote", "Encrypts and submits a vote")
  .addParam("poll", "Poll id")
  .addParam("ballot", "Comma-separated vector where each entry is 0 or 1 and length matches poll options")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("ShadowBallot");
    const contract = await ethers.getContractAt("ShadowBallot", deployment.address);
    const [signer] = await ethers.getSigners();

    const pollId = BigInt(String(taskArguments.poll));
    const ballotVector = String(taskArguments.ballot)
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const value = Number.parseInt(entry, 10);
        if (value !== 0 && value !== 1) {
          throw new Error("Ballot entries must be either 0 or 1.");
        }
        return value;
      });
    if (ballotVector.length === 0) {
      throw new Error("Provide at least two ballot entries.");
    }

    const builder = fhevm.createEncryptedInput(deployment.address, signer.address);
    ballotVector.forEach((value) => builder.add32(value));
    const encryptedInput = await builder.encrypt();

    const tx = await contract
      .connect(signer)
      .vote(pollId, encryptedInput.handles, encryptedInput.inputProof);
    console.log(`Sent vote tx: ${tx.hash}`);
    await tx.wait();
    console.log("Vote submitted.");
  });

task("task:finalize-poll", "Marks a poll as complete and enables public decrypt")
  .addParam("poll", "Poll id")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { ethers, deployments } = hre;
    const deployment = await deployments.get("ShadowBallot");
    const contract = await ethers.getContractAt("ShadowBallot", deployment.address);
    const [signer] = await ethers.getSigners();

    const pollId = BigInt(String(taskArguments.poll));
    const tx = await contract.connect(signer).finalizePoll(pollId);
    console.log(`Sent finalize tx: ${tx.hash}`);
    await tx.wait();
    console.log("Poll finalized.");
  });

task("task:publish-results", "Decrypts tallies via the relayer and stores the clear totals on chain")
  .addParam("poll", "Poll id")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("ShadowBallot");
    const contract = await ethers.getContractAt("ShadowBallot", deployment.address);
    const [signer] = await ethers.getSigners();

    const pollId = BigInt(String(taskArguments.poll));
    const encryptedTallies = await contract.getEncryptedTallies(pollId);
    const handles = encryptedTallies.map((value: string) => value);

    const decrypted = await fhevm.publicDecrypt(handles);

    const tx = await contract
      .connect(signer)
      .publishResults(pollId, decrypted.abiEncodedClearValues, decrypted.decryptionProof);
    console.log(`Sent publish tx: ${tx.hash}`);
    await tx.wait();
    console.log("Results published on chain.");
  });
