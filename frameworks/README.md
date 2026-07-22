# Framework identification

How Voight identifies **which framework an agent runs on**, from public data alone. Two complementary paths:

## 1. Passive — from the job definition (no integration needed)

Every Nosana job pins its definition on IPFS, and the job account on Solana carries that CID. The definition reveals the Docker **image**, **command**, and **env keys** — enough to classify the workload and its framework. The [scanner](../indexer/scan.mjs) applies these signals:

| Framework | Signals matched (image / command / env) | Emitted as |
| --- | --- | --- |
| **ElizaOS** | `eliza` in the image, `--character` in the command, `nosship` | `elizaos` |
| **Mastra** | `mastra`, Nosana's `agent-challenge` starter images | `mastra` |
| **LangGraph / LangChain** | `langgraph`, `langchain` | `langgraph` |
| **CrewAI** | `crewai` | `crewai` |
| **Hermes** | `hermes` | `hermes` |
| **Custom agents** | `agent` in the image name (e.g. `nosana-agent-test`) | `custom` |

Everything else classifies as **GPU infra** (vLLM, Ollama, ComfyUI, TGI, Folding@home, …) or **unknown**, and unknown is *skipped*: the classifier is conservative by design, so a random training job is never listed as an "agent".

## 2. Active — from inside the agent (exact, any framework)

The [boot beacon](../examples/beacon.mjs) reports the framework explicitly via the `VOIGHT_FRAMEWORK` env var (`elizaos`, `hermes`, `openclaw`, or anything else): no guessing involved, and the agent additionally gets live observability in Voight. Active reporting always wins over passive inference.

## Making your agent identifiable

If you build agents for Nosana and want them recognized correctly:

1. **Easiest**: put your framework's name (or the word `agent`) in your Docker image name.
2. **Exact**: run the beacon with `VOIGHT_FRAMEWORK` set — four lines at boot, see [`examples/`](../examples/).
3. **Missing framework?** Open an issue or PR against the table above: adding a pattern is one line.
