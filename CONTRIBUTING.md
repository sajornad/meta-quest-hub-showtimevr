# Contributing

Thanks for your interest in contributing!

## Quick start

1. Fork this repository.
2. Create a feature branch in your fork:
   - `git checkout -b feat/my-change`
3. Make your changes.
4. Run the project locally and verify it works:
   - `./run.sh`
5. Commit with a clear message.
6. Open a Pull Request (PR) back to this repository.

## Development notes

- **UI**: Vite/React (default: http://localhost:5173)
- **API**: Express/TypeScript (default: http://localhost:5179)
- Logs are streamed to the UI via **SSE** (`/api/logs/stream`).

## PR requirements

- PRs must target **`main`**.
- Expect PR review before merge.
- Keep changes focused and small when possible.

## Code style

- Prefer small, readable functions.
- Keep UI messages clear (progress labels should be short).

## Security / safety

This tool runs local shell commands (ADB). Please avoid changes that:
- execute untrusted input without validation
- expand filesystem access beyond what is needed

If you find a security issue, open an issue or contact the maintainer privately.
