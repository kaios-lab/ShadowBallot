// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract ShadowBallot is ZamaEthereumConfig {
    error InvalidOptionCount();
    error InvalidOptionLabel();
    error InvalidSchedule();
    error EmptyPollName();
    error InvalidPoll();
    error InvalidBallot();
    error PollNotActive();
    error AlreadyVoted();
    error PollNotFinalized();
    error PollAlreadyFinalized();
    error PollAlreadyPublished();
    error CleartextPayloadMismatch();
    error CleartextValueOverflow();

    struct Poll {
        string name;
        string description;
        string[] options;
        uint64 startTime;
        uint64 endTime;
        address creator;
        bool finalized;
        bool resultsPublished;
        uint64 createdAt;
        uint64 finalizedAt;
        uint64 publishedAt;
        euint32[] encryptedTallies;
        uint32[] clearResults;
    }

    Poll[] private _polls;
    mapping(uint256 => mapping(address => bool)) private _hasVoted;

    event PollCreated(uint256 indexed pollId, string name, uint64 startTime, uint64 endTime);
    event VoteSubmitted(uint256 indexed pollId, address indexed voter);
    event PollFinalized(uint256 indexed pollId, address indexed caller);
    event ResultsPublished(uint256 indexed pollId, uint32[] results);

    function createPoll(
        string calldata name,
        string calldata description,
        string[] calldata options,
        uint64 startTime,
        uint64 endTime
    ) external returns (uint256 pollId) {
        if (bytes(name).length == 0) revert EmptyPollName();

        uint256 optionCount = options.length;
        if (optionCount < 2 || optionCount > 4) revert InvalidOptionCount();

        if (endTime <= startTime) revert InvalidSchedule();
        if (startTime < block.timestamp) revert InvalidSchedule();

        Poll storage poll = _polls.push();
        poll.name = name;
        poll.description = description;
        poll.startTime = startTime;
        poll.endTime = endTime;
        poll.creator = msg.sender;
        poll.createdAt = uint64(block.timestamp);
        poll.options = new string[](optionCount);
        poll.encryptedTallies = new euint32[](optionCount);

        for (uint256 i = 0; i < optionCount; i++) {
            if (bytes(options[i]).length == 0) revert InvalidOptionLabel();
            poll.options[i] = options[i];
            poll.encryptedTallies[i] = FHE.asEuint32(0);
            FHE.allowThis(poll.encryptedTallies[i]);
        }

        pollId = _polls.length - 1;
        emit PollCreated(pollId, name, startTime, endTime);
    }

    function vote(
        uint256 pollId,
        externalEuint32[] calldata encryptedBallot,
        bytes calldata inputProof
    ) external {
        Poll storage poll = _getPollOrRevert(pollId);
        if (_hasVoted[pollId][msg.sender]) revert AlreadyVoted();
        if (!_isActive(poll)) revert PollNotActive();

        uint256 optionCount = poll.encryptedTallies.length;
        if (encryptedBallot.length != optionCount) revert InvalidBallot();

        _hasVoted[pollId][msg.sender] = true;

        for (uint256 i = 0; i < optionCount; i++) {
            euint32 delta = FHE.fromExternal(encryptedBallot[i], inputProof);
            FHE.allowThis(delta);
            poll.encryptedTallies[i] = FHE.add(poll.encryptedTallies[i], delta);
            FHE.allowThis(poll.encryptedTallies[i]);
        }

        emit VoteSubmitted(pollId, msg.sender);
    }

    function finalizePoll(uint256 pollId) external {
        Poll storage poll = _getPollOrRevert(pollId);
        if (poll.finalized) revert PollAlreadyFinalized();
        if (block.timestamp <= poll.endTime) revert PollNotFinalized();

        poll.finalized = true;
        poll.finalizedAt = uint64(block.timestamp);

        uint256 optionCount = poll.encryptedTallies.length;
        for (uint256 i = 0; i < optionCount; i++) {
            FHE.makePubliclyDecryptable(poll.encryptedTallies[i]);
        }

        emit PollFinalized(pollId, msg.sender);
    }

    function publishResults(
        uint256 pollId,
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external {
        Poll storage poll = _getPollOrRevert(pollId);
        if (!poll.finalized) revert PollNotFinalized();
        if (poll.resultsPublished) revert PollAlreadyPublished();

        uint256 optionCount = poll.encryptedTallies.length;

        bytes32[] memory handles = new bytes32[](optionCount);
        for (uint256 i = 0; i < optionCount; i++) {
            handles[i] = euint32.unwrap(poll.encryptedTallies[i]);
        }

        FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);

        uint32[] memory decodedCounts = _decodeCounts(abiEncodedCleartexts, optionCount);
        poll.clearResults = decodedCounts;
        poll.resultsPublished = true;
        poll.publishedAt = uint64(block.timestamp);

        emit ResultsPublished(pollId, decodedCounts);
    }

    function getPollCount() external view returns (uint256) {
        return _polls.length;
    }

    function getPoll(
        uint256 pollId
    )
        external
        view
        returns (
            string memory name,
            string memory description,
            string[] memory options,
            uint64 startTime,
            uint64 endTime,
            address creator,
            bool finalized,
            bool resultsPublished,
            uint64 createdAt,
            uint64 finalizedAt,
            uint64 publishedAt
        )
    {
        Poll storage poll = _getPollOrRevert(pollId);
        return (
            poll.name,
            poll.description,
            poll.options,
            poll.startTime,
            poll.endTime,
            poll.creator,
            poll.finalized,
            poll.resultsPublished,
            poll.createdAt,
            poll.finalizedAt,
            poll.publishedAt
        );
    }

    function getEncryptedTallies(uint256 pollId) external view returns (euint32[] memory) {
        Poll storage poll = _getPollOrRevert(pollId);
        return poll.encryptedTallies;
    }

    function getPublishedResults(uint256 pollId) external view returns (uint32[] memory) {
        Poll storage poll = _getPollOrRevert(pollId);
        return poll.clearResults;
    }

    function hasUserVoted(uint256 pollId, address account) external view returns (bool) {
        if (pollId >= _polls.length) revert InvalidPoll();
        return _hasVoted[pollId][account];
    }

    function _decodeCounts(bytes memory payload, uint256 expected) private pure returns (uint32[] memory counts) {
        if (payload.length != expected * 32) revert CleartextPayloadMismatch();

        counts = new uint32[](expected);
        for (uint256 i = 0; i < expected; i++) {
            uint256 parsed;
            assembly {
                parsed := mload(add(add(payload, 0x20), mul(i, 0x20)))
            }

            if (parsed > type(uint32).max) revert CleartextValueOverflow();
            counts[i] = uint32(parsed);
        }
    }

    function _isActive(Poll storage poll) private view returns (bool) {
        return block.timestamp >= poll.startTime && block.timestamp <= poll.endTime;
    }

    function _getPollOrRevert(uint256 pollId) private view returns (Poll storage) {
        if (pollId >= _polls.length) revert InvalidPoll();
        return _polls[pollId];
    }
}
