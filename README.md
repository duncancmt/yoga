fhub-client
============

Fast, structured Farcaster Hub fetcher in Python with pluggable storage sinks (Parquet now, extensible to Kafka, Postgres, SQLite, Scylla). Designed for easy benchmarking and clear separation of concerns.

Highlights
- Hub client takes `--hub-url` as a parameter.
- Fetches casts, reactions, follows, and user profiles for FIDs in a range.
- Pluggable sink interface with a performant Parquet sink (partitioned by message type).
- Async, batched pipeline for high throughput; simple benchmarking tool included.
- Tooling via `uv` (fast Python package manager).

Install (with uv)
- Ensure Python 3.10+ and uv are installed: https://docs.astral.sh/uv/
- From the project root:
  - `uv sync` (core deps)
  - Optionally add extras, e.g. `uv add .[grpc]` or `uv add .[kafka]`

CLI
- `fhub fetch --hub-url <host:port> --max-fid N --parquet-dir ./data` (baseline: Parquet)
- `fhub bench --parquet-dir ./bench --records 100000` (sink-only benchmark)

Storage Sinks
- Parquet dataset (ready): `--parquet-dir <path>` writes `casts/`, `reactions/`, `follows/`, `profiles/` partitions.
- SQLite (ready): `--sqlite-path <file>` creates tables and bulk inserts.
- Kafka/Postgres/Scylla (stubs): structure provided; implement and enable with extras.

Notes on Hub Client
- The default gRPC client is scaffolded and expects Farcaster Hub gRPC stubs to be available at runtime. Mapping:
  - Casts by FID → HubService.GetCastsByFid
  - Reactions by FID → HubService.GetReactionsByFid
  - Follows by FID → Links (type: follow)
  - User profile → UserData
- If gRPC isn’t available, use the `--client mock` option for sink benchmarking and pipeline validation.

Benchmarking
- Two modes:
  1) End-to-end: real hub gRPC client + chosen sink.
  2) Sink-only: `bench` generates synthetic records to measure write throughput.

Project Layout
- `src/fhub_client/` core package
  - `models.py` Pydantic models and schemas
  - `client/` base + grpc + mock clients
  - `sinks/` base + parquet + sqlite + multi + stubs for others
  - `pipeline/fetcher.py` async orchestrator
  - `cli.py` Typer CLI

Limitations / Next Steps
- Implement real gRPC stubs: wire in protobuf-generated classes and request paging.
- Add Kafka/Postgres/Scylla sink implementations as needed.
- Expand benchmarks with configurable batch sizes and backpressure tuning.

# yoga
