/**
 * 0G Compute — appels chat/completions via le broker (même schéma que dev3-AI-RAG/agent).
 * Nécessite @0glabs/0g-serving-broker + ethers.
 *
 * Chargement du broker uniquement dans `ensureZerogLlmClient` via `createRequire` (build
 * **CommonJS** du SDK). L’entrée ESM du paquet casse sous Node 22 ; le mode local ne
 * n’appelle pas cette fonction.
 */

import { createRequire } from "module";
import { ethers } from "ethers";

type ZerogBroker = {
  inference: {
    getServiceMetadata: (addr: string) => Promise<{ endpoint: string; model: string }>;
    listService: () => Promise<Array<{ serviceType: string; provider: string }>>;
    getRequestHeaders: (addr: string) => Promise<Record<string, string>>;
    processResponse: (addr: string, chatId: string, usageJson: string) => Promise<unknown>;
  };
};

let _broker: ZerogBroker | null = null;
let _providerAddress: string | null = null;
let _endpoint: string | null = null;
let _serviceModel: string | null = null;

export interface ZerogLlmInitOptions {
  rpcUrl?: string;
  /** Si défini, évite la découverte via listService */
  providerAddress?: string;
}

function getPrivateKey(): string | undefined {
  return process.env.LLM_0G_PRIVATE_KEY?.trim() || process.env.ZEROG_PRIVATE_KEY?.trim();
}

function getRpcUrl(opts: ZerogLlmInitOptions): string {
  return (
    opts.rpcUrl?.trim() ||
    process.env.LLM_0G_RPC_URL?.trim() ||
    process.env.ZEROG_RPC_URL?.trim() ||
    "https://evmrpc-testnet.0g.ai"
  );
}

/**
 * Initialise le broker une fois ; idempotent.
 */
export async function ensureZerogLlmClient(opts: ZerogLlmInitOptions = {}): Promise<{
  endpoint: string;
  defaultModel: string;
  providerAddress: string;
}> {
  if (_broker && _providerAddress && _endpoint && _serviceModel) {
    return {
      endpoint: _endpoint,
      defaultModel: _serviceModel,
      providerAddress: _providerAddress,
    };
  }

  const pk = getPrivateKey();
  if (!pk) {
    throw new Error(
      "0G LLM: définir ZEROG_PRIVATE_KEY ou LLM_0G_PRIVATE_KEY pour le refinement sur 0G Compute.",
    );
  }

  const rpcUrl = getRpcUrl(opts);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);

  // Forcer la build CommonJS du SDK : l’entrée ESM (`lib.esm`) est incompatible avec Node 22
  // (réexports minifiés cassés). `require` utilise `package.json` → `exports.require` → lib.commonjs.
  const require = createRequire(import.meta.url);
  const { createZGComputeNetworkBroker } = require("@0glabs/0g-serving-broker") as {
    createZGComputeNetworkBroker: (signer: ethers.Wallet) => Promise<unknown>;
  };
  _broker = (await createZGComputeNetworkBroker(wallet)) as unknown as ZerogBroker;

  const explicit = opts.providerAddress?.trim() || process.env.LLM_0G_PROVIDER_ADDRESS?.trim();

  if (explicit) {
    _providerAddress = explicit;
    const metadata = await _broker.inference.getServiceMetadata(explicit);
    _endpoint = metadata.endpoint;
    _serviceModel = metadata.model;
  } else {
    const services = await _broker.inference.listService();
    const chatbot = services.find((s) => s.serviceType === "chatbot");
    if (!chatbot) {
      throw new Error("0G LLM: aucun service chatbot trouvé (listService).");
    }
    _providerAddress = chatbot.provider;
    const metadata = await _broker.inference.getServiceMetadata(chatbot.provider);
    _endpoint = metadata.endpoint;
    _serviceModel = metadata.model;
  }

  if (!_endpoint || !_providerAddress || !_serviceModel) {
    throw new Error("0G LLM: métadonnées de service incomplètes.");
  }

  return {
    endpoint: _endpoint,
    defaultModel: _serviceModel,
    providerAddress: _providerAddress,
  };
}

export interface ZerogChatParams {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

/**
 * POST {endpoint}/chat/completions puis processResponse (facturation / vérif TEE).
 */
export async function zerogChatCompletion(params: ZerogChatParams): Promise<{
  content: string;
  modelUsed: string;
}> {
  if (!_broker || !_providerAddress || !_endpoint || !_serviceModel) {
    throw new Error("zerogChatCompletion: appeler ensureZerogLlmClient() d’abord.");
  }

  const model =
    params.model?.trim() ||
    process.env.LLM_0G_MODEL?.trim() ||
    _serviceModel;

  const headers = await _broker.inference.getRequestHeaders(_providerAddress);

  const response = await fetch(`${_endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      messages: params.messages,
      model,
      temperature: params.temperature ?? 0,
      max_tokens: params.max_tokens ?? 2048,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`0G inference HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  let chatID =
    response.headers.get("ZG-Res-Key") ||
    response.headers.get("zg-res-key") ||
    undefined;

  const data = (await response.json()) as {
    id?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: Record<string, unknown>;
  };

  chatID ??= data.id;

  const usage = data.usage ?? {};
  await _broker.inference.processResponse(
    _providerAddress,
    chatID ?? "",
    JSON.stringify(usage),
  );

  const content = data.choices?.[0]?.message?.content ?? "";
  return { content, modelUsed: model };
}

/** Pour tests — reset l’état module */
export function resetZerogLlmClientForTests(): void {
  _broker = null;
  _providerAddress = null;
  _endpoint = null;
  _serviceModel = null;
}
