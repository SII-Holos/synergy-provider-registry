import json
import sys

# Build catalog.v1.json as pure operational metadata: recommendation,
# modelsDevProviderID (alias remaps only), and fallbackModels (ID lists).
# No per-model data — models are resolved client-side from the models.dev
# source / models.json mirror, so this file never goes stale.


def rec(rank, headline, reason, defaultModel=None, cta=None):
    r = {"level": "recommended", "rank": rank, "headline": headline, "reason": reason}
    if defaultModel:
        r["defaultModel"] = defaultModel
    if cta:
        r["cta"] = cta
    return r


def provider(name, recommendation=None, modelsDevProviderID=None, fallbackModels=None):
    p = {"name": name}
    # only emit modelsDevProviderID when it remaps to a *different* source
    if modelsDevProviderID:
        p["modelsDevProviderID"] = modelsDevProviderID
    if recommendation:
        p["recommendation"] = recommendation
    if fallbackModels:
        p["fallbackModels"] = fallbackModels
    return p


providers = {
    "openai": provider(
        "OpenAI",
        recommendation=rec(
            40,
            "OpenAI Platform",
            "Use OpenAI Platform API keys for GPT models and OpenAI billing.",
            "gpt-4o",
            {
                "kind": "external",
                "label": "Create OpenAI API key",
                "url": "https://platform.openai.com/api-keys",
            },
        ),
    ),
    "openai-codex": provider(
        "OpenAI Codex",
        recommendation=rec(
            20,
            "ChatGPT/Codex subscription",
            "Connect a ChatGPT/Codex subscription for Codex-backed coding models.",
            "gpt-5.4-mini",
        ),
    ),
    "anthropic": provider(
        "Anthropic",
        recommendation=rec(
            10,
            "Claude Pro/Max or API key",
            "Connect Claude subscription OAuth or an Anthropic Platform key.",
            "claude-sonnet-4-5",
            {
                "kind": "external",
                "label": "Create Anthropic API key",
                "url": "https://console.anthropic.com/settings/keys",
            },
        ),
    ),
    "google": provider(
        "Google",
        recommendation=rec(
            50,
            "Google Gemini API",
            "Connect a Gemini API key for Google models.",
            "gemini-2.5-flash",
            {
                "kind": "external",
                "label": "Create Gemini API key",
                "url": "https://aistudio.google.com/apikey",
            },
        ),
    ),
    "github-copilot": provider(
        "GitHub Copilot",
        recommendation=rec(
            30,
            "GitHub Copilot subscription",
            "Use an existing GitHub Copilot subscription for coding-focused models.",
            "gpt-5.4-mini",
        ),
        fallbackModels=[
            "gpt-5.4",
            "gpt-5.4-mini",
            "gpt-5.3-codex",
            "claude-sonnet-4.6",
            "claude-haiku-4.5",
            "gemini-3.1-pro-preview",
        ],
    ),
    "vercel": provider(
        "Vercel AI Gateway",
        recommendation=rec(
            70,
            "Vercel AI Gateway",
            "Connect Vercel AI Gateway for model routing through Vercel.",
            "openai/gpt-4o",
            {
                "kind": "external",
                "label": "Create Vercel AI Gateway token",
                "url": "https://vercel.link/ai-gateway-token",
            },
        ),
    ),
    "openrouter": provider(
        "OpenRouter",
        recommendation=rec(
            60,
            "OpenRouter models",
            "An OpenRouter API key and user-managed credits or free-model access are required; Synergy does not provide hosted quota.",
            "openai/gpt-4o",
            {
                "kind": "external",
                "label": "Create OpenRouter API key",
                "url": "https://openrouter.ai/keys",
            },
        ),
    ),
    "minimax": provider(
        "MiniMax (OAuth)", fallbackModels=["MiniMax-M2.7", "MiniMax-M3"]
    ),
    "alibaba-coding-plan": provider(
        "Alibaba Cloud (Coding Plan)",
        fallbackModels=["qwen3-coder-plus", "qwen3.7-max"],
    ),
    "qwen-oauth": provider(
        "Qwen OAuth",
        modelsDevProviderID="alibaba",
        fallbackModels=["qwen3-coder-plus", "qwen3-max", "qwen3.7-plus"],
    ),
    "xiaomi": provider("Xiaomi MiMo", fallbackModels=["mimo-v2.5-pro", "mimo-v2-omni"]),
    "github-copilot-enterprise": provider(
        "GitHub Copilot Enterprise",
        modelsDevProviderID="github-copilot",
        fallbackModels=[
            "gpt-5.4",
            "gpt-5.4-mini",
            "gpt-5.3-codex",
            "claude-sonnet-4.6",
        ],
    ),
}

# inject the schema-required `id` from the dict key
providers = {pid: {"id": pid, **p} for pid, p in providers.items()}

catalog = {"version": 1, "providers": providers}
out = sys.argv[1] if len(sys.argv) > 1 else "catalog.v1.json"
with open(out, "w") as f:
    json.dump(catalog, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"wrote {out}: {len(providers)} providers")
