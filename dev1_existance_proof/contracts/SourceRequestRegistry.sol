// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SourceRequestRegistry
 * @notice Allows users to request an existence attestation for a public URL.
 *         Emits an event that a Chainlink CRE workflow listens to via EVM log trigger.
 */
contract SourceRequestRegistry {

    // ──────────────────────────────────────────────
    //  Data types
    // ──────────────────────────────────────────────

    struct Request {
        bytes32 requestId;
        address requester;
        string url;
        uint64 requestedAt;
        bool exists;
    }

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    mapping(bytes32 => Request) public requests;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event SourceAttestationRequested(
        bytes32 indexed requestId,
        address indexed requester,
        string url,
        uint64 requestedAt
    );

    // ──────────────────────────────────────────────
    //  External functions
    // ──────────────────────────────────────────────

    /**
     * @notice Submit a request to attest a public URL.
     * @param url The public URL to attest (e.g. "https://lemonde.fr/article405").
     * @return requestId The unique identifier for this request.
     */
    function requestSourceAttestation(string calldata url)
        external
        returns (bytes32 requestId)
    {
        require(bytes(url).length > 0, "URL must not be empty");

        uint64 requestedAt = uint64(block.timestamp);

        // Deterministic ID: keccak256(requester || url || requestedAt)
        requestId = keccak256(
            abi.encodePacked(msg.sender, url, requestedAt)
        );

        require(!requests[requestId].exists, "Duplicate request");

        requests[requestId] = Request({
            requestId: requestId,
            requester: msg.sender,
            url: url,
            requestedAt: requestedAt,
            exists: true
        });

        emit SourceAttestationRequested(
            requestId,
            msg.sender,
            url,
            requestedAt
        );
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /**
     * @notice Check if a request exists.
     */
    function requestExists(bytes32 requestId) external view returns (bool) {
        return requests[requestId].exists;
    }

    /**
     * @notice Get the URL for a given request.
     */
    function getRequestUrl(bytes32 requestId) external view returns (string memory) {
        require(requests[requestId].exists, "Request not found");
        return requests[requestId].url;
    }
}
