# c2pa-kyc-signing

A C2PA content-provenance signing service for KYC biometric capture. Each submitted image is
cryptographically bound to its originating capture context and embedded with a signed C2PA
manifest, so that a verifier can establish **where an image came from** rather than inferring
from pixels whether it looks authentic.

Built as the Layer 2 reference implementation for an MSc research project on deepfake-resistant
identity verification in Nigerian fintech.

## Why provenance rather than detection

The dominant attack against remote KYC is no longer presenting a fake to a camera — it is
bypassing the camera entirely. A virtual camera device injects synthetic media directly into the
application's video pipeline. No physical scene is ever captured.

This matters because it changes the nature of the defence. Liveness detection is a probabilistic
contest whose margin narrows as generative fidelity improves. Provenance verification is not
in that contest: if no capture occurred, no capture device signed anything, and no valid manifest
can exist. Absence of a manifest is a categorical property of an injection attack, not a
statistical signal to be tuned.

## What this service does

- Accepts an image and capture metadata over HTTP
- Constructs a C2PA manifest with three assertions (see below)
- Signs it with **Es256** (ECDSA, P-256 curve, SHA-256)
- Embeds the manifest into the PNG binary server-side via `c2pa-node`
- Returns the complete signed asset
- Provides a verification endpoint that validates the manifest and reports the trust status

## Quickstart

```bash
git clone https://github.com/<you>/c2pa-kyc-signing.git
cd c2pa-kyc-signing
npm install

# generate a local self-signed signing certificate (never committed)
./scripts/generate-certs.sh

cp .env.example .env
npm start
```

Sign an image:

```bash
curl -X POST http://localhost:3000/sign \
  -F "image=@capture.png" \
  -F "institution=Demo Bank" \
  -o capture_signed.png
```

Verify it:

```bash
curl -X POST http://localhost:3000/verify -F "image=@capture_signed.png"
```

Or upload `capture_signed.png` to [c2paviewer.com](https://c2paviewer.com) for independent
third-party validation.

## Manifest structure

Three assertions are written into every manifest:

| Assertion label | Purpose |
|---|---|
| `c2pa.actions` | Standard C2PA action record — capture, and any subsequent processing |
| `com.sovereign-persona.liveness` | Liveness score and threshold recorded at capture time |
| `com.sovereign-persona.regulatory` | Institution identifier and applicable regulatory reference |

A worked example is in [`examples/sample-manifest.json`](examples/sample-manifest.json).

## Verification behaviour

A correctly signed asset returns `validation_state: "Valid"` with an advisory that the signer is
not on the C2PA Trust List:

> C2PA manifest is valid but the signer is not on the C2PA Trust List. The signature is
> cryptographically sound, but from an unrecognized signer.

This is the expected and correct result for a self-signed research certificate. It distinguishes
two things that are easy to conflate: the signature is mathematically valid, and the issuer is not
recognised by the public trust infrastructure.

## Limitations

Stated plainly, because they determine what this implementation can be used for.

- **The signing certificate is self-signed** and not registered on the C2PA Trust List.
  Production deployment would require the issuing authority — a central bank or licensed
  operator — to be admitted as a C2PA Trust List Authority.
- **The custom assertion labels are non-standard.** `com.sovereign-persona.*` is not a registered
  namespace. Production use would require registering one.
- **This service signs; it does not attest.** Binding the manifest to a hardware root of trust
  requires WebAuthn attestation or platform Secure Enclave integration, which is out of scope here.
- **No performance guarantees.** Observed signing latency in local development was approximately
  180 ms per image, recorded without a controlled timing harness. Treat it as indicative only.

## Related

- [C2PA specification](https://c2pa.org/specifications/specifications/1.3/index.html)
- [`c2pa-node`](https://github.com/contentauth/c2pa-node)

## Citing

See [`CITATION.cff`](CITATION.cff).

## Licence

MIT — see [LICENSE](LICENSE).
