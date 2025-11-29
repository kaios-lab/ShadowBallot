import { useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';

import { Header } from './Header';
import { CreatePollForm } from './CreatePollForm';
import { PollCard } from './PollCard';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { shadowBallotAbi } from '../config/shadowBallotAbi';
import { SHADOW_BALLOT_ADDRESS, SHADOW_BALLOT_CHAIN_ID } from '../config/contract';
import type { Poll, PollStatus } from '../types/poll';

type DecryptionPayload = {
  values: number[];
  abiEncodedCleartexts: `0x${string}`;
  decryptionProof: `0x${string}`;
};

async function fetchPolls(client: ReturnType<typeof usePublicClient>, account?: string | null): Promise<Poll[]> {
  if (!client) return [];
  const total = Number(
    await client.readContract({
      abi: shadowBallotAbi,
      address: SHADOW_BALLOT_ADDRESS,
      functionName: 'getPollCount',
    }),
  );

  const ids = Array.from({ length: total }, (_, idx) => BigInt(idx));
  const polls = await Promise.all(
    ids.map(async (id) => {
      const pollData = await client.readContract({
        abi: shadowBallotAbi,
        address: SHADOW_BALLOT_ADDRESS,
        functionName: 'getPoll',
        args: [id],
      });

      const resultsRaw = (await client.readContract({
        abi: shadowBallotAbi,
        address: SHADOW_BALLOT_ADDRESS,
        functionName: 'getPublishedResults',
        args: [id],
      })) as unknown as readonly bigint[];

      const results = Array.from(resultsRaw, (value) => Number(value));

      const hasVoted =
        account && account.length > 0
          ? ((await client.readContract({
              abi: shadowBallotAbi,
              address: SHADOW_BALLOT_ADDRESS,
              functionName: 'hasUserVoted',
              args: [id, account as `0x${string}`],
            })) as boolean)
          : false;

      return {
        id: Number(id),
        name: pollData[0] as string,
        description: pollData[1] as string,
        options: pollData[2] as string[],
        startTime: Number(pollData[3]),
        endTime: Number(pollData[4]),
        creator: pollData[5] as string,
        finalized: pollData[6] as boolean,
        resultsPublished: pollData[7] as boolean,
        createdAt: Number(pollData[8]),
        finalizedAt: Number(pollData[9]),
        publishedAt: Number(pollData[10]),
        results,
        userHasVoted: hasVoted,
      } as Poll;
    }),
  );

  return polls.sort((a, b) => b.createdAt - a.createdAt);
}

function computeStatus(poll: Poll): PollStatus {
  const now = Math.floor(Date.now() / 1000);
  if (poll.resultsPublished) {
    return 'published';
  }
  if (poll.finalized) {
    return 'finalized';
  }
  if (now > poll.endTime) {
    return 'awaitingFinalization';
  }
  if (now >= poll.startTime) {
    return 'active';
  }
  return 'upcoming';
}

export function ShadowBallotApp() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const signer = useEthersSigner();
  const publicClient = usePublicClient({ chainId: SHADOW_BALLOT_CHAIN_ID });
  const { instance, isLoading: encryptionLoading, error: encryptionError } = useZamaInstance();

  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [decryptionCache, setDecryptionCache] = useState<Record<number, DecryptionPayload>>({});

  const pollsQuery = useQuery({
    queryKey: ['polls', address ?? 'anon'],
    queryFn: () => fetchPolls(publicClient, address),
    enabled: Boolean(publicClient),
    refetchInterval: 45000,
  });

  const polls = pollsQuery.data ?? [];

  const writeContract = async () => {
    const signerInstance = await signer;
    if (!signerInstance) {
      throw new Error('Connect a wallet to perform this action.');
    }
    return new ethers.Contract(SHADOW_BALLOT_ADDRESS, shadowBallotAbi, signerInstance);
  };

  const refreshPolls = async () => {
    await queryClient.invalidateQueries({ queryKey: ['polls'] });
  };

  const handleCreatePoll = async (draft: {
    name: string;
    description: string;
    startTime: number;
    endTime: number;
    options: string[];
  }) => {
    setFeedback(null);
    setActionKey('create');
    try {
      const contract = await writeContract();
      const tx = await contract.createPoll(
        draft.name,
        draft.description,
        draft.options,
        BigInt(draft.startTime),
        BigInt(draft.endTime),
      );
      await tx.wait();
      setFeedback('Poll created successfully.');
      await refreshPolls();
    } catch (error) {
      console.error(error);
      setFeedback('Unable to create poll. Please verify your wallet is connected to Sepolia.');
    } finally {
      setActionKey(null);
    }
  };

  const handleVote = async (pollId: number, optionIdx: number) => {
    if (!instance || !address) {
      setFeedback('Connect your wallet and wait for encryption services to load.');
      return;
    }
    setActionKey(`vote-${pollId}`);
    setFeedback(null);
    try {
      const poll = polls.find((entry) => entry.id === pollId);
      if (!poll) throw new Error('Poll not found');
      const ballot = instance.createEncryptedInput(SHADOW_BALLOT_ADDRESS, address);
      poll.options.forEach((_, idx) => ballot.add32(idx === optionIdx ? 1 : 0));
      const encryptedInput = await ballot.encrypt();
      const contract = await writeContract();
      const tx = await contract.vote(BigInt(pollId), encryptedInput.handles, encryptedInput.inputProof);
      await tx.wait();
      setFeedback('Vote submitted. The tally is still encrypted until finalization.');
      await refreshPolls();
    } catch (error) {
      console.error(error);
      setFeedback('Unable to submit vote. Ensure you selected an option and try again.');
    } finally {
      setActionKey(null);
    }
  };

  const handleFinalize = async (pollId: number) => {
    setActionKey(`finalize-${pollId}`);
    setFeedback(null);
    try {
      const contract = await writeContract();
      const tx = await contract.finalizePoll(BigInt(pollId));
      await tx.wait();
      setFeedback('Poll finalized. Anyone can now decrypt the totals.');
      await refreshPolls();
    } catch (error) {
      console.error(error);
      setFeedback('Finalize transaction failed. Please wait until the poll end time has passed.');
    } finally {
      setActionKey(null);
    }
  };

  const handleDecrypt = async (pollId: number) => {
    if (!instance) {
      setFeedback('Encryption instance is loading. Please try again soon.');
      return;
    }
    if (!publicClient) return;
    setActionKey(`decrypt-${pollId}`);
    setFeedback(null);
    try {
      const handles = (await publicClient.readContract({
        abi: shadowBallotAbi,
        address: SHADOW_BALLOT_ADDRESS,
        functionName: 'getEncryptedTallies',
        args: [BigInt(pollId)],
      })) as string[];

      const decrypted = await instance.publicDecrypt(handles);
      const orderedResults = handles.map((handle) => {
        const value = decrypted.clearValues[handle];
        if (typeof value === 'bigint') {
          return Number(value);
        }
        if (typeof value === 'number') {
          return value;
        }
        return 0;
      });

      setDecryptionCache((prev) => ({
        ...prev,
        [pollId]: {
          values: orderedResults,
          abiEncodedCleartexts: decrypted.abiEncodedClearValues,
          decryptionProof: decrypted.decryptionProof,
        },
      }));
      setFeedback('Decryption successful. Publish the result to make it immutable.');
    } catch (error) {
      console.error(error);
      setFeedback('Unable to decrypt results. Ensure the poll was finalized.');
    } finally {
      setActionKey(null);
    }
  };

  const handlePublish = async (pollId: number) => {
    const cacheEntry = decryptionCache[pollId];
    if (!cacheEntry) {
      setFeedback('Decrypt the poll before publishing.');
      return;
    }
    setActionKey(`publish-${pollId}`);
    setFeedback(null);
    try {
      const contract = await writeContract();
      const tx = await contract.publishResults(
        BigInt(pollId),
        cacheEntry.abiEncodedCleartexts,
        cacheEntry.decryptionProof,
      );
      await tx.wait();
      setFeedback('Results anchored on-chain.');
      setDecryptionCache((prev) => {
        const clone = { ...prev };
        delete clone[pollId];
        return clone;
      });
      await refreshPolls();
    } catch (error) {
      console.error(error);
      setFeedback('Publishing failed. Please ensure the proof is still valid.');
    } finally {
      setActionKey(null);
    }
  };

  const encryptionReady = Boolean(instance) && !encryptionLoading && !encryptionError;

  return (
    <div className="main-container">
      <Header />

      {feedback && (
        <div className={feedback.includes('Unable') ? 'error-banner' : 'success-banner'}>{feedback}</div>
      )}
      {encryptionError && <div className="error-banner">{encryptionError}</div>}

      <div className="grid-two-column">
        <CreatePollForm
          onCreate={handleCreatePoll}
          isSubmitting={actionKey === 'create'}
          disabled={!isConnected}
        />

        <div className="section-card">
          <p className="form-heading">Protocol Status</p>
          <p className="muted-text">
            Wallet: {isConnected ? 'Connected' : 'Disconnected'}
            <br />
            Encryption: {encryptionReady ? 'Ready' : 'Loading relayer'}
            <br />
            Polls Loaded: {polls.length}
          </p>
        </div>
      </div>

      <div className="section-card">
        <p className="form-heading">Active Polls</p>
        {pollsQuery.isLoading && <p className="muted-text">Fetching encrypted ballots...</p>}
        {!pollsQuery.isLoading && polls.length === 0 && (
          <p className="muted-text">No polls have been registered yet.</p>
        )}
        <div className="grid-two-column">
          {polls.map((poll) => {
            const status = computeStatus(poll);
            return (
              <PollCard
                key={poll.id}
                poll={poll}
                status={status}
                isEncryptionReady={encryptionReady}
                isConnected={isConnected}
                pendingKey={actionKey ?? undefined}
                decryptedPreview={decryptionCache[poll.id]?.values}
                onVote={handleVote}
                onFinalize={handleFinalize}
                onDecrypt={handleDecrypt}
                onPublish={handlePublish}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
