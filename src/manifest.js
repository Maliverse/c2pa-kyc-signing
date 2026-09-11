/**
 * Manifest construction for KYC biometric capture.
 *
 * Builds the C2PA manifest written into each signed asset. Three assertions are
 * emitted: the standard c2pa.actions record, plus two custom assertions carrying
 * the liveness measurement and the regulatory context of the capture.
 *
 * Note: com.sovereign-persona.* is not a registered C2PA namespace. Production
 * deployment would require registering one.
 */

const CLAIM_GENERATOR_BASE = 'SovereignPersona/1.0';

/**
 * @param {object}  opts
 * @param {string}  opts.institution      Institution performing the capture.
 * @param {number} [opts.livenessScore]   Liveness score recorded at capture, 0–1.
 * @param {number} [opts.livenessThreshold=0.85]
 * @param {string} [opts.regulatoryRef]   Applicable circular or policy reference.
 * @param {string} [opts.deviceId]        Opaque capture-device identifier.
 * @returns {object} A c2pa-node manifest definition.
 */
function buildManifest({
  institution,
  livenessScore = null,
  livenessThreshold = 0.85,
  regulatoryRef = 'CBN PSD/DIR/PUB/001/2026',
  deviceId = null,
} = {}) {
  if (!institution || typeof institution !== 'string') {
    throw new TypeError('institution is required and must be a string');
  }

  const capturedAt = new Date().toISOString();

  const assertions = [
    {
      label: 'c2pa.actions',
      data: {
        actions: [
          {
            action: 'c2pa.created',
            when: capturedAt,
            softwareAgent: `${CLAIM_GENERATOR_BASE} (${institution})`,
            digitalSourceType:
              'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
          },
        ],
      },
    },
    {
      label: 'com.sovereign-persona.liveness',
      data: {
        score: livenessScore,
        threshold: livenessThreshold,
        passed: livenessScore === null ? null : livenessScore >= livenessThreshold,
        measured_at: capturedAt,
      },
    },
    {
      label: 'com.sovereign-persona.regulatory',
      data: {
        institution,
        regulatory_reference: regulatoryRef,
        device_identifier: deviceId,
        capture_context: 'kyc_onboarding',
      },
    },
  ];

  return {
    claim_generator: `${CLAIM_GENERATOR_BASE} ${institution.replace(/\s+/g, '-')}-KYC/1.0`,
    format: 'image/png',
    title: `KYC capture — ${institution}`,
    assertions,
  };
}

module.exports = { buildManifest, CLAIM_GENERATOR_BASE };
