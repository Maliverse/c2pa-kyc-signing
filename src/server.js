/**
 * C2PA signing service for KYC biometric capture.
 *
 * POST /sign    multipart image → manifest-embedded PNG
 * POST /verify  multipart image → validation report
 * GET  /health  liveness probe
 *
 * Certificate and key paths are read from the environment. Neither is ever
 * written to the repository — see .env.example and scripts/generate-certs.sh.
 */

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { createC2pa, createTestSigner, ManifestBuilder } = require('c2pa-node');

const { buildManifest } = require('./manifest');

const PORT = Number(process.env.PORT || 3000);
const CERT_PATH = process.env.C2PA_CERT_PATH || './certs/signing.crt';
const KEY_PATH = process.env.C2PA_KEY_PATH || './certs/signing.key';
const SIGN_ALG = process.env.C2PA_SIGN_ALG || 'es256';
const DEFAULT_INSTITUTION = process.env.DEFAULT_INSTITUTION || 'Demo Bank';
const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD },
});

/**
 * Load the signing certificate from disk if present, otherwise fall back to the
 * c2pa-node test signer. The fallback keeps the service runnable out of the box,
 * but the verification output will name the library's test certificate as the
 * issuer rather than your own — which is worth knowing before you cite a result.
 */
async function resolveSigner() {
  const certAbs = path.resolve(CERT_PATH);
  const keyAbs = path.resolve(KEY_PATH);

  if (fs.existsSync(certAbs) && fs.existsSync(keyAbs)) {
    console.log(`[signer] local certificate: ${certAbs}`);
    return {
      type: 'local',
      signer: {
        type: 'local',
        certificate: fs.readFileSync(certAbs),
        privateKey: fs.readFileSync(keyAbs),
        algorithm: SIGN_ALG,
      },
    };
  }

  console.warn(
    '[signer] no certificate found at %s — falling back to the c2pa-node test signer.\n' +
      '         Verification will report "C2PA Test Signing Cert" as the issuer.\n' +
      '         Run ./scripts/generate-certs.sh to sign with your own certificate.',
    certAbs
  );
  return { type: 'test', signer: await createTestSigner() };
}

async function main() {
  const { type, signer } = await resolveSigner();
  const c2pa = createC2pa({ signer });

  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', signer: type, algorithm: SIGN_ALG })
  );

  // ── Sign ────────────────────────────────────────────────────────────────
  app.post('/sign', upload.single('image'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'no image supplied (field name: image)' });
    }

    try {
      const institution = req.body.institution || DEFAULT_INSTITUTION;
      const livenessScore =
        req.body.liveness_score !== undefined
          ? Number(req.body.liveness_score)
          : null;

      const definition = buildManifest({
        institution,
        livenessScore,
        deviceId: req.body.device_id || null,
      });

      const builder = new ManifestBuilder(definition);
      const asset = { buffer: req.file.buffer, mimeType: 'image/png' };

      // c2pa-node performs both the cryptographic signing and the binary
      // embedding of the manifest into the asset. The complete signed PNG is
      // returned; no client-side chunk manipulation is required or possible.
      const { signedAsset } = await c2pa.sign({ asset, manifest: builder });

      res.setHeader('Content-Type', 'image/png');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="signed_${Date.now()}.png"`
      );
      return res.send(signedAsset.buffer);
    } catch (err) {
      console.error('[sign]', err);
      return res.status(500).json({ error: 'signing failed', detail: String(err.message) });
    }
  });

  // ── Verify ──────────────────────────────────────────────────────────────
  app.post('/verify', upload.single('image'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'no image supplied (field name: image)' });
    }

    try {
      const result = await c2pa.read({
        buffer: req.file.buffer,
        mimeType: 'image/png',
      });

      if (!result) {
        // No manifest at all. For an injected asset this is the expected
        // outcome: nothing captured it, so nothing signed it.
        return res.json({
          manifest_present: false,
          validation_state: null,
          interpretation:
            'No C2PA manifest present. The asset carries no verifiable capture provenance.',
        });
      }

      const active = result.active_manifest;
      return res.json({
        manifest_present: true,
        validation_state: result.validation_status?.length ? 'Invalid' : 'Valid',
        validation_status: result.validation_status || [],
        claim_generator: active?.claim_generator ?? null,
        signature_algorithm: active?.signature_info?.alg ?? null,
        issuer: active?.signature_info?.issuer ?? null,
        assertions: (active?.assertions || []).map((a) => a.label),
        interpretation:
          'Signature validity is independent of trust-list membership. A self-signed ' +
          'certificate yields a cryptographically sound signature from an unrecognised issuer.',
      });
    } catch (err) {
      console.error('[verify]', err);
      return res.status(500).json({ error: 'verification failed', detail: String(err.message) });
    }
  });

  app.listen(PORT, () => {
    console.log(`c2pa-kyc-signing listening on http://localhost:${PORT}`);
    console.log(`  signer: ${type} · algorithm: ${SIGN_ALG}`);
  });
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
