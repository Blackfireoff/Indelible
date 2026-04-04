// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SourceAttestationRegistry
 * @notice Stores finalized existence attestations written by the Chainlink CRE workflow.
 *         Each attestation proves that a URL's content existed at a specific point in time.
 *         The raw content is stored in 0G and referenced by data_address.
 */
contract SourceAttestationRegistry {

    // ──────────────────────────────────────────────
    //  Data types
    // ──────────────────────────────────────────────

    struct SourceAttestation {
        bytes32 attestationId;
        bytes32 requestId;
        string url;
        bytes32 rawHash;
        string dataAddress;     // 0G storage pointer (e.g. "0g://<rootHash>")
        uint64 observedAt;      // When the content was actually fetched
        string contentType;     // MIME type of the content
        bool exists;
    }

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    mapping(bytes32 => SourceAttestation) public attestations;

    address public owner;
    address public oracleWriter;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event SourceAttested(
        bytes32 indexed attestationId,
        bytes32 indexed requestId,
        string url,
        bytes32 rawHash,
        string dataAddress,
        uint64 observedAt,
        string contentType
    );

    event OracleWriterUpdated(
        address indexed previousWriter,
        address indexed newWriter
    );

    // ──────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracleWriter, "Only oracle writer");
        _;
    }

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(address _oracleWriter) {
        require(_oracleWriter != address(0), "Invalid oracle address");
        owner = msg.sender;
        oracleWriter = _oracleWriter;
        emit OracleWriterUpdated(address(0), _oracleWriter);
    }

    // ──────────────────────────────────────────────
    //  Admin functions
    // ──────────────────────────────────────────────

    /**
     * @notice Update the authorized oracle writer address.
     * @param _newWriter The new oracle writer address.
     */
    function setOracleWriter(address _newWriter) external onlyOwner {
        require(_newWriter != address(0), "Invalid oracle address");
        address previous = oracleWriter;
        oracleWriter = _newWriter;
        emit OracleWriterUpdated(previous, _newWriter);
    }

    // ──────────────────────────────────────────────
    //  Oracle write function
    // ──────────────────────────────────────────────

    /**
     * @notice Record a finalized source attestation. Only callable by the oracle writer.
     * @param attestationId  keccak256(url || observedAt || rawHash)
     * @param requestId      keccak256(requester || url || requestedAt)
     * @param url            The original URL that was attested
     * @param rawHash        keccak256 of the exact raw fetched content
     * @param dataAddress    0G storage pointer to the raw artifact
     * @param observedAt     Unix timestamp when content was observed
     * @param contentType    MIME type of the fetched content
     */
    function recordAttestation(
        bytes32 attestationId,
        bytes32 requestId,
        string calldata url,
        bytes32 rawHash,
        string calldata dataAddress,
        uint64 observedAt,
        string calldata contentType
    ) external onlyOracle {
        require(!attestations[attestationId].exists, "Attestation already exists");
        require(attestationId != bytes32(0), "Invalid attestation ID");
        require(requestId != bytes32(0), "Invalid request ID");
        require(bytes(url).length > 0, "URL must not be empty");
        require(rawHash != bytes32(0), "Invalid raw hash");

        attestations[attestationId] = SourceAttestation({
            attestationId: attestationId,
            requestId: requestId,
            url: url,
            rawHash: rawHash,
            dataAddress: dataAddress,
            observedAt: observedAt,
            contentType: contentType,
            exists: true
        });

        emit SourceAttested(
            attestationId,
            requestId,
            url,
            rawHash,
            dataAddress,
            observedAt,
            contentType
        );
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /**
     * @notice Check if an attestation exists.
     */
    function attestationExists(bytes32 attestationId) external view returns (bool) {
        return attestations[attestationId].exists;
    }

    /**
     * @notice Get the raw hash for a given attestation.
     */
    function getRawHash(bytes32 attestationId) external view returns (bytes32) {
        require(attestations[attestationId].exists, "Attestation not found");
        return attestations[attestationId].rawHash;
    }

    /**
     * @notice Get the 0G data address for a given attestation.
     */
    function getDataAddress(bytes32 attestationId) external view returns (string memory) {
        require(attestations[attestationId].exists, "Attestation not found");
        return attestations[attestationId].dataAddress;
    }
}
